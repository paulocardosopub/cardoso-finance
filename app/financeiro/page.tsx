"use client";

import { ArrowDownRight, ArrowUpRight, CircleDollarSign, Download, Receipt } from "lucide-react";
import { usePortfolio } from "@/components/portfolio-provider";
import { brl } from "@/lib/format";

export default function FinanceiroPage() {
  const { buildings, loading } = usePortfolio();
  const units = buildings.flatMap((building) => (building.unitsData ?? []).map((unit) => ({ ...unit, building })));
  const rentalUnits = units.filter((unit) => unit.rent > 0);
  const monthlyRent = rentalUnits.reduce((total, unit) => total + unit.rent * (unit.quantity ?? 1), 0);
  const rentedUnits = rentalUnits.reduce((total, unit) => total + (unit.quantity ?? 1), 0);
  if (loading) return <div className="content"><div className="empty-state"><p>Carregando financeiro...</p></div></div>;
  return <div className="content"><div className="page-heading"><div><div className="eyebrow"><CircleDollarSign size={13} /> Fluxo financeiro</div><h1>Financeiro</h1><p className="subtitle">Receitas exclusivamente dos aluguéis informados; despesas ainda não cadastradas.</p></div><button className="button button-ghost"><Download size={14} /> Exportar</button></div>
    <div className="metrics"><div className="metric-card"><div className="metric-top"><span>Aluguéis mensais</span><span className="metric-icon"><ArrowUpRight size={15} /></span></div><div className="metric-value">{brl(monthlyRent)}</div><div className="metric-foot positive">{rentedUnits} unidades com aluguel</div></div><div className="metric-card"><div className="metric-top"><span>Despesas cadastradas</span><span className="metric-icon"><ArrowDownRight size={15} /></span></div><div className="metric-value">{brl(0)}</div><div className="metric-foot">Nenhuma cadastrada</div></div><div className="metric-card"><div className="metric-top"><span>Resultado informado</span><span className="metric-icon">%</span></div><div className="metric-value">{brl(monthlyRent)}</div><div className="metric-foot">Antes de despesas</div></div><div className="metric-card"><div className="metric-top"><span>Histórico</span><span className="metric-icon"><Receipt size={15} /></span></div><div className="metric-value">—</div><div className="metric-foot">Datas não informadas</div></div></div>
    <div className="panel"><div className="panel-heading"><div><h2>Aluguéis informados</h2><p>{rentalUnits.length} registros com valor mensal · origem: dados imoveis.xlsx</p></div></div><div className="table-wrap"><table><thead><tr><th>Imóvel / unidade</th><th>Localidade</th><th>Status</th><th>Valor mensal</th></tr></thead><tbody>{rentalUnits.map((unit) => <tr key={unit.id}><td><strong>{unit.code}</strong><small>{unit.building.name}</small></td><td>{unit.building.city} · {unit.building.state || "—"}</td><td><span className="status status-alugado">Alugado</span></td><td className="positive"><strong>{brl(unit.rent * (unit.quantity ?? 1))}</strong></td></tr>)}</tbody></table></div></div>
  </div>;
}
