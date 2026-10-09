"use client";

import { AlertTriangle, BarChart3, Check, CircleHelp, Copy, Download, GripVertical, Layers3, LockKeyhole, Plus, RotateCcw, Save, Search, Scale, Trash2, UserRound, UsersRound, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { usePortfolio } from "@/components/portfolio-provider";
import { brl, compactBrl } from "@/lib/format";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import { calculateDivision, divisionMembers, suggestDivision, type DivisionAssignment, type DivisionMemberId, type DivisionMetrics, type DivisionUnit } from "@/lib/division";

type Simulation = { id: string; name: string; updatedAt: string };
type RawRow = Record<string, unknown>;
type Destination = DivisionMemberId | "shared";

const statusLabels: Record<string, string> = {
  rented: "Alugado",
  vacant: "Desocupado",
  maintenance: "Manutenção",
  service: "Serviço",
  negotiation: "Negociação",
  for_sale: "À venda",
  sold: "Vendido",
};

function canManageDivision(role: string) {
  return role === "owner" || role === "admin" || role === "manager";
}

function isOccupied(status: string) {
  return status === "rented" || status === "for_sale";
}

function valueLabel(value: number | null) {
  return value == null ? "Valor pendente" : brl(value);
}

function assignmentLabel(assignment: DivisionAssignment) {
  if (assignment === "shared") return "Compartilhado";
  return divisionMembers.find((member) => member.id === assignment)?.name ?? "Disponível";
}

function scoreLabel(value: number | null) {
  return value == null ? "—" : `${value.toFixed(0)}%`;
}

function scoreTone(value: number | null) {
  if (value == null) return "neutral";
  if (value >= 85) return "good";
  if (value >= 65) return "attention";
  return "danger";
}

function chartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ payload?: { amount?: number; share?: number; rent?: number } }>; label?: string }) {
  if (!active || !payload?.length) return null;
  const item = payload[0]?.payload;
  return <div className="division-chart-tooltip"><strong>{label}</strong><span>{item?.share?.toFixed(1)}% do total</span><small>{brl(item?.amount ?? item?.rent ?? 0)}</small></div>;
}

