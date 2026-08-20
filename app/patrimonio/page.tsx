"use client";

import { CircleDollarSign, Landmark, TrendingUp } from "lucide-react";
import { usePortfolio } from "@/components/portfolio-provider";
import { compactBrl } from "@/lib/format";

export default function PatrimonioPage() {
  const { buildings, loading } = usePortfolio();
  const totalValue = buildings.reduce((total, building) => total + building.value, 0);
  const totalUnits = buildings.reduce((total, building) => total + building.units, 0);
  const recordCount = buildings.reduce((total, building) => total + (building.sourceRows ?? building.units), 0);
  if (loading) return <div className="content"><div className="empty-state"><p>Carregando patrimônio...</p></div></div>;
  return <div className="content"><div className="page-heading"><div><div className="eyebrow"><Landmark size={13} /> Visão consolidada</div><h1>Patrimônio</h1><p className="subtitle">Valores de patrimônio considerados somente pela coluna AVALIAÇÃO.</p></div></div><div className="metrics"><div className="metric-card"><div className="metric-top"><span>Valor total</span><span className="metric-icon"><CircleDollarSign size={15} /></span></div><div className="metric-value">{compactBrl(totalValue)}</div><div className="metric-foot positive">AVALIAÇÃO da planilha</div></div><div className="metric-card"><div className="metric-top"><span>Prédios / grupos</span><span className="metric-icon">{buildings.length}</span></div><div className="metric-value">{buildings.length}</div><div className="metric-foot">{totalUnits} unidades</div></div><div className="metric-card"><div className="metric-top"><span>Registros válidos</span><span className="metric-icon"><Landmark size={15} /></span></div><div className="metric-value">{recordCount}</div><div className="metric-foot">04.1 removido conforme conferência</div></div><div className="metric-card"><div className="metric-top"><span>Fonte dos dados</span><span className="metric-icon"><TrendingUp size={15} /></span></div><div className="metric-value">XLSX</div><div className="metric-foot positive">Sem uso de “Valor do imóvel”</div></div></div><div className="panel"><div className="panel-heading"><div><h2>Ativos imobiliários</h2><p>Prédios e propriedades importados da organização</p></div></div><div className="building-list">{buildings.map((building) => <div className="building-row" key={building.id}><div className="building-thumb" /><div className="building-info"><strong>{building.name}</strong><small>Imóvel · {building.city}, {building.state}</small></div><div className="building-value"><strong>{compactBrl(building.value)}</strong><small className="positive">{building.units} unidades</small></div></div>)}</div></div></div>;
}
