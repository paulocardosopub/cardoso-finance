"use client";

import { AlertTriangle, ArrowRightLeft, BarChart3, Check, CircleHelp, Copy, Download, GripVertical, Layers3, LockKeyhole, Plus, RotateCcw, Save, Search, Scale, Trash2, UserRound, UsersRound, X } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { usePortfolio } from "@/components/portfolio-provider";
import { brl, compactBrl } from "@/lib/format";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import { calculateDivision, divisionMembers, suggestDivision, type DivisionAssignment, type DivisionMemberId, type DivisionMetrics, type DivisionSuggestionPriorities, type DivisionUnit } from "@/lib/division";

type Simulation = { id: string; name: string; updatedAt: string; allocationMode: "unit" | "building" };
type RawRow = Record<string, unknown>;
type Destination = DivisionMemberId | "shared";
type TransferContextValue = {
  open: (source: DivisionMemberId) => void;
  source: DivisionMemberId | null;
  target: DivisionMemberId | null;
  setTarget: (target: DivisionMemberId) => void;
  cancel: () => void;
  confirm: () => void;
  sourceUnitCount: number;
  targetUnitCount: number;
};
const TransferContext = createContext<TransferContextValue | null>(null);

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

function buildingDivisionState(units: DivisionUnit[], assignments: Record<string, DivisionAssignment>) {
  if (units.every((unit) => !assignments[unit.id])) return "available";
  if (units.every((unit) => assignments[unit.id] === "shared")) return "shared";
  return "distributed";
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

function positiveNumber(value: unknown) {
  const numeric = value == null ? null : Number(value);
  return numeric != null && Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function buildingValueOf(units: DivisionUnit[]) {
  const sourceValue = units.find((unit) => unit.buildingValue != null)?.buildingValue ?? null;
  return sourceValue ?? units.reduce((sum, unit) => sum + (unit.value ?? 0), 0);
}

function mapDivisionUnits(assets: RawRow[], buildings: RawRow[], sourceUnits: RawRow[], leases: RawRow[]) {
  const assetById = new Map(assets.map((asset) => [String(asset.id), asset]));
  const leasesByUnit = new Map<string, RawRow>();
  const leasePriority: Record<string, number> = { active: 0, ending: 1, draft: 2 };
  for (const lease of leases) {
    const unitId = lease.unit_id ? String(lease.unit_id) : "";
    if (!unitId) continue;
    const previous = leasesByUnit.get(unitId);
    if (!previous || (leasePriority[String(lease.status)] ?? 99) < (leasePriority[String(previous.status)] ?? 99)) leasesByUnit.set(unitId, lease);
  }
  const activeBuildings = new Map<string, { name: string; value: number | null }>();
  for (const building of buildings) {
    if (String(building.status) === "sold") continue;
    const asset = assetById.get(String(building.asset_id ?? ""));
    activeBuildings.set(String(building.id), {
      name: String(asset?.name ?? "Prédio"),
      value: positiveNumber(building.current_value) ?? positiveNumber(asset?.current_value),
    });
  }
  const mappedUnits = sourceUnits.filter((unit) => activeBuildings.has(String(unit.building_id)) && String(unit.status) !== "sold").map((unit): DivisionUnit => {
    const building = activeBuildings.get(String(unit.building_id))!;
    const lease = leasesByUnit.get(String(unit.id));
    const individualValue = positiveNumber(unit.estimated_value);
    const rent = lease?.current_rent ?? unit.potential_rent;
    return {
      id: String(unit.id), buildingId: String(unit.building_id), buildingName: building.name, buildingValue: building.value,
      code: String(unit.code ?? "Unidade"), type: String(unit.unit_type ?? "Unidade"), value: individualValue,
      rent: Math.max(0, Number(rent ?? 0)), status: String(unit.status ?? "vacant"), quantity: Math.max(1, Number(unit.quantity ?? 1)),
    };
  });
  const unitsByBuilding = new Map<string, DivisionUnit[]>();
  for (const unit of mappedUnits) unitsByBuilding.set(unit.buildingId, [...(unitsByBuilding.get(unit.buildingId) ?? []), unit]);
  for (const buildingUnits of unitsByBuilding.values()) {
    const currentBuildingValue = buildingUnits[0]?.buildingValue ?? null;
    if (currentBuildingValue == null) continue;
    const totalIndividualValue = buildingUnits.reduce((sum, unit) => sum + (unit.value ?? 0), 0);
    const hasCompleteIndividualValues = buildingUnits.every((unit) => (unit.value ?? 0) > 0);
    const totalQuantity = buildingUnits.reduce((sum, unit) => sum + unit.quantity, 0);
    for (const unit of buildingUnits) {
      const weight = hasCompleteIndividualValues && totalIndividualValue > 0 ? (unit.value ?? 0) / totalIndividualValue : unit.quantity / totalQuantity;
      unit.value = currentBuildingValue * weight;
    }
  }
  return mappedUnits;
}

function calculationModel(units: DivisionUnit[], assignments: Record<string, DivisionAssignment>, mode: "unit" | "building") {
  if (mode === "unit") return { units, assignments };
  const grouped = new Map<string, DivisionUnit[]>();
  for (const unit of units) grouped.set(unit.buildingId, [...(grouped.get(unit.buildingId) ?? []), unit]);
  const calculationUnits: DivisionUnit[] = [];
  const calculationAssignments: Record<string, DivisionAssignment> = {};
  for (const [buildingId, buildingUnits] of grouped) {
    const id = `building:${buildingId}`;
    const firstAssignment = assignments[buildingUnits[0]?.id] ?? null;
    const sameAssignment = buildingUnits.every((unit) => (assignments[unit.id] ?? null) === firstAssignment);
    const value = buildingValueOf(buildingUnits);
    calculationUnits.push({
      id, buildingId, buildingName: buildingUnits[0]?.buildingName ?? "Prédio", buildingValue: value,
      code: buildingUnits[0]?.buildingName ?? "Prédio", type: "Imóvel", value: value || null,
      rent: buildingUnits.reduce((sum, unit) => sum + unit.rent, 0), status: buildingUnits[0]?.status ?? "vacant",
      quantity: buildingUnits.reduce((sum, unit) => sum + unit.quantity, 0),
    });
    calculationAssignments[id] = sameAssignment ? firstAssignment : null;
  }
  return { units: calculationUnits, assignments: calculationAssignments };
}

function expandCalculationAssignments(units: DivisionUnit[], assignments: Record<string, DivisionAssignment>, mode: "unit" | "building") {
  if (mode === "unit") return assignments;
  return Object.fromEntries(units.map((unit) => [unit.id, assignments[`building:${unit.buildingId}`] ?? null]));
}

export default function DivisaoPage() {
  const { organizationId, role, loading } = usePortfolio();
  const authorized = canManageDivision(role);
  const [units, setUnits] = useState<DivisionUnit[]>([]);
  const [simulations, setSimulations] = useState<Simulation[]>([]);
  const [selectedSimulationId, setSelectedSimulationId] = useState<string | null>(null);
  const [simulationName, setSimulationName] = useState("Nova divisão");
  const [assignments, setAssignments] = useState<Record<string, DivisionAssignment>>({});
  const [selectedInventoryId, setSelectedInventoryId] = useState<string | null>(null);
  const [draggingUnitIds, setDraggingUnitIds] = useState<string[]>([]);
  const [divisionMode, setDivisionMode] = useState<"unit" | "building">("unit");
  const [buildingFilter, setBuildingFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [occupancyFilter, setOccupancyFilter] = useState("all");
  const [divisionFilter, setDivisionFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [keepShared, setKeepShared] = useState(true);
  const [suggestedAssignments, setSuggestedAssignments] = useState<Record<string, DivisionAssignment> | null>(null);
  const [suggestionMode, setSuggestionMode] = useState<"unit" | "building">("unit");
  const [suggestionPriorities, setSuggestionPriorities] = useState<DivisionSuggestionPriorities>({ value: true, rent: true });
  const [transferSource, setTransferSource] = useState<DivisionMemberId | null>(null);
  const [transferTarget, setTransferTarget] = useState<DivisionMemberId | null>(null);
  const [loadingData, setLoadingData] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [staleItems, setStaleItems] = useState(0);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const fetchSourceData = useCallback(async () => {
    if (!organizationId) throw new Error("Holding não selecionada.");
    const supabase = createSupabaseBrowserClient();
    if (!supabase) throw new Error("O ambiente do banco de dados não está configurado.");
    const [assetsResult, buildingsResult, unitsResult, leasesResult] = await Promise.all([
      supabase.from("assets").select("id, name, current_value").eq("organization_id", organizationId),
      supabase.from("buildings").select("id, asset_id, current_value, status").eq("organization_id", organizationId),
      supabase.from("property_units").select("id, building_id, code, unit_type, estimated_value, potential_rent, status, quantity").eq("organization_id", organizationId).order("code"),
      supabase.from("leases").select("unit_id, current_rent, status").eq("organization_id", organizationId).in("status", ["active", "ending", "draft"]),
    ]);
    const firstError = [assetsResult, buildingsResult, unitsResult, leasesResult].find((result) => result.error)?.error;
    if (firstError) throw new Error(firstError.message);
    return {
      supabase,
      units: mapDivisionUnits(
        (assetsResult.data ?? []) as RawRow[],
        (buildingsResult.data ?? []) as RawRow[],
        (unitsResult.data ?? []) as RawRow[],
        (leasesResult.data ?? []) as RawRow[],
      ),
    };
  }, [organizationId]);

  useEffect(() => {
    if (!organizationId || !authorized) return;
    let active = true;
    async function load() {
      setLoadingData(true); setError("");
      try {
        const source = await fetchSourceData();
        const simulationsResult = await source.supabase.from("division_simulations").select("id, name, allocation_mode, updated_at").eq("organization_id", organizationId).order("updated_at", { ascending: false });
        if (simulationsResult.error) throw new Error(simulationsResult.error.message.includes("division_simulations") ? "A estrutura de simulações ainda não foi ativada no banco de dados." : simulationsResult.error.message);
        const mappedUnits = source.units;
        const mappedSimulations = ((simulationsResult.data ?? []) as RawRow[]).map((simulation) => ({ id: String(simulation.id), name: String(simulation.name ?? "Divisão"), updatedAt: String(simulation.updated_at ?? ""), allocationMode: simulation.allocation_mode === "building" ? "building" as const : "unit" as const }));
      const initial = mappedSimulations[0];
      const initialAssignments: Record<string, DivisionAssignment> = {};
      let initialStale = 0;
      if (initial) {
        const itemsResult = await source.supabase.from("division_simulation_items").select("unit_id, assignment").eq("simulation_id", initial.id);
        if (itemsResult.error) throw new Error(itemsResult.error.message);
        const unitIds = new Set(mappedUnits.map((unit) => unit.id));
        for (const item of (itemsResult.data ?? []) as RawRow[]) {
          const unitId = item.unit_id ? String(item.unit_id) : "";
          if (!unitId || !unitIds.has(unitId)) { initialStale += 1; continue; }
          initialAssignments[unitId] = String(item.assignment) as DivisionAssignment;
        }
      }
      if (!active) return;
      setUnits(mappedUnits); setSimulations(mappedSimulations); setSelectedSimulationId(initial?.id ?? null); setSimulationName(initial?.name ?? `Divisão ${mappedSimulations.length + 1}`); setDivisionMode(initial?.allocationMode ?? "unit"); setAssignments(initialAssignments); setStaleItems(initialStale); setDirty(false); setLoadingData(false);
      } catch (loadError) {
        if (!active) return;
        setLoadingData(false);
        setError(loadError instanceof Error ? loadError.message : "Não foi possível carregar os dados da divisão.");
      }
    }
    void load();
    return () => { active = false; };
  }, [authorized, fetchSourceData, organizationId]);

  useEffect(() => {
    if (!organizationId || !authorized) return;
    let active = true;
    let lastRefresh = 0;
    const refreshSources = () => {
      const now = Date.now();
      if (now - lastRefresh < 1000) return;
      lastRefresh = now;
      void fetchSourceData().then(({ units: nextUnits }) => {
        if (!active) return;
        const validUnitIds = new Set(nextUnits.map((unit) => unit.id));
        setUnits(nextUnits);
        setAssignments((current) => Object.fromEntries(Object.entries(current).filter(([unitId]) => validUnitIds.has(unitId))));
      }).catch((refreshError) => {
        if (active) setError(refreshError instanceof Error ? refreshError.message : "Não foi possível atualizar os dados da divisão.");
      });
    };
    const onFocus = () => refreshSources();
    const onVisibilityChange = () => { if (document.visibilityState === "visible") refreshSources(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);
    const supabase = createSupabaseBrowserClient();
    const channel = supabase?.channel(`division-source-${organizationId}`);
    if (channel) {
      for (const table of ["assets", "buildings", "property_units", "leases"]) {
        channel.on("postgres_changes", { event: "*", schema: "public", table, filter: `organization_id=eq.${organizationId}` }, refreshSources);
      }
      channel.subscribe();
    }
    return () => {
      active = false;
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (channel) void supabase?.removeChannel(channel);
    };
  }, [authorized, fetchSourceData, organizationId]);

  const currentCalculation = useMemo(() => calculationModel(units, assignments, divisionMode), [assignments, divisionMode, units]);
  const metrics = useMemo(() => calculateDivision(currentCalculation.units, currentCalculation.assignments), [currentCalculation]);
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
  const visibleBuildings = useMemo(() => {
    const candidateBuildingIds = new Set(units.filter((unit) => {
      const textMatches = `${unit.buildingName} ${unit.code} ${unit.type}`.toLowerCase().includes(query.toLowerCase());
      const buildingMatches = buildingFilter === "all" || unit.buildingId === buildingFilter;
      const typeMatches = typeFilter === "all" || unit.type === typeFilter;
      const occupancyMatches = occupancyFilter === "all" || (occupancyFilter === "occupied" ? isOccupied(unit.status) : !isOccupied(unit.status));
      return textMatches && buildingMatches && typeMatches && occupancyMatches;
    }).map((unit) => unit.buildingId));
    const grouped = new Map<string, DivisionUnit[]>();
    for (const unit of units) {
      if (!candidateBuildingIds.has(unit.buildingId)) continue;
      const current = grouped.get(unit.buildingId) ?? [];
      current.push(unit); grouped.set(unit.buildingId, current);
    }
    return [...grouped.entries()].map(([buildingId, buildingUnits]) => ({ buildingId, name: buildingUnits[0]?.buildingName ?? "Prédio", units: buildingUnits })).filter(({ units: buildingUnits }) => {
      const state = buildingDivisionState(buildingUnits, assignments);
      return divisionFilter === "all" || (divisionFilter === "available" ? state === "available" : divisionFilter === "shared" ? state === "shared" : state === "distributed");
    });
  }, [assignments, buildingFilter, divisionFilter, occupancyFilter, query, typeFilter, units]);
  const selectedUnitIds = useMemo(() => {
    if (!selectedInventoryId) return [];
    return divisionMode === "building" ? units.filter((unit) => unit.buildingId === selectedInventoryId).map((unit) => unit.id) : [selectedInventoryId];
  }, [divisionMode, selectedInventoryId, units]);
  const assignedByDestination = useMemo(() => {
    const result: Record<Destination, DivisionUnit[]> = { paulo: [], pedro: [], aurora: [], carlos: [], shared: [] };
    for (const unit of units) { const assignment = assignments[unit.id]; if (assignment) result[assignment].push(unit); }
    return result;
  }, [assignments, units]);
  const propertyChart = metrics.members.map((member) => ({ name: member.name, share: member.share, amount: member.value, color: member.color }));
  const incomeChart = metrics.members.map((member) => ({ name: member.name, share: metrics.totalRent > 0 ? (member.rent / metrics.totalRent) * 100 : 0, rent: member.rent, color: member.color }));

  function updateAssignments(unitIds: string[], assignment: DivisionAssignment) {
    if (!unitIds.length) return;
    setAssignments((current) => Object.fromEntries(Object.entries({ ...current, ...Object.fromEntries(unitIds.map((unitId) => [unitId, assignment])) })));
    setDirty(true); setSelectedInventoryId(null); setDraggingUnitIds([]);
    const firstUnit = units.find((unit) => unit.id === unitIds[0]);
    setMessage(assignment ? `${firstUnit?.buildingName ?? firstUnit?.code ?? "Unidade"}${unitIds.length > 1 ? ` · ${unitIds.length} unidades` : ""} atribuído a ${assignmentLabel(assignment)}.` : "Unidade removida da distribuição.");
  }

  function dropOn(destination: Destination, event?: React.DragEvent) {
    event?.preventDefault();
    const payload = event?.dataTransfer.getData("application/x-division-units") || event?.dataTransfer.getData("text/plain");
    let unitIds = draggingUnitIds;
    try { if (payload) unitIds = JSON.parse(payload) as string[]; } catch { if (payload) unitIds = [payload]; }
    updateAssignments(unitIds, destination);
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
    setSelectedSimulationId(id); setSimulationName(simulation?.name ?? "Divisão"); setDivisionMode(simulation?.allocationMode ?? "unit"); setAssignments(next); setStaleItems(stale); setDirty(false); setMessage("Simulação carregada."); setError("");
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
      const update = await supabase.from("division_simulations").update({ name: cleanName, allocation_mode: divisionMode }).eq("id", scenarioId).eq("organization_id", organizationId);
      if (update.error) throw update.error;
    } else {
      const user = (await supabase.auth.getUser()).data.user;
      const insert = await supabase.from("division_simulations").insert({ organization_id: organizationId, name: cleanName, allocation_mode: divisionMode, created_by: user?.id }).select("id").single();
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
      const next = { id: String(result.id), name: result.name, updatedAt: new Date().toISOString(), allocationMode: divisionMode };
      setSelectedSimulationId(next.id); setSimulationName(next.name); setSimulations((current) => [next, ...current.filter((item) => item.id !== next.id)]); setDirty(false); setMessage("Simulação salva com sucesso.");
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : "Não foi possível salvar a simulação."); }
    setSaving(false);
  }

  async function duplicateCurrent() {
    if (saving) return;
    setSaving(true); setError("");
    try {
      const result = await persistScenario(null, `${simulationName.trim() || "Divisão"} · cópia`);
      const next = { id: String(result.id), name: result.name, updatedAt: new Date().toISOString(), allocationMode: divisionMode };
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
    setAssignments({}); setDirty(true); setSelectedInventoryId(null); setMessage("Distribuição limpa. Salve para registrar este estado.");
  }

  function buildSuggestion(mode: "unit" | "building", keepSharedValue = keepShared, priorities = suggestionPriorities) {
    const model = calculationModel(units, assignments, mode);
    const suggested = suggestDivision(model.units, model.assignments, keepSharedValue, priorities);
    return expandCalculationAssignments(units, suggested, mode);
  }

  function suggest() {
    setSuggestionMode(divisionMode);
    setSuggestedAssignments(buildSuggestion(divisionMode)); setMessage("Proposta pronta para revisão. Nada foi alterado ainda.");
  }

  function metricsForAssignments(nextAssignments: Record<string, DivisionAssignment>, mode = divisionMode) {
    const model = calculationModel(units, nextAssignments, mode);
    return calculateDivision(model.units, model.assignments);
  }

  function openTransfer(source: DivisionMemberId) {
    const target = divisionMembers.find((member) => member.id !== source)?.id ?? null;
    setTransferSource(source); setTransferTarget(target);
  }

  function swapAll() {
    if (!transferSource || !transferTarget || transferSource === transferTarget) return;
    const sourceUnits = assignedByDestination[transferSource];
    const targetUnits = assignedByDestination[transferTarget];
    setAssignments((current) => {
      const next = { ...current };
      for (const unit of sourceUnits) next[unit.id] = transferTarget;
      for (const unit of targetUnits) next[unit.id] = transferSource;
      return next;
    });
    setDirty(true); setSelectedInventoryId(null); setDraggingUnitIds([]);
    const sourceName = divisionMembers.find((member) => member.id === transferSource)?.name ?? "Membro";
    const targetName = divisionMembers.find((member) => member.id === transferTarget)?.name ?? "Membro";
    setMessage(`Troca concluída: ${sourceName} recebeu as atribuições de ${targetName} e vice-versa.`);
    setTransferSource(null); setTransferTarget(null);
  }

  const transferContext: TransferContextValue = {
    open: openTransfer,
    source: transferSource,
    target: transferTarget,
    setTarget: (target) => setTransferTarget(target),
    cancel: () => { setTransferSource(null); setTransferTarget(null); },
    confirm: swapAll,
    sourceUnitCount: transferSource ? assignedByDestination[transferSource].reduce((sum, unit) => sum + unit.quantity, 0) : 0,
    targetUnitCount: transferTarget ? assignedByDestination[transferTarget].reduce((sum, unit) => sum + unit.quantity, 0) : 0,
  };

  if (loading || loadingData) return <div className="content"><div className="empty-state"><Scale size={28} /><p>Carregando a central de divisão...</p></div></div>;
  if (!authorized) return <div className="content"><div className="access-gate-card panel division-access-card"><LockKeyhole size={27} /><h2>Acesso restrito</h2><p>A Divisão Patrimonial está disponível apenas para gestores e administradores da holding.</p></div></div>;
  if (error && !units.length) return <div className="content"><div className="empty-state"><AlertTriangle size={28} /><h3>Não foi possível abrir a Divisão</h3><p>{error}</p></div></div>;

  return <TransferContext.Provider value={transferContext}><div className="content division-page">
    <div className="page-heading division-heading"><div><div className="eyebrow"><Scale size={13} /> Planejamento patrimonial</div><h1>Divisão</h1><p className="subtitle">Distribua unidades em cenários de planejamento sem alterar a titularidade real dos imóveis.</p></div><div className="page-heading-actions"><button className="button button-ghost" onClick={suggest} disabled={!units.length}><BarChart3 size={14} /> Sugerir divisão equilibrada</button><button className="button button-primary" onClick={() => void saveCurrent()} disabled={saving}>{saving ? "Salvando…" : <><Save size={14} /> Salvar simulação</>}</button></div></div>
    <div className="division-toolbar panel"><div className="division-scenario-select"><label htmlFor="division-scenario">Simulação ativa</label><select id="division-scenario" value={selectedSimulationId ?? "new"} onChange={(event) => event.target.value === "new" ? startNewSimulation() : void loadSimulation(event.target.value)}><option value="new">Nova simulação</option>{simulations.map((simulation) => <option value={simulation.id} key={simulation.id}>{simulation.name}</option>)}</select></div><label className="division-name-field"><span>Nome do cenário</span><input value={simulationName} onChange={(event) => { setSimulationName(event.target.value); setDirty(true); }} placeholder="Ex.: Divisão 01 — Equilíbrio patrimonial" /></label><div className="division-toolbar-actions"><button className="icon-btn" onClick={() => void duplicateCurrent()} title="Duplicar simulação" aria-label="Duplicar simulação"><Copy size={15} /></button><button className="icon-btn" onClick={() => void restoreCurrent()} disabled={!selectedSimulationId} title="Restaurar última versão salva" aria-label="Restaurar última versão salva"><RotateCcw size={15} /></button><button className="icon-btn" onClick={clearCurrent} title="Limpar distribuição" aria-label="Limpar distribuição"><Trash2 size={15} /></button>{selectedSimulationId && <button className="icon-btn danger-icon" onClick={() => void deleteCurrent()} title="Excluir simulação" aria-label="Excluir simulação"><X size={16} /></button>}</div></div>
    {error && <div className="division-alert error"><AlertTriangle size={14} /> {error}</div>}{message && <div className="division-alert"><Check size={14} /> {message}</div>}{staleItems > 0 && <div className="division-alert warning"><AlertTriangle size={14} /> {staleItems} unidade(s) salvas nesta simulação não estão mais no cadastro atual. Elas foram mantidas apenas como histórico e não entram nos cálculos.</div>}
    <div className="metrics division-metrics"><DivisionMetric title="Patrimônio total da holding" value={compactBrl(metrics.totalValue)} foot={`${units.length} unidades · ${metrics.unitsWithoutValue} sem avaliação`} icon={<Layers3 size={15} />} /><DivisionMetric title="Patrimônio distribuído" value={compactBrl(metrics.distributedValue)} foot={`${metrics.distributedUnits} unidades atribuídas`} icon={<Check size={15} />} /><DivisionMetric title="Patrimônio pendente" value={compactBrl(metrics.pendingValue)} foot={`${metrics.pendingUnits} unidades aguardando`} icon={<AlertTriangle size={15} />} /><DivisionMetric title="Renda mensal prevista" value={brl(metrics.totalRent)} foot="Valor cadastrado, inclusive desocupados" icon={<BarChart3 size={15} />} /><DivisionMetric title="Meta patrimonial por membro" value={compactBrl(metrics.memberTargetValue)} foot="25% do patrimônio conhecido" icon={<Scale size={15} />} /><DivisionMetric title="Meta de renda por membro" value={brl(metrics.memberTargetRent)} foot="25% da renda mensal prevista" icon={<UsersRound size={15} />} /></div>
    <div className="division-workspace"><section className="panel division-inventory"><div className="panel-heading"><div><h2>{divisionMode === "building" ? "Imóveis disponíveis" : "Unidades disponíveis"}</h2><p>{divisionMode === "building" ? "Selecione ou arraste prédios inteiros para um destino." : "Selecione por clique ou arraste para um destino."}</p></div><span className="division-counter">{divisionMode === "building" ? `${visibleBuildings.length} de ${buildingOptions.length} imóveis` : `${visibleUnits.length} de ${units.length} unidades`}</span></div><div className="division-mode-control"><label className="division-mode-checkbox"><input type="checkbox" checked={divisionMode === "building"} onChange={(event) => { setDivisionMode(event.target.checked ? "building" : "unit"); setSelectedInventoryId(null); }} /><span><strong>Considerar imóveis/prédios inteiros</strong><small>{divisionMode === "building" ? "Atribuir um imóvel leva todas as suas unidades juntas e usa o valor atualizado do prédio." : "Atribuir unidade por unidade e usar o valor individual cadastrado."}</small></span></label></div><div className="division-filters"><label className="division-search"><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar imóvel ou unidade" /></label><select value={buildingFilter} onChange={(event) => setBuildingFilter(event.target.value)} aria-label="Filtrar prédio"><option value="all">Todos os prédios</option>{buildingOptions.map(([id, name]) => <option value={id} key={id}>{name}</option>)}</select><select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} aria-label="Filtrar tipo"><option value="all">Todos os tipos</option>{typeOptions.map((type) => <option value={type} key={type}>{type}</option>)}</select><select value={occupancyFilter} onChange={(event) => setOccupancyFilter(event.target.value)} aria-label="Filtrar situação"><option value="all">Todas as situações</option><option value="occupied">Alugados</option><option value="vacant">Desocupados</option></select><select value={divisionFilter} onChange={(event) => setDivisionFilter(event.target.value)} aria-label="Filtrar status da divisão"><option value="all">Todos os status</option><option value="available">Disponíveis</option><option value="distributed">Distribuídos</option><option value="shared">Compartilhados</option></select></div><div className="division-inventory-list">{divisionMode === "building" ? (visibleBuildings.length ? visibleBuildings.map((building) => <InventoryBuildingCard key={building.buildingId} name={building.name} units={building.units} assignments={assignments} selected={selectedInventoryId === building.buildingId} onSelect={() => setSelectedInventoryId((current) => current === building.buildingId ? null : building.buildingId)} onDragStart={(event) => { const ids = building.units.map((unit) => unit.id); setDraggingUnitIds(ids); event.dataTransfer.setData("application/x-division-units", JSON.stringify(ids)); event.dataTransfer.setData("text/plain", JSON.stringify(ids)); }} />) : <div className="division-empty"><Search size={21} /><p>Nenhum imóvel corresponde aos filtros atuais.</p></div>) : (visibleUnits.length ? visibleUnits.map((unit) => <InventoryCard key={unit.id} unit={unit} assignment={assignments[unit.id] ?? null} selected={selectedInventoryId === unit.id} onSelect={() => setSelectedInventoryId((current) => current === unit.id ? null : unit.id)} onDragStart={(event) => { setDraggingUnitIds([unit.id]); event.dataTransfer.setData("application/x-division-units", JSON.stringify([unit.id])); event.dataTransfer.setData("text/plain", unit.id); }} />) : <div className="division-empty"><Search size={21} /><p>Nenhuma unidade corresponde aos filtros atuais.</p></div>)}</div>{selectedInventoryId && <div className="division-selection-bar"><span><Check size={14} /> {divisionMode === "building" ? "Imóvel selecionado" : "Unidade selecionada"}: <strong>{divisionMode === "building" ? units.find((unit) => unit.buildingId === selectedInventoryId)?.buildingName : units.find((unit) => unit.id === selectedInventoryId)?.code}</strong></span><button className="icon-btn" onClick={() => setSelectedInventoryId(null)} aria-label="Cancelar seleção"><X size={15} /></button></div>}</section><section className="division-board"><div className="division-board-heading"><div><h2>Destinos da divisão</h2><p>{selectedInventoryId ? "Escolha uma caixa para atribuir a seleção." : "Arraste unidades ou imóveis entre as caixas para reorganizar o cenário."}</p></div><span className="division-board-legend"><span className="legend-dot" /> Atualização instantânea</span></div><div className="division-destinations">{divisionMembers.map((member) => <DestinationCard key={member.id} destination={member.id} units={assignedByDestination[member.id]} metrics={metrics} divisionMode={divisionMode} selectedUnitId={selectedInventoryId} onDrop={dropOn} onSelectDestination={() => updateAssignments(selectedUnitIds, member.id)} onDragStart={(event, unitId) => { setDraggingUnitIds([unitId]); event.dataTransfer.setData("application/x-division-units", JSON.stringify([unitId])); event.dataTransfer.setData("text/plain", unitId); }} onRemove={(unitId) => updateAssignments([unitId], null)} />)}<DestinationCard destination="shared" units={assignedByDestination.shared} metrics={metrics} divisionMode={divisionMode} selectedUnitId={selectedInventoryId} onDrop={dropOn} onSelectDestination={() => updateAssignments(selectedUnitIds, "shared")} onDragStart={(event, unitId) => { setDraggingUnitIds([unitId]); event.dataTransfer.setData("application/x-division-units", JSON.stringify([unitId])); event.dataTransfer.setData("text/plain", unitId); }} onRemove={(unitId) => updateAssignments([unitId], null)} /></div></section></div>
    <section className="panel division-balance-panel"><div className="panel-heading"><div><h2>Equilíbrio da divisão</h2><p>Desvio médio absoluto de cada membro em relação à meta de 25%. Quanto maior, mais próximo do equilíbrio.</p></div><div className={`division-score ${scoreTone(metrics.consolidatedBalance)}`}><small>Consolidado · 50% patrimônio + 50% renda</small><strong>{scoreLabel(metrics.consolidatedBalance)}</strong></div></div><div className="division-balance-grid"><BalanceScore label="Equilíbrio patrimonial" score={metrics.propertyBalance} target={metrics.memberTargetValue} value={brl(metrics.memberTargetValue)} /><BalanceScore label="Equilíbrio de renda" score={metrics.incomeBalance} target={metrics.memberTargetRent} value={brl(metrics.memberTargetRent)} /></div><details className="division-methodology"><summary><CircleHelp size={14} /> Como o indicador é calculado</summary><p>Para cada dimensão, calculamos o desvio percentual absoluto de cada membro em relação à meta de 25%, fazemos a média e aplicamos <strong>100 − desvio médio</strong>, limitado entre 0% e 100%. O consolidado usa pesos iguais entre patrimônio e renda. Imóveis compartilhados entram com 25% em cada membro.</p></details></section>
    <section className="division-comparison-grid"><ChartPanel title="Patrimônio por membro" subtitle="Participação no patrimônio distribuído e compartilhado." data={propertyChart} dataKey="share" valueKey="amount" /><ChartPanel title="Renda mensal por membro" subtitle="Participação na renda mensal prevista." data={incomeChart} dataKey="share" valueKey="rent" /></section>
    <section className="panel division-table-panel"><div className="panel-heading"><div><h2>Comparativo entre membros</h2><p>Valores individuais já incorporam a fração de 25% dos imóveis compartilhados.</p></div></div><div className="table-wrap"><table className="division-table"><thead><tr><th>Membro</th><th>Patrimônio</th><th>% do total</th><th>Diferença da meta</th><th>Renda mensal</th><th>Diferença da meta</th></tr></thead><tbody>{metrics.members.map((member) => <tr key={member.id}><td><span className="division-member-name"><span className="member-color" style={{ background: member.color }} />{member.name}</span></td><td><strong>{brl(member.value)}</strong></td><td>{member.share.toFixed(1)}%</td><td className={member.valueDifference >= 0 ? "positive" : "negative"}>{member.valueDifference >= 0 ? "+" : "−"}{brl(Math.abs(member.valueDifference))}</td><td><strong>{brl(member.rent)}</strong></td><td className={member.rentDifference >= 0 ? "positive" : "negative"}>{member.rentDifference >= 0 ? "+" : "−"}{brl(Math.abs(member.rentDifference))}</td></tr>)}</tbody></table></div></section>
    {suggestedAssignments && <div className="modal-backdrop"><div className="edit-modal division-suggestion-modal"><div className="panel-heading"><div><div className="eyebrow"><BarChart3 size={13} /> Proposta automática</div><h2>Aplicar sugestão equilibrada?</h2><p>{suggestionMode === "building" ? "A proposta considera prédios inteiros." : "A proposta reorganiza unidades individuais."} {suggestionPriorities.value && suggestionPriorities.rent ? "Ela prioriza patrimônio e renda mensal." : suggestionPriorities.value ? "Ela prioriza o valor dos imóveis." : suggestionPriorities.rent ? "Ela prioriza a renda mensal." : "Ela busca equilibrar a quantidade de unidades."} O que já está compartilhado {keepShared ? "será mantido compartilhado" : "também poderá ser redistribuído"}.</p></div><button className="icon-btn" onClick={() => setSuggestedAssignments(null)} aria-label="Fechar"><X size={16} /></button></div><div className="suggestion-preview"><SuggestionPreview label="Estado atual" metrics={metrics} /><SuggestionPreview label="Após a sugestão" metrics={metricsForAssignments(suggestedAssignments, suggestionMode)} /></div><div className="division-suggestion-options"><label className="checkbox-field"><input type="checkbox" checked={suggestionPriorities.value} onChange={(event) => { const nextPriorities = { ...suggestionPriorities, value: event.target.checked }; setSuggestionPriorities(nextPriorities); setSuggestedAssignments(buildSuggestion(suggestionMode, keepShared, nextPriorities)); }} /> Priorizar valor dos imóveis</label><label className="checkbox-field"><input type="checkbox" checked={suggestionPriorities.rent} onChange={(event) => { const nextPriorities = { ...suggestionPriorities, rent: event.target.checked }; setSuggestionPriorities(nextPriorities); setSuggestedAssignments(buildSuggestion(suggestionMode, keepShared, nextPriorities)); }} /> Priorizar renda mensal</label><label className="checkbox-field"><input type="checkbox" checked={suggestionMode === "building"} onChange={(event) => { const nextMode = event.target.checked ? "building" : "unit"; setSuggestionMode(nextMode); setSuggestedAssignments(buildSuggestion(nextMode, keepShared, suggestionPriorities)); }} /> Considerar imóveis/prédios inteiros nesta sugestão</label><label className="checkbox-field"><input type="checkbox" checked={keepShared} onChange={(event) => { const nextKeepShared = event.target.checked; setKeepShared(nextKeepShared); setSuggestedAssignments(buildSuggestion(suggestionMode, nextKeepShared, suggestionPriorities)); }} /> Manter imóveis compartilhados fixos</label></div><div className="onboarding-actions"><button className="button button-ghost" onClick={() => setSuggestedAssignments(null)}>Cancelar</button><button className="button button-primary" onClick={() => { setDivisionMode(suggestionMode); setAssignments(suggestedAssignments); setSelectedInventoryId(null); setSuggestedAssignments(null); setDirty(true); setMessage("Sugestão aplicada. Revise e salve quando estiver pronto."); }}><Check size={14} /> Aplicar proposta</button></div></div></div>}
  </div></TransferContext.Provider>;
}

function DivisionMetric({ title, value, foot, icon }: { title: string; value: string; foot: string; icon: React.ReactNode }) {
  return <div className="metric-card"><div className="metric-top"><span>{title}</span><span className="metric-icon">{icon}</span></div><div className="metric-value">{value}</div><div className="metric-foot">{foot}</div></div>;
}

function InventoryCard({ unit, assignment, selected, onSelect, onDragStart }: { unit: DivisionUnit; assignment: DivisionAssignment; selected: boolean; onSelect: () => void; onDragStart: (event: React.DragEvent<HTMLDivElement>) => void }) {
  return <div className={`division-unit-card ${selected ? "selected" : ""} ${assignment ? "assigned" : ""}`} draggable onDragStart={onDragStart} onClick={onSelect} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(); } }} role="button" tabIndex={0} aria-pressed={selected}><div className="division-unit-icon"><GripVertical size={14} /></div><div className="division-unit-main"><strong>{unit.code}</strong><span>{unit.buildingName} · {unit.type}{unit.quantity > 1 ? ` · ${unit.quantity} un.` : ""}</span><small><span className={`division-status status-${isOccupied(unit.status) ? "occupied" : "vacant"}`} /> {statusLabels[unit.status] ?? unit.status}</small></div><div className="division-unit-values"><strong className={unit.value == null ? "division-pending-value" : ""}>{valueLabel(unit.value)}</strong><small>{brl(unit.rent)}/mês</small></div>{assignment && <span className={`division-assignment-tag ${assignment === "shared" ? "shared" : ""}`}>{assignmentLabel(assignment)}</span>}</div>;
}

function InventoryBuildingCard({ name, units, assignments, selected, onSelect, onDragStart }: { name: string; units: DivisionUnit[]; assignments: Record<string, DivisionAssignment>; selected: boolean; onSelect: () => void; onDragStart: (event: React.DragEvent<HTMLDivElement>) => void }) {
  const value = buildingValueOf(units);
  const rent = units.reduce((sum, unit) => sum + unit.rent, 0);
  const state = buildingDivisionState(units, assignments);
  const stateLabel = state === "available" ? "Disponível" : state === "shared" ? "Compartilhado" : "Distribuído";
  return <div className={`division-building-card ${selected ? "selected" : ""}`} draggable onDragStart={onDragStart} onClick={onSelect} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(); } }} role="button" tabIndex={0} aria-pressed={selected}><div className="division-building-icon"><GripVertical size={14} /></div><div className="division-unit-main"><strong>{name}</strong><span>{units.reduce((sum, unit) => sum + unit.quantity, 0)} unidades cadastradas</span><small><span className={`division-status status-${state}`} /> {stateLabel}</small></div><div className="division-building-values"><strong>{valueLabel(value || null)}</strong><small>{brl(rent)}/mês</small></div></div>;
}