export default function DivisaoPage() {
  const { organizationId, role, loading } = usePortfolio();
  const authorized = canManageDivision(role);
  const [units, setUnits] = useState<DivisionUnit[]>([]);
  const [simulations, setSimulations] = useState<Simulation[]>([]);
  const [selectedSimulationId, setSelectedSimulationId] = useState<string | null>(null);
  const [simulationName, setSimulationName] = useState("Nova divisão");
  const [assignments, setAssignments] = useState<Record<string, DivisionAssignment>>({});
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [buildingFilter, setBuildingFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [occupancyFilter, setOccupancyFilter] = useState("all");
  const [divisionFilter, setDivisionFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [keepShared, setKeepShared] = useState(true);
  const [suggestedAssignments, setSuggestedAssignments] = useState<Record<string, DivisionAssignment> | null>(null);
  const [loadingData, setLoadingData] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [staleItems, setStaleItems] = useState(0);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!organizationId || !authorized) return;
    let active = true;
    async function load() {
      const supabase = createSupabaseBrowserClient();
      if (!supabase) { if (active) { setLoadingData(false); setError("O ambiente do banco de dados não está configurado."); } return; }
      setLoadingData(true); setError("");
      const [assetsResult, buildingsResult, unitsResult, simulationsResult] = await Promise.all([
        supabase.from("assets").select("id, name").eq("organization_id", organizationId),
        supabase.from("buildings").select("id, asset_id, status").eq("organization_id", organizationId),
        supabase.from("property_units").select("id, building_id, code, unit_type, estimated_value, potential_rent, status, quantity").eq("organization_id", organizationId).order("code"),
        supabase.from("division_simulations").select("id, name, updated_at").eq("organization_id", organizationId).order("updated_at", { ascending: false }),
      ]);
      const firstError = [assetsResult, buildingsResult, unitsResult, simulationsResult].find((result) => result.error)?.error;
      if (firstError) { if (active) { setLoadingData(false); setError(firstError.message.includes("division_simulations") ? "A estrutura de simulações ainda não foi ativada no banco de dados." : firstError.message); } return; }
      const assetNames = new Map(((assetsResult.data ?? []) as RawRow[]).map((asset) => [String(asset.id), String(asset.name ?? "Prédio")]));
      const activeBuildings = new Map(((buildingsResult.data ?? []) as RawRow[]).filter((building) => String(building.status) !== "sold").map((building) => [String(building.id), { assetId: String(building.asset_id ?? ""), name: assetNames.get(String(building.asset_id ?? "")) ?? "Prédio" }]));
      const mappedUnits = ((unitsResult.data ?? []) as RawRow[]).filter((unit) => activeBuildings.has(String(unit.building_id)) && String(unit.status) !== "sold").map((unit): DivisionUnit => {
        const numericValue = unit.estimated_value == null ? null : Number(unit.estimated_value);
        return { id: String(unit.id), buildingId: String(unit.building_id), buildingName: activeBuildings.get(String(unit.building_id))?.name ?? "Prédio", code: String(unit.code ?? "Unidade"), type: String(unit.unit_type ?? "Unidade"), value: numericValue != null && Number.isFinite(numericValue) && numericValue > 0 ? numericValue : null, rent: Math.max(0, Number(unit.potential_rent ?? 0)), status: String(unit.status ?? "vacant"), quantity: Math.max(1, Number(unit.quantity ?? 1)) };
      });
      const mappedSimulations = ((simulationsResult.data ?? []) as RawRow[]).map((simulation) => ({ id: String(simulation.id), name: String(simulation.name ?? "Divisão"), updatedAt: String(simulation.updated_at ?? "") }));
      const initial = mappedSimulations[0];
      const initialAssignments: Record<string, DivisionAssignment> = {};
      let initialStale = 0;
      if (initial) {
        const itemsResult = await supabase.from("division_simulation_items").select("unit_id, assignment").eq("simulation_id", initial.id);
        if (itemsResult.error) { if (active) { setLoadingData(false); setError(itemsResult.error.message); } return; }
        const unitIds = new Set(mappedUnits.map((unit) => unit.id));
        for (const item of (itemsResult.data ?? []) as RawRow[]) {
          const unitId = item.unit_id ? String(item.unit_id) : "";
          if (!unitId || !unitIds.has(unitId)) { initialStale += 1; continue; }
          initialAssignments[unitId] = String(item.assignment) as DivisionAssignment;
        }
      }
      if (!active) return;
      setUnits(mappedUnits); setSimulations(mappedSimulations); setSelectedSimulationId(initial?.id ?? null); setSimulationName(initial?.name ?? `Divisão ${mappedSimulations.length + 1}`); setAssignments(initialAssignments); setStaleItems(initialStale); setDirty(false); setLoadingData(false);
    }
    void load();
    return () => { active = false; };
  }, [authorized, organizationId]);

  const metrics = useMemo(() => calculateDivision(units, assignments), [assignments, units]);
  const buildingOptions = useMemo(() => [...new Map(units.map((unit) => [unit.buildingId, unit.buildingName])).entries()], [units]);
  const typeOptions = useMemo(() => [...new Set(units.map((unit) => unit.type))].sort((left, right) => left.localeCompare(right)), [units]);
  const visibleUnits = useMemo(() => units.filter((unit) => {
    const assignment = assignments[unit.id] ?? null;
    const textMatches = `${unit.buildingName} ${unit.code} ${unit.type}`.toLowerCase().includes(query.toLowerCase());
    const buildingMatches = buildingFilter === "all" || unit.buildingId === buildingFilter;
    const typeMatches = typeFilter === "all" || unit.type === typeFilter;
    const occupancyMatches = occupancyFilter === "all" || (occupancyFilter === "occupied" ? isOccupied(unit.status) : !isOccupied(unit.status));
    const divisionMatches = divisionFilter === "all" || (divisionFilter === "available" ? !assignment : divisionFilter === "shared" ? assignment === "shared" : Boolean(assignment) && assignment !== "shared");
    return textMatches && buildingMatches && typeMatches && occupancyMatches && divisionMatches;
  }), [assignments, buildingFilter, divisionFilter, occupancyFilter, query, typeFilter, units]);
  const assignedByDestination = useMemo(() => {
    const result: Record<Destination, DivisionUnit[]> = { paulo: [], pedro: [], aurora: [], carlos: [], shared: [] };
    for (const unit of units) { const assignment = assignments[unit.id]; if (assignment) result[assignment].push(unit); }
    return result;
  }, [assignments, units]);
  const propertyChart = metrics.members.map((member) => ({ name: member.name, share: member.share, amount: member.value, color: member.color }));
  const incomeChart = metrics.members.map((member) => ({ name: member.name, share: metrics.totalRent > 0 ? (member.rent / metrics.totalRent) * 100 : 0, rent: member.rent, color: member.color }));

  function updateAssignment(unitId: string, assignment: DivisionAssignment) {
    setAssignments((current) => ({ ...current, [unitId]: assignment })); setDirty(true); setSelectedUnitId(null); setMessage(assignment ? `${units.find((unit) => unit.id === unitId)?.code ?? "Unidade"} atribuído a ${assignmentLabel(assignment)}.` : "Unidade removida da distribuição.");
  }

  function dropOn(destination: Destination, event?: React.DragEvent) {
    event?.preventDefault();
    const unitId = draggingId ?? event?.dataTransfer.getData("text/plain");
    if (unitId) updateAssignment(unitId, destination);
    setDraggingId(null);
  }

  async function loadSimulation(id: string, shouldConfirm = true) {
    if (shouldConfirm && dirty && !window.confirm("Há alterações não salvas. Trocar de simulação e descartá-las?")) return;
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;
    const result = await supabase.from("division_simulation_items").select("unit_id, assignment").eq("simulation_id", id);
    if (result.error) { setError(result.error.message); return; }
    const available = new Set(units.map((unit) => unit.id));
    const next: Record<string, DivisionAssignment> = {}; let stale = 0;
    for (const item of (result.data ?? []) as RawRow[]) { const unitId = item.unit_id ? String(item.unit_id) : ""; if (!unitId || !available.has(unitId)) stale += 1; else next[unitId] = String(item.assignment) as DivisionAssignment; }
    const simulation = simulations.find((item) => item.id === id);
    setSelectedSimulationId(id); setSimulationName(simulation?.name ?? "Divisão"); setAssignments(next); setStaleItems(stale); setDirty(false); setMessage("Simulação carregada."); setError("");
  }

  function startNewSimulation() {
    if (dirty && !window.confirm("Há alterações não salvas. Criar uma nova simulação?")) return;
    setSelectedSimulationId(null); setSimulationName(`Divisão ${simulations.length + 1}`); setAssignments({}); setStaleItems(0); setDirty(false); setMessage("Nova simulação pronta para planejamento.");
  }

  async function persistScenario(id: string | null, name: string) {
    const supabase = createSupabaseBrowserClient();
    if (!supabase || !organizationId) throw new Error("Sessão indisponível.");
    const cleanName = name.trim() || "Divisão sem nome";
    let scenarioId = id;
    if (scenarioId) {
      const update = await supabase.from("division_simulations").update({ name: cleanName }).eq("id", scenarioId).eq("organization_id", organizationId);
      if (update.error) throw update.error;
    } else {
      const user = (await supabase.auth.getUser()).data.user;
      const insert = await supabase.from("division_simulations").insert({ organization_id: organizationId, name: cleanName, created_by: user?.id }).select("id").single();
      if (insert.error || !insert.data) throw insert.error ?? new Error("Não foi possível criar a simulação.");
      scenarioId = String(insert.data.id);
    }
    const remove = await supabase.from("division_simulation_items").delete().eq("simulation_id", scenarioId).eq("organization_id", organizationId);
    if (remove.error) throw remove.error;
    const rows = units.filter((unit) => assignments[unit.id]).map((unit) => ({ simulation_id: scenarioId, organization_id: organizationId, unit_id: unit.id, assignment: assignments[unit.id], unit_code: unit.code, building_name: unit.buildingName, value_snapshot: unit.value ?? 0, rent_snapshot: unit.rent }));
    if (rows.length) { const insertItems = await supabase.from("division_simulation_items").insert(rows); if (insertItems.error) throw insertItems.error; }
    return { id: scenarioId, name: cleanName };
  }

  async function saveCurrent() {
    if (saving) return;
    setSaving(true); setError("");
    try {
      const result = await persistScenario(selectedSimulationId, simulationName);
      const next = { id: String(result.id), name: result.name, updatedAt: new Date().toISOString() };
      setSelectedSimulationId(next.id); setSimulationName(next.name); setSimulations((current) => [next, ...current.filter((item) => item.id !== next.id)]); setDirty(false); setMessage("Simulação salva com sucesso.");
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : "Não foi possível salvar a simulação."); }
    setSaving(false);
  }

  async function duplicateCurrent() {
    if (saving) return;
    setSaving(true); setError("");
    try {
      const result = await persistScenario(null, `${simulationName.trim() || "Divisão"} · cópia`);
      const next = { id: String(result.id), name: result.name, updatedAt: new Date().toISOString() };
      setSelectedSimulationId(next.id); setSimulationName(next.name); setSimulations((current) => [next, ...current]); setDirty(false); setMessage("Simulação duplicada.");
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : "Não foi possível duplicar a simulação."); }
    setSaving(false);
  }

  async function deleteCurrent() {
    if (!selectedSimulationId || !organizationId || !window.confirm("Excluir esta simulação? Esta ação não altera os imóveis originais.")) return;
    const supabase = createSupabaseBrowserClient(); if (!supabase) return;
    const result = await supabase.from("division_simulations").delete().eq("id", selectedSimulationId).eq("organization_id", organizationId);
    if (result.error) { setError(result.error.message); return; }
    const nextList = simulations.filter((item) => item.id !== selectedSimulationId); const next = nextList[0];
    setSimulations(nextList); setSelectedSimulationId(next?.id ?? null); setSimulationName(next?.name ?? `Divisão ${nextList.length + 1}`); setAssignments({}); setDirty(false); setMessage("Simulação excluída.");
    if (next) void loadSimulation(next.id, false);
  }

  async function restoreCurrent() {
    if (selectedSimulationId) await loadSimulation(selectedSimulationId, false);
  }

  function clearCurrent() {
    if (!window.confirm("Limpar toda a distribuição atual? A última versão salva continuará disponível para restauração.")) return;
    setAssignments({}); setDirty(true); setSelectedUnitId(null); setMessage("Distribuição limpa. Salve para registrar este estado.");
  }

  function suggest() {
    setSuggestedAssignments(suggestDivision(units, assignments, keepShared)); setMessage("Proposta pronta para revisão. Nada foi alterado ainda.");
  }

  if (loading || loadingData) return <div className="content"><div className="empty-state"><Scale size={28} /><p>Carregando a central de divisão...</p></div></div>;
  if (!authorized) return <div className="content"><div className="access-gate-card panel division-access-card"><LockKeyhole size={27} /><h2>Acesso restrito</h2><p>A Divisão Patrimonial está disponível apenas para gestores e administradores da holding.</p></div></div>;
  if (error && !units.length) return <div className="content"><div className="empty-state"><AlertTriangle size={28} /><h3>Não foi possível abrir a Divisão</h3><p>{error}</p></div></div>;

  return <div className="content division-page">
    <div className="page-heading division-heading"><div><div className="eyebrow"><Scale size={13} /> Planejamento patrimonial</div><h1>Divisão</h1><p className="subtitle">Distribua unidades em cenários de planejamento sem alterar a titularidade real dos imóveis.</p></div><div className="page-heading-actions"><button className="button button-ghost" onClick={suggest} disabled={!units.length}><BarChart3 size={14} /> Sugerir divisão equilibrada</button><button className="button button-primary" onClick={() => void saveCurrent()} disabled={saving}>{saving ? "Salvando…" : <><Save size={14} /> Salvar simulação</>}</button></div></div>
    <div className="division-toolbar panel"><div className="division-scenario-select"><label htmlFor="division-scenario">Simulação ativa</label><select id="division-scenario" value={selectedSimulationId ?? "new"} onChange={(event) => event.target.value === "new" ? startNewSimulation() : void loadSimulation(event.target.value)}><option value="new">Nova simulação</option>{simulations.map((simulation) => <option value={simulation.id} key={simulation.id}>{simulation.name}</option>)}</select></div><label className="division-name-field"><span>Nome do cenário</span><input value={simulationName} onChange={(event) => { setSimulationName(event.target.value); setDirty(true); }} placeholder="Ex.: Divisão 01 — Equilíbrio patrimonial" /></label><div className="division-toolbar-actions"><button className="icon-btn" onClick={() => void duplicateCurrent()} title="Duplicar simulação" aria-label="Duplicar simulação"><Copy size={15} /></button><button className="icon-btn" onClick={() => void restoreCurrent()} disabled={!selectedSimulationId} title="Restaurar última versão salva" aria-label="Restaurar última versão salva"><RotateCcw size={15} /></button><button className="icon-btn" onClick={clearCurrent} title="Limpar distribuição" aria-label="Limpar distribuição"><Trash2 size={15} /></button>{selectedSimulationId && <button className="icon-btn danger-icon" onClick={() => void deleteCurrent()} title="Excluir simulação" aria-label="Excluir simulação"><X size={16} /></button>}</div></div>
    {error && <div className="division-alert error"><AlertTriangle size={14} /> {error}</div>}{message && <div className="division-alert"><Check size={14} /> {message}</div>}{staleItems > 0 && <div className="division-alert warning"><AlertTriangle size={14} /> {staleItems} unidade(s) salvas nesta simulação não estão mais no cadastro atual. Elas foram mantidas apenas como histórico e não entram nos cálculos.</div>}
    <div className="metrics division-metrics"><DivisionMetric title="Patrimônio total da holding" value={compactBrl(metrics.totalValue)} foot={`${units.length} unidades · ${metrics.unitsWithoutValue} sem avaliação`} icon={<Layers3 size={15} />} /><DivisionMetric title="Patrimônio distribuído" value={compactBrl(metrics.distributedValue)} foot={`${metrics.distributedUnits} unidades atribuídas`} icon={<Check size={15} />} /><DivisionMetric title="Patrimônio pendente" value={compactBrl(metrics.pendingValue)} foot={`${metrics.pendingUnits} unidades aguardando`} icon={<AlertTriangle size={15} />} /><DivisionMetric title="Renda mensal prevista" value={brl(metrics.totalRent)} foot="Valor cadastrado, inclusive desocupados" icon={<BarChart3 size={15} />} /><DivisionMetric title="Meta patrimonial por membro" value={compactBrl(metrics.memberTargetValue)} foot="25% do patrimônio conhecido" icon={<Scale size={15} />} /><DivisionMetric title="Meta de renda por membro" value={brl(metrics.memberTargetRent)} foot="25% da renda mensal prevista" icon={<UsersRound size={15} />} /></div>
    <div className="division-workspace"><section className="panel division-inventory"><div className="panel-heading"><div><h2>Unidades disponíveis</h2><p>Selecione por clique ou arraste para um destino.</p></div><span className="division-counter">{visibleUnits.length} de {units.length}</span></div><div className="division-filters"><label className="division-search"><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar imóvel ou unidade" /></label><select value={buildingFilter} onChange={(event) => setBuildingFilter(event.target.value)} aria-label="Filtrar prédio"><option value="all">Todos os prédios</option>{buildingOptions.map(([id, name]) => <option value={id} key={id}>{name}</option>)}</select><select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} aria-label="Filtrar tipo"><option value="all">Todos os tipos</option>{typeOptions.map((type) => <option value={type} key={type}>{type}</option>)}</select><select value={occupancyFilter} onChange={(event) => setOccupancyFilter(event.target.value)} aria-label="Filtrar situação"><option value="all">Todas as situações</option><option value="occupied">Alugados</option><option value="vacant">Desocupados</option></select><select value={divisionFilter} onChange={(event) => setDivisionFilter(event.target.value)} aria-label="Filtrar status da divisão"><option value="all">Todos os status</option><option value="available">Disponíveis</option><option value="distributed">Distribuídos</option><option value="shared">Compartilhados</option></select></div><div className="division-inventory-list">{visibleUnits.length ? visibleUnits.map((unit) => <InventoryCard key={unit.id} unit={unit} assignment={assignments[unit.id] ?? null} selected={selectedUnitId === unit.id} onSelect={() => setSelectedUnitId((current) => current === unit.id ? null : unit.id)} onDragStart={(event) => { setDraggingId(unit.id); event.dataTransfer.setData("text/plain", unit.id); }} />) : <div className="division-empty"><Search size={21} /><p>Nenhuma unidade corresponde aos filtros atuais.</p></div>}</div>{selectedUnitId && <div className="division-selection-bar"><span><Check size={14} /> Unidade selecionada: <strong>{units.find((unit) => unit.id === selectedUnitId)?.code}</strong></span><button className="icon-btn" onClick={() => setSelectedUnitId(null)} aria-label="Cancelar seleção"><X size={15} /></button></div>}</section><section className="division-board"><div className="division-board-heading"><div><h2>Destinos da divisão</h2><p>{selectedUnitId ? "Escolha uma caixa para atribuir a unidade selecionada." : "Arraste unidades entre as caixas para reorganizar o cenário."}</p></div><span className="division-board-legend"><span className="legend-dot" /> Atualização instantânea</span></div><div className="division-destinations">{divisionMembers.map((member) => <DestinationCard key={member.id} destination={member.id} units={assignedByDestination[member.id]} metrics={metrics} selectedUnitId={selectedUnitId} draggingId={draggingId} onDrop={dropOn} onSelectDestination={() => selectedUnitId && updateAssignment(selectedUnitId, member.id)} onDragStart={(event, unitId) => { setDraggingId(unitId); event.dataTransfer.setData("text/plain", unitId); }} onRemove={(unitId) => updateAssignment(unitId, null)} />)}<DestinationCard destination="shared" units={assignedByDestination.shared} metrics={metrics} selectedUnitId={selectedUnitId} draggingId={draggingId} onDrop={dropOn} onSelectDestination={() => selectedUnitId && updateAssignment(selectedUnitId, "shared")} onDragStart={(event, unitId) => { setDraggingId(unitId); event.dataTransfer.setData("text/plain", unitId); }} onRemove={(unitId) => updateAssignment(unitId, null)} /></div></section></div>
    <section className="panel division-balance-panel"><div className="panel-heading"><div><h2>Equilíbrio da divisão</h2><p>Desvio médio absoluto de cada membro em relação à meta de 25%. Quanto maior, mais próximo do equilíbrio.</p></div><div className={`division-score ${scoreTone(metrics.consolidatedBalance)}`}><small>Consolidado · 50% patrimônio + 50% renda</small><strong>{scoreLabel(metrics.consolidatedBalance)}</strong></div></div><div className="division-balance-grid"><BalanceScore label="Equilíbrio patrimonial" score={metrics.propertyBalance} target={metrics.memberTargetValue} value={brl(metrics.memberTargetValue)} /><BalanceScore label="Equilíbrio de renda" score={metrics.incomeBalance} target={metrics.memberTargetRent} value={brl(metrics.memberTargetRent)} /></div><details className="division-methodology"><summary><CircleHelp size={14} /> Como o indicador é calculado</summary><p>Para cada dimensão, calculamos o desvio percentual absoluto de cada membro em relação à meta de 25%, fazemos a média e aplicamos <strong>100 − desvio médio</strong>, limitado entre 0% e 100%. O consolidado usa pesos iguais entre patrimônio e renda. Imóveis compartilhados entram com 25% em cada membro.</p></details></section>
    <section className="division-comparison-grid"><ChartPanel title="Patrimônio por membro" subtitle="Participação no patrimônio distribuído e compartilhado." data={propertyChart} dataKey="share" valueKey="amount" /><ChartPanel title="Renda mensal por membro" subtitle="Participação na renda mensal prevista." data={incomeChart} dataKey="share" valueKey="rent" /></section>
    <section className="panel division-table-panel"><div className="panel-heading"><div><h2>Comparativo entre membros</h2><p>Valores individuais já incorporam a fração de 25% dos imóveis compartilhados.</p></div></div><div className="table-wrap"><table className="division-table"><thead><tr><th>Membro</th><th>Patrimônio</th><th>% do total</th><th>Diferença da meta</th><th>Renda mensal</th><th>Diferença da meta</th></tr></thead><tbody>{metrics.members.map((member) => <tr key={member.id}><td><span className="division-member-name"><span className="member-color" style={{ background: member.color }} />{member.name}</span></td><td><strong>{brl(member.value)}</strong></td><td>{member.share.toFixed(1)}%</td><td className={member.valueDifference >= 0 ? "positive" : "negative"}>{member.valueDifference >= 0 ? "+" : "−"}{brl(Math.abs(member.valueDifference))}</td><td><strong>{brl(member.rent)}</strong></td><td className={member.rentDifference >= 0 ? "positive" : "negative"}>{member.rentDifference >= 0 ? "+" : "−"}{brl(Math.abs(member.rentDifference))}</td></tr>)}</tbody></table></div></section>
    {suggestedAssignments && <div className="modal-backdrop"><div className="edit-modal division-suggestion-modal"><div className="panel-heading"><div><div className="eyebrow"><BarChart3 size={13} /> Proposta automática</div><h2>Aplicar sugestão equilibrada?</h2><p>A proposta reorganiza unidades individuais usando patrimônio, renda e quantidade. O que já está compartilhado {keepShared ? "será mantido compartilhado" : "também poderá ser redistribuído"}.</p></div><button className="icon-btn" onClick={() => setSuggestedAssignments(null)} aria-label="Fechar"><X size={16} /></button></div><div className="suggestion-preview"><SuggestionPreview label="Estado atual" metrics={metrics} /><SuggestionPreview label="Após a sugestão" metrics={calculateDivision(units, suggestedAssignments)} /></div><div className="division-suggestion-options"><label className="checkbox-field"><input type="checkbox" checked={keepShared} onChange={(event) => { const nextKeepShared = event.target.checked; setKeepShared(nextKeepShared); setSuggestedAssignments(suggestDivision(units, assignments, nextKeepShared)); }} /> Manter imóveis compartilhados fixos</label></div><div className="onboarding-actions"><button className="button button-ghost" onClick={() => setSuggestedAssignments(null)}>Cancelar</button><button className="button button-primary" onClick={() => { setAssignments(suggestedAssignments); setSuggestedAssignments(null); setDirty(true); setMessage("Sugestão aplicada. Revise e salve quando estiver pronto."); }}><Check size={14} /> Aplicar proposta</button></div></div></div>}
  </div>;
}

