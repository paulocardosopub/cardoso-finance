"use client";

import Link from "next/link";
import { Building2, MapPin, Plus, Save, Search, SlidersHorizontal, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { usePortfolio } from "@/components/portfolio-provider";
import { brl, compactBrl } from "@/lib/format";
import type { Building } from "@/types/domain";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import { buildingPath } from "@/lib/building-path";
import { buildingIsForSale, sortBuildingsForDisplay } from "@/lib/building-order";
import { listAuthorizedDocuments } from "@/lib/member-access";

function saleUnits(building: Building) { return (building.unitsData ?? []).filter((unit) => unit.status === "venda" || unit.status === "venda_alugado"); }
function isForSale(building: Building) { return buildingIsForSale(building); }

export default function ImoveisPage() {
  const { buildings, loading, organizationId, role, memberVisibility, refresh } = usePortfolio();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("todos");
  const [buildingPhotos, setBuildingPhotos] = useState<Record<string, string>>({});
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState({ name: "", address: "", city: "", state: "DF", postalCode: "", value: "", units: "1", status: "active", lastValuationDate: "" });
  useEffect(() => {
    let active = true;
    async function loadBuildingPhotos() {
      const unitMap = new Map<string, string>();
      for (const building of buildings) for (const unit of building.unitsData ?? []) unitMap.set(unit.id, building.id);
      const unitIds = [...unitMap.keys()];
      const supabase = createSupabaseBrowserClient();
      if (!supabase || !organizationId || !unitIds.length || (role === "viewer" && !memberVisibility.showPhotos)) {
        if (active) setBuildingPhotos({});
        return;
      }
      const result = await listAuthorizedDocuments(supabase, organizationId, role);
      if (result.error) return;
      const candidates = await Promise.all((result.data ?? []).filter((row) => row.category === "photo" && row.unit_id && unitMap.has(String(row.unit_id))).map(async (row) => ({ buildingId: unitMap.get(String(row.unit_id)), isPrimary: Boolean(row.is_primary), createdAt: String(row.created_at ?? ""), url: (await supabase.storage.from("organization-documents").createSignedUrl(String(row.storage_path), 3600)).data?.signedUrl })));
      const next = Object.fromEntries(candidates.filter((item): item is { buildingId: string; isPrimary: boolean; createdAt: string; url: string } => Boolean(item.buildingId && item.url)).sort((left, right) => Number(right.isPrimary) - Number(left.isPrimary) || right.createdAt.localeCompare(left.createdAt)).reduce<[string, string][]>((entries, item) => { if (!entries.some(([buildingId]) => buildingId === item.buildingId)) entries.push([item.buildingId, item.url]); return entries; }, []));
      if (active) setBuildingPhotos(next);
    }
    void loadBuildingPhotos();
    return () => { active = false; };
  }, [buildings, memberVisibility.showPhotos, organizationId, role]);
  const visible = useMemo(() => buildings.filter((building) => {
    if (filter === "vendidos") return building.status === "vendido";
    if (building.status === "vendido") return false;
    const text = `${building.name} ${building.city} ${building.state}`.toLowerCase();
    const matchesQuery = text.includes(query.toLowerCase());
    const matchesFilter = filter === "todos" || filter === "vendidos" || (filter === "venda" ? isForSale(building) : filter === "ocupados" ? building.occupied > 0 : building.occupied < building.units);
    return matchesQuery && matchesFilter;
  }), [buildings, filter, query]);
  const orderedVisible = useMemo(() => sortBuildingsForDisplay(visible), [visible]);
  const activeBuildings = buildings.filter((building) => building.status !== "vendido");
  const totalValue = activeBuildings.reduce((total, building) => total + building.value, 0);
  const totalUnits = activeBuildings.reduce((total, building) => total + building.units, 0);
  const totalOccupied = activeBuildings.reduce((total, building) => total + building.occupied, 0);
  const totalRevenue = activeBuildings.reduce((total, building) => total + building.revenue, 0);
  async function createBuilding(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!organizationId || role === "viewer") return;
    const name = createForm.name.trim();
    const value = Number(createForm.value.replace(",", "."));
    const units = Math.max(0, Math.floor(Number(createForm.units) || 0));
    if (!name || !Number.isFinite(value) || value < 0) return;
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;
    const user = (await supabase.auth.getUser()).data.user;
    const asset = await supabase.from("assets").insert({ organization_id: organizationId, name, type: "property", current_value: value, status: createForm.status === "sold" ? "sold" : "active", created_by: user?.id }).select("id").single();
    if (asset.error || !asset.data) return;
    const buildingResult = await supabase.from("buildings").insert({ organization_id: organizationId, asset_id: asset.data.id, address: createForm.address.trim(), city: createForm.city.trim(), state: createForm.state.trim(), postal_code: createForm.postalCode.trim() || null, total_units: units, current_value: value, last_valuation_date: createForm.lastValuationDate || null, status: createForm.status }).select("id").single();
    if (buildingResult.error || !buildingResult.data) {
      await supabase.from("assets").delete().eq("id", asset.data.id).eq("organization_id", organizationId);
      return;
    }
    if (units > 0) await supabase.from("property_units").insert(Array.from({ length: units }, (_, index) => ({ organization_id: organizationId, building_id: buildingResult.data.id, code: String(index + 1).padStart(2, "0"), unit_type: "Unidade", status: "vacant", potential_rent: 0 })));
    setCreating(false);
    setCreateForm({ name: "", address: "", city: "", state: "DF", postalCode: "", value: "", units: "1", status: "active", lastValuationDate: "" });
    await refresh();
  }
  if (loading) return <div className="content"><div className="empty-state"><p>Carregando imóveis...</p></div></div>;
  if (!organizationId) return <div className="content"><div className="empty-state"><h3>Nenhuma organização selecionada</h3><p>Crie uma organização para importar e gerenciar os imóveis.</p><Link href="/onboarding" className="button button-primary">Começar</Link></div></div>;
  const showMemberValues = role !== "viewer" || memberVisibility.showPropertyValues;
  const showMemberRent = role !== "viewer" || memberVisibility.showRentalInfo;
  const showMemberStatus = role !== "viewer" || memberVisibility.showPropertyStatus;
  const showMemberLocations = role !== "viewer" || memberVisibility.showLocations;
  return <div className="content"><div className="page-heading"><div><div className="eyebrow"><Building2 size={13} /> Portfólio imobiliário</div><h1>Imóveis</h1><p className="subtitle">{role === "viewer" ? "Consulte os imóveis e as informações compartilhadas pela administração." : "Unidades, contratos e valores sincronizados com o Supabase."}</p></div>{role !== "viewer" && <button className="button button-primary" onClick={() => setCreating(true)}><Plus size={15} /><span>Novo imóvel</span></button>}</div>
    <div className="metrics">{showMemberValues && <div className="metric-card"><div className="metric-top"><span>Patrimônio imobiliário</span><span className="metric-icon"><Building2 size={15} /></span></div><div className="metric-value">{compactBrl(totalValue)}</div><div className="metric-foot positive">AVALIAÇÃO</div></div>}<div className="metric-card"><div className="metric-top"><span>Prédios / grupos</span><span className="metric-icon">{String(buildings.length).padStart(2, "0")}</span></div><div className="metric-value">{String(buildings.length).padStart(2, "0")}</div><div className="metric-foot">{totalUnits} unidades</div></div>{showMemberRent && <div className="metric-card"><div className="metric-top"><span>Receita identificada</span><span className="metric-icon">R$</span></div><div className="metric-value">{brl(totalRevenue)}</div><div className="metric-foot positive">{showMemberStatus ? `${totalOccupied} unidades alugadas` : "Informação consolidada"}</div></div>}{showMemberRent && showMemberValues && <div className="metric-card"><div className="metric-top"><span>Yield anualizado</span><span className="metric-icon">%</span></div><div className="metric-value">{totalValue ? ((totalRevenue * 12 / totalValue) * 100).toFixed(1).replace(".", ",") : "0,0"}%</div><div className="metric-foot">sobre AVALIAÇÃO</div></div>}</div>
    <div className="panel"><div className="panel-heading"><div><h2>{filter === "vendidos" ? "Imóveis vendidos" : "Todos os prédios e grupos"}</h2><p>{visible.length} agrupamentos</p></div><div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><label className="search-inline"><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar" /></label>{showMemberStatus && <><select className="filter-select" value={filter} onChange={(event) => setFilter(event.target.value)}><option value="todos">Ativos</option><option value="ocupados">Com ocupação</option><option value="vagos">Com vagas</option><option value="venda">À venda</option><option value="vendidos">Vendidos</option></select><SlidersHorizontal size={14} style={{ alignSelf: "center", color: "#8490a5" }} /></>}</div></div><div className="building-list">{orderedVisible.map((building) => { const availableUnits = saleUnits(building); const forSale = isForSale(building); return <Link href={buildingPath(building)} key={building.id} className={`building-row ${forSale ? "sale-row" : ""}`} style={{ padding: 16 }}><div className="building-thumb" style={{ width: 62, height: 62 }}>{buildingPhotos[building.id] && <img src={buildingPhotos[building.id]} alt={`Foto de ${building.name}`} />}</div><div className="building-info"><strong style={{ fontSize: 14 }}>{building.name}</strong><small>{showMemberLocations && <><MapPin size={11} style={{ verticalAlign: "-2px" }} /> {[building.city, building.state].filter(Boolean).join(", ")} · </>}{building.units} unidades</small>{showMemberStatus && <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>{building.status === "vendido" && <span className="tag sale-tag">Vendido</span>}{forSale && <span className="tag sale-tag">À venda</span>}{availableUnits.length > 0 && <span className="tag sale-tag">{availableUnits.length} {availableUnits.length === 1 ? "unidade" : "unidades"}</span>}{!forSale && building.status !== "vendido" && <span className="tag">{building.status}</span>}<span className="tag">{building.occupied} ocupadas</span></div>}</div>{(showMemberValues || showMemberRent) && <div className="building-value">{showMemberValues && <strong style={{ fontSize: 15 }}>{compactBrl(building.value)}</strong>}{showMemberRent && <small>{brl(building.revenue)} / mês</small>}{showMemberStatus && <div style={{ marginTop: 9, width: 100 }}><div className="progress"><span style={{ width: `${building.units ? (building.occupied / building.units) * 100 : 0}%` }} /></div></div>}</div>}</Link>; })}</div></div>
    {role !== "viewer" && creating && <div className="modal-backdrop"><form className="edit-modal" onSubmit={createBuilding}><div className="panel-heading"><div><h2>Novo imóvel ou prédio</h2><p>Crie um grupo editável e suas unidades iniciais.</p></div><button type="button" className="icon-btn" onClick={() => setCreating(false)} aria-label="Fechar"><X size={16} /></button></div><div className="form-grid"><label className="form-grid-wide">Nome principal<input value={createForm.name} onChange={(event) => setCreateForm((current) => ({ ...current, name: event.target.value }))} placeholder="Ex.: Edifício Cardoso" required /></label><label className="form-grid-wide">Endereço<input value={createForm.address} onChange={(event) => setCreateForm((current) => ({ ...current, address: event.target.value }))} placeholder="Rua, número, complemento" /></label><label>Cidade<input value={createForm.city} onChange={(event) => setCreateForm((current) => ({ ...current, city: event.target.value }))} /></label><label>Estado<input value={createForm.state} onChange={(event) => setCreateForm((current) => ({ ...current, state: event.target.value }))} maxLength={2} /></label><label>CEP<input value={createForm.postalCode} onChange={(event) => setCreateForm((current) => ({ ...current, postalCode: event.target.value }))} /></label><label>AVALIAÇÃO<input type="number" min="0" step="0.01" value={createForm.value} onChange={(event) => setCreateForm((current) => ({ ...current, value: event.target.value }))} required /></label><label>Unidades iniciais<input type="number" min="0" step="1" value={createForm.units} onChange={(event) => setCreateForm((current) => ({ ...current, units: event.target.value }))} /></label><label>Status<select value={createForm.status} onChange={(event) => setCreateForm((current) => ({ ...current, status: event.target.value }))}><option value="active">Ativo</option><option value="renovation">Reforma</option><option value="for_sale">À venda</option></select></label><label>Data da última avaliação<input type="date" value={createForm.lastValuationDate} onChange={(event) => setCreateForm((current) => ({ ...current, lastValuationDate: event.target.value }))} /></label></div><div className="onboarding-actions"><button type="button" className="button button-ghost" onClick={() => setCreating(false)}>Cancelar</button><button type="submit" className="button button-primary"><Save size={14} /> Criar imóvel</button></div></form></div>}
  </div>;
}
