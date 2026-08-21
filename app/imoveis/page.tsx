"use client";

import Link from "next/link";
import { Building2, MapPin, Plus, Search, SlidersHorizontal } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { usePortfolio } from "@/components/portfolio-provider";
import { brl, compactBrl } from "@/lib/format";
import type { Building } from "@/types/domain";
import { createSupabaseBrowserClient } from "@/lib/supabase";

function saleUnits(building: Building) { return (building.unitsData ?? []).filter((unit) => unit.status === "venda" || unit.status === "venda_alugado"); }
function isForSale(building: Building) { return building.status === "venda" || saleUnits(building).length > 0; }

export default function ImoveisPage() {
  const { buildings, loading, organizationId } = usePortfolio();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("todos");
  const [buildingPhotos, setBuildingPhotos] = useState<Record<string, string>>({});
  useEffect(() => {
    let active = true;
    async function loadBuildingPhotos() {
      const unitMap = new Map<string, string>();
      for (const building of buildings) for (const unit of building.unitsData ?? []) unitMap.set(unit.id, building.id);
      const unitIds = [...unitMap.keys()];
      const supabase = createSupabaseBrowserClient();
      if (!supabase || !organizationId || !unitIds.length) {
        if (active) setBuildingPhotos({});
        return;
      }
      const result = await supabase.from("documents").select("unit_id, storage_path, is_primary, created_at").eq("organization_id", organizationId).eq("category", "photo").in("unit_id", unitIds).order("created_at", { ascending: false });
      if (result.error) return;
      const candidates = await Promise.all((result.data ?? []).map(async (row) => ({ buildingId: unitMap.get(String(row.unit_id)), isPrimary: Boolean(row.is_primary), createdAt: String(row.created_at ?? ""), url: (await supabase.storage.from("organization-documents").createSignedUrl(String(row.storage_path), 3600)).data?.signedUrl })));
      const next = Object.fromEntries(candidates.filter((item): item is { buildingId: string; isPrimary: boolean; createdAt: string; url: string } => Boolean(item.buildingId && item.url)).sort((left, right) => Number(right.isPrimary) - Number(left.isPrimary) || right.createdAt.localeCompare(left.createdAt)).reduce<[string, string][]>((entries, item) => { if (!entries.some(([buildingId]) => buildingId === item.buildingId)) entries.push([item.buildingId, item.url]); return entries; }, []));
      if (active) setBuildingPhotos(next);
    }
    void loadBuildingPhotos();
    return () => { active = false; };
  }, [buildings, organizationId]);
  const visible = useMemo(() => buildings.filter((building) => {
    const text = `${building.name} ${building.city} ${building.state}`.toLowerCase();
    const matchesQuery = text.includes(query.toLowerCase());
    const matchesFilter = filter === "todos" || (filter === "venda" ? isForSale(building) : filter === "ocupados" ? building.occupied > 0 : building.occupied < building.units);
    return matchesQuery && matchesFilter;
  }), [buildings, filter, query]);
  const orderedVisible = useMemo(() => [...visible].sort((left, right) => Number(isForSale(right)) - Number(isForSale(left))), [visible]);
  const totalValue = buildings.reduce((total, building) => total + building.value, 0);
  const totalUnits = buildings.reduce((total, building) => total + building.units, 0);
  const totalOccupied = buildings.reduce((total, building) => total + building.occupied, 0);
  const totalRevenue = buildings.reduce((total, building) => total + building.revenue, 0);
  if (loading) return <div className="content"><div className="empty-state"><p>Carregando imóveis...</p></div></div>;
  if (!organizationId) return <div className="content"><div className="empty-state"><h3>Nenhuma organização selecionada</h3><p>Crie uma organização para importar e gerenciar os imóveis.</p><Link href="/onboarding" className="button button-primary">Começar</Link></div></div>;
  return <div className="content"><div className="page-heading"><div><div className="eyebrow"><Building2 size={13} /> Portfólio imobiliário</div><h1>Imóveis</h1><p className="subtitle">Unidades, contratos e valores sincronizados com o Supabase.</p></div><Link href="/onboarding" className="button button-primary"><Plus size={15} /><span>Novo imóvel</span></Link></div>
    <div className="metrics"><div className="metric-card"><div className="metric-top"><span>Patrimônio imobiliário</span><span className="metric-icon"><Building2 size={15} /></span></div><div className="metric-value">{compactBrl(totalValue)}</div><div className="metric-foot positive">AVALIAÇÃO</div></div><div className="metric-card"><div className="metric-top"><span>Prédios / grupos</span><span className="metric-icon">{String(buildings.length).padStart(2, "0")}</span></div><div className="metric-value">{String(buildings.length).padStart(2, "0")}</div><div className="metric-foot">{totalUnits} unidades</div></div><div className="metric-card"><div className="metric-top"><span>Receita identificada</span><span className="metric-icon">R$</span></div><div className="metric-value">{brl(totalRevenue)}</div><div className="metric-foot positive">{totalOccupied} unidades alugadas</div></div><div className="metric-card"><div className="metric-top"><span>Yield anualizado</span><span className="metric-icon">%</span></div><div className="metric-value">{totalValue ? ((totalRevenue * 12 / totalValue) * 100).toFixed(1).replace(".", ",") : "0,0"}%</div><div className="metric-foot">sobre AVALIAÇÃO</div></div></div>
    <div className="panel"><div className="panel-heading"><div><h2>Todos os prédios e grupos</h2><p>{visible.length} agrupamentos · dados do banco</p></div><div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><label className="search-inline"><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar" /></label><select className="filter-select" value={filter} onChange={(event) => setFilter(event.target.value)}><option value="todos">Todos</option><option value="ocupados">Com ocupação</option><option value="vagos">Com vagas</option><option value="venda">À venda</option></select><SlidersHorizontal size={14} style={{ alignSelf: "center", color: "#8490a5" }} /></div></div><div className="building-list">{orderedVisible.map((building) => { const availableUnits = saleUnits(building); const forSale = isForSale(building); return <Link href={`/imoveis/${building.id}`} key={building.id} className={`building-row ${forSale ? "sale-row" : ""}`} style={{ padding: 16 }}><div className="building-thumb" style={{ width: 62, height: 62 }}>{buildingPhotos[building.id] && <img src={buildingPhotos[building.id]} alt={`Foto de ${building.name}`} />}</div><div className="building-info"><strong style={{ fontSize: 14 }}>{building.name}</strong><small><MapPin size={11} style={{ verticalAlign: "-2px" }} /> {building.city}, {building.state} · {building.units} unidades</small><div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>{forSale && <span className="tag sale-tag">À venda</span>}{availableUnits.length > 0 && <span className="tag sale-tag">{availableUnits.length} {availableUnits.length === 1 ? "unidade" : "unidades"}</span>}{!forSale && <span className="tag">{building.status}</span>}<span className="tag">{building.occupied} ocupadas</span></div></div><div className="building-value"><strong style={{ fontSize: 15 }}>{compactBrl(building.value)}</strong><small>{brl(building.revenue)} / mês</small><div style={{ marginTop: 9, width: 100 }}><div className="progress"><span style={{ width: `${building.units ? (building.occupied / building.units) * 100 : 0}%` }} /></div></div></div></Link>; })}</div></div>
  </div>;
}