function DivisionMetric({ title, value, foot, icon }: { title: string; value: string; foot: string; icon: React.ReactNode }) {
  return <div className="metric-card"><div className="metric-top"><span>{title}</span><span className="metric-icon">{icon}</span></div><div className="metric-value">{value}</div><div className="metric-foot">{foot}</div></div>;
}

function InventoryCard({ unit, assignment, selected, onSelect, onDragStart }: { unit: DivisionUnit; assignment: DivisionAssignment; selected: boolean; onSelect: () => void; onDragStart: (event: React.DragEvent<HTMLDivElement>) => void }) {
  return <div className={`division-unit-card ${selected ? "selected" : ""} ${assignment ? "assigned" : ""}`} draggable onDragStart={onDragStart} onClick={onSelect} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(); } }} role="button" tabIndex={0} aria-pressed={selected}><div className="division-unit-icon"><GripVertical size={14} /></div><div className="division-unit-main"><strong>{unit.code}</strong><span>{unit.buildingName} · {unit.type}{unit.quantity > 1 ? ` · ${unit.quantity} un.` : ""}</span><small><span className={`division-status status-${isOccupied(unit.status) ? "occupied" : "vacant"}`} /> {statusLabels[unit.status] ?? unit.status}</small></div><div className="division-unit-values"><strong className={unit.value == null ? "division-pending-value" : ""}>{valueLabel(unit.value)}</strong><small>{brl(unit.rent)}/mês</small></div>{assignment && <span className={`division-assignment-tag ${assignment === "shared" ? "shared" : ""}`}>{assignmentLabel(assignment)}</span>}</div>;
}