function TransferDialog({ transfer }: { transfer: TransferContextValue }) {
  if (!transfer.source) return null;
  const sourceName = divisionMembers.find((member) => member.id === transfer.source)?.name ?? "Membro";
  const targetName = divisionMembers.find((member) => member.id === transfer.target)?.name ?? "outro membro";
  return <div className="modal-backdrop"><section className="edit-modal division-transfer-modal"><div className="panel-heading"><div><div className="eyebrow"><ArrowRightLeft size={13} /> Troca em lote</div><h2>Trocar imóveis atribuídos</h2><p>{sourceName} receberá as {transfer.targetUnitCount} unidades de {targetName}, e {targetName} receberá as {transfer.sourceUnitCount} unidades de {sourceName}.</p></div><button className="icon-btn" onClick={transfer.cancel} aria-label="Fechar"><X size={16} /></button></div><label>Trocar com<select value={transfer.target ?? ""} onChange={(event) => transfer.setTarget(event.target.value as DivisionMemberId)}>{divisionMembers.filter((member) => member.id !== transfer.source).map((member) => <option value={member.id} key={member.id}>{member.name}</option>)}</select></label><div className="onboarding-actions"><button type="button" className="button button-ghost" onClick={transfer.cancel}>Cancelar</button><button type="button" className="button button-primary" onClick={transfer.confirm} disabled={!transfer.target}><ArrowRightLeft size={14} /> Confirmar troca</button></div></section></div>;
}

