"use client";

import { CircleDollarSign, Landmark, TrendingUp } from "lucide-react";
import { useEffect, useState } from "react";
import { usePortfolio } from "@/components/portfolio-provider";
import { compactBrl } from "@/lib/format";
import { createSupabaseBrowserClient } from "@/lib/supabase";

export default function PatrimonioPage() {
  const { buildings, loading, organizationId } = usePortfolio();
  const activeBuildings = buildings.filter((building) => building.status !== "vendido");
  const [buildingPhotos, setBuildingPhotos] = useState<Record<string, string>>({});
  useEffect(() => {
    let active = true;
    async function loadBuildingPhotos() {
      const unitMap = new Map<string, string>();
      for (const building of buildings) for (const unit of building.unitsData ?? []) unitMap.set(unit.id, building.id);
      const unitIds = [...unitMap.keys()];
      const supabase = createSupabaseBrowserClient();
      if (!supabase || !organizationId || !unitIds.length) { if (active) setBuildingPhotos({}); return; }
      const result = await supabase.from("documents").select("unit_id, storage_path, is_primary, created_at").eq("organization_id", organizationId).eq("category", "photo").in("unit_id", unitIds).order("created_at", { ascending: false });
      if (result.error) return;
      const candidates = await Promise.all((result.data ?? []).map(async (row) => ({ buildingId: unitMap.get(String(row.unit_id)), isPrimary: Boolean(row.is_primary), createdAt: String(row.created_at ?? ""), url: (await supabase.storage.from("organization-documents").createSignedUrl(String(row.storage_path), 3600)).data?.signedUrl })));
      const next = Object.fromEntries(candidates.filter((item): item is { buildingId: string; isPrimary: boolean; createdAt: string; url: string } => Boolean(item.buildingId && item.url)).sort((left, right) => Number(right.isPrimary) - Number(left.isPrimary) || right.createdAt.localeCompare(left.createdAt)).reduce<[string, string][]>((entries, item) => { if (!entries.some(([buildingId]) => buildingId === item.buildingId)) entries.push([item.buildingId, item.url]); return entries; }, []));
      if (active) setBuildingPhotos(next);
    }
    void loadBuildingPhotos();
    return () => { active = false; };
  }, [buildings, organizationId]);
  const totalValue = activeBuildings.reduce((total, building) => total + building.value, 0);
  const totalUnits = activeBuildings.reduce((total, building) => total + building.units, 0);
  const recordCount = activeBuildings.reduce((total, building) => total + (building.sourceRows ?? building.units), 0);
  if (loading) return <div className="content"><div className="empty-state"><p>Carregando patrimônio...</p></div></div>;
  return <div className="content"><div className="page-heading"><div><div className="eyebrow"><Landmark size={13} /> Visão consolidada</div><h1>Patrimônio</h1><p className="subtitle">Valores de patrimônio considerados somente pela coluna AVALIAÇÃO.</p></div></div><div className="metrics"><div className="metric-card"><div className="metric-top"><span>Valor total</span><span className="metric-icon"><CircleDollarSign size={15} /></span></div><div className="metric-value">{compactBrl(totalValue)}</div><div className="metric-foot positive">AVALIAÇÃO da planilha</div></div><div className="metric-card"><div className="metric-top"><span>Prédios / grupos</span><span className="metric-icon">{activeBuildings.length}</span></div><div className="metric-value">{activeBuildings.length}</div><div className="metric-foot">{totalUnits} unidades</div></div><div className="metric-card"><div className="metric-top"><span>Registros válidos</span><span className="metric-icon"><Landmark size={15} /></span></div><div className="metric-value">{recordCount}</div><div className="metric-foot">Ativos atuais</div></div><div className="metric-card"><div className="metric-top"><span>Fonte dos dados</span><span className="metric-icon"><TrendingUp size={15} /></span></div><div className="metric-value">XLSX</div><div className="metric-foot positive">Sem uso de “Valor do imóvel”</div></div></div><div className="panel"><div className="panel-heading"><div><h2>Ativos imobiliários</h2><p>Prédios e propriedades ativos da organização</p></div></div><div className="building-list">{activeBuildings.map((building) => <div className="building-row" key={building.id}><div className="building-thumb">{buildingPhotos[building.id] && <img src={buildingPhotos[building.id]} alt={`Foto de ${building.name}`} />}</div><div className="building-info"><strong>{building.name}</strong><small>Imóvel · {building.city}, {building.state}</small></div><div className="building-value"><strong>{compactBrl(building.value)}</strong><small className="positive">{building.units} unidades</small></div></div>)}</div></div></div>;
}