function DestinationCard({ destination, units, metrics, selectedUnitId, onDrop, onSelectDestination, onDragStart, onRemove }: { destination: Destination; units: DivisionUnit[]; metrics: DivisionMetrics; selectedUnitId: string | null; draggingId: string | null; onDrop: (destination: Destination, event: React.DragEvent<HTMLDivElement>) => void; onSelectDestination: () => void; onDragStart: (event: React.DragEvent<HTMLDivElement>, unitId: string) => void; onRemove: (unitId: string) => void }) {
  const member = destination === "shared" ? null : divisionMembers.find((item) => item.id === destination);
  const memberTotals = member ? metrics.members.find((item) => item.id === member.id) : null;
  const unitCount = units.reduce((sum, unit) => sum + unit.quantity, 0);
  const value = destination === "shared" ? units.reduce((sum, unit) => sum + (unit.value ?? 0), 0) : memberTotals?.value ?? 0;
  const rent = destination === "shared" ? units.reduce((sum, unit) => sum + unit.rent, 0) : memberTotals?.rent ?? 0;
  return <div className={`division-destination ${destination === "shared" ? "shared-destination" : ""}`} onDragOver={(event) => event.preventDefault()} onDrop={(event) => onDrop(destination, event)}><div className="division-destination-heading"><div className="division-destination-title"><span className="destination-avatar" style={{ background: member?.color ?? "#f0be4a" }}>{member ? <UserRound size={15} /> : <UsersRound size={15} />}</span><div><strong>{member ? `Membro · ${member.name}` : "Todos · Patrimônio compartilhado"}</strong><small>{member ? "Participação individual" : "25% para cada membro"}</small></div></div>{selectedUnitId && <button className="button button-small button-ghost" onClick={onSelectDestination}><Plus size={12} /> Adicionar</button>}</div><div className="division-destination-stats"><span><small>Unidades</small><strong>{unitCount}</strong></span><span><small>Patrimônio</small><strong>{brl(value)}</strong></span><span><small>Renda mensal</small><strong>{brl(rent)}</strong></span><span><small>Renda anual</small><strong>{brl(rent * 12)}</strong></span></div><div className="division-drop-list">{units.length ? units.map((unit) => <div className="division-assigned-card" key={unit.id} draggable onDragStart={(event) => onDragStart(event, unit.id)}><GripVertical size={13} /><div><strong>{unit.code}</strong><small>{unit.buildingName} · {unit.type}</small></div><span>{unit.value == null ? "—" : compactBrl(unit.value)}</span><button className="icon-btn" onClick={(event) => { event.stopPropagation(); onRemove(unit.id); }} aria-label={`Remover ${unit.code}`}><X size={13} /></button></div>) : <div className="division-drop-placeholder"><Download size={16} /><span>Solte uma unidade aqui</span></div>}</div></div>;
}