function DestinationCard({ destination, units, metrics, divisionMode, selectedUnitId, onDrop, onSelectDestination, onDragStart, onRemove }: { destination: Destination; units: DivisionUnit[]; metrics: DivisionMetrics; divisionMode: "unit" | "building"; selectedUnitId: string | null; onDrop: (destination: Destination, event: React.DragEvent<HTMLDivElement>) => void; onSelectDestination: () => void; onDragStart: (event: React.DragEvent<HTMLDivElement>, unitId: string) => void; onRemove: (unitId: string) => void }) {
  const transfer = useContext(TransferContext);
  const member = destination === "shared" ? null : divisionMembers.find((item) => item.id === destination);
  const memberTotals = member ? metrics.members.find((item) => item.id === member.id) : null;
  const unitCount = units.reduce((sum, unit) => sum + unit.quantity, 0);
  const value = destination === "shared" ? (divisionMode === "building" ? [...new Map(units.map((unit) => [unit.buildingId, unit])).values()].reduce((sum, unit) => sum + buildingValueOf(units.filter((item) => item.buildingId === unit.buildingId)), 0) : units.reduce((sum, unit) => sum + (unit.value ?? 0), 0)) : memberTotals?.value ?? 0;
  const rent = destination === "shared" ? units.reduce((sum, unit) => sum + unit.rent, 0) : memberTotals?.rent ?? 0;
  return <><div className={`division-destination ${destination === "shared" ? "shared-destination" : ""}`} onDragOver={(event) => event.preventDefault()} onDrop={(event) => onDrop(destination, event)}><div className="division-destination-heading"><div className="division-destination-title"><span className="destination-avatar" style={{ background: member?.color ?? "#f0be4a" }}>{member ? <UserRound size={15} /> : <UsersRound size={15} />}</span><div><strong>{member ? `Membro · ${member.name}` : "Todos · Patrimônio compartilhado"}</strong><small>{member ? "Participação individual" : "25% para cada membro"}</small></div></div><div className="division-destination-actions">{member && units.length > 0 && transfer ? <button className="button button-small button-ghost" onClick={(event) => { event.stopPropagation(); transfer.open(member.id); }} title={`Trocar todos os imóveis de ${member.name}`}><ArrowRightLeft size={12} /> Trocar imóveis</button> : null}{selectedUnitId && <button className="button button-small button-ghost" onClick={onSelectDestination}><Plus size={12} /> Adicionar</button>}</div></div><div className="division-destination-stats"><span><small>Unidades</small><strong>{unitCount}</strong></span><span><small>Patrimônio</small><strong>{brl(value)}</strong></span><span><small>Renda mensal</small><strong>{brl(rent)}</strong></span><span><small>Renda anual</small><strong>{brl(rent * 12)}</strong></span></div><div className="division-drop-list">{units.length ? units.map((unit) => <div className="division-assigned-card" key={unit.id} draggable onDragStart={(event) => onDragStart(event, unit.id)}><GripVertical size={13} /><div><strong>{unit.code}</strong><small>{unit.buildingName} · {unit.type}</small></div><span>{divisionMode === "building" ? "Imóvel inteiro" : unit.value == null ? "—" : compactBrl(unit.value)}</span><button className="icon-btn" onClick={(event) => { event.stopPropagation(); onRemove(unit.id); }} aria-label={`Remover ${unit.code}`}><X size={13} /></button></div>) : <div className="division-drop-placeholder"><Download size={16} /><span>Solte uma unidade aqui</span></div>}</div></div>{destination === "shared" && transfer ? <TransferDialog transfer={transfer} /> : null}</>;
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