function BalanceScore({ label, score, target, value }: { label: string; score: number | null; target: number; value: string }) {
  return <div className="division-balance-card"><div><span>{label}</span><small>Meta individual: {value}</small></div><strong className={scoreTone(score)}>{scoreLabel(score)}</strong><div className="division-progress"><span className={scoreTone(score)} style={{ width: `${score ?? 0}%` }} /></div><small>{target > 0 ? "Comparação com 25% do total conhecido." : "Cadastre valores para gerar o indicador."}</small></div>;
}

function ChartPanel({ title, subtitle, data, dataKey, valueKey }: { title: string; subtitle: string; data: Array<{ name: string; share: number; amount?: number; rent?: number; color: string }>; dataKey: "share"; valueKey: "amount" | "rent" }) {
  return <div className="panel division-chart-panel"><div className="panel-heading"><div><h2>{title}</h2><p>{subtitle}</p></div><span className="chart-reference">Meta 25%</span></div><div className="division-chart"><ResponsiveContainer width="100%" height={235}><BarChart layout="vertical" data={data} margin={{ top: 8, right: 20, left: 4, bottom: 8 }}><CartesianGrid stroke="rgba(176,196,219,.1)" horizontal={false} /><XAxis type="number" domain={[0, 100]} tickFormatter={(value) => `${value}%`} tick={{ fill: "#8490a5", fontSize: 10 }} axisLine={false} tickLine={false} /><YAxis type="category" dataKey="name" width={55} tick={{ fill: "#edf3fb", fontSize: 11 }} axisLine={false} tickLine={false} /><Tooltip cursor={{ fill: "rgba(128,226,176,.05)" }} content={chartTooltip} /><ReferenceLine x={25} stroke="#80e2b0" strokeDasharray="4 4" label={{ value: "25%", position: "top", fill: "#80e2b0", fontSize: 10 }} /><Bar dataKey={dataKey} radius={[0, 5, 5, 0]} barSize={22}>{data.map((item) => <Cell key={item.name} fill={item.color} />)}</Bar></BarChart></ResponsiveContainer></div><div className="chart-values">{data.map((item) => <span key={item.name}><i style={{ background: item.color }} />{item.name}: {brl(item[valueKey] ?? 0)}</span>)}</div></div>;
}

function SuggestionPreview({ label, metrics }: { label: string; metrics: DivisionMetrics }) {
  return <div className="suggestion-preview-card"><span>{label}</span><strong>{scoreLabel(metrics.consolidatedBalance)}</strong><small>Patrimônio {scoreLabel(metrics.propertyBalance)} · Renda {scoreLabel(metrics.incomeBalance)}</small></div>;
}
