"use client";

import Link from "next/link";
import { ArrowUpRight, CircleDollarSign, Receipt } from "lucide-react";
import { useMemo, useState } from "react";
import { usePortfolio } from "@/components/portfolio-provider";
import { brl } from "@/lib/format";

export default function FinanceiroPage() {
  const { buildings, loading, organizationId, monthlyExpenses, monthlyProfit } = usePortfolio();
  const units = buildings.filter((building) => building.status !== "vendido").flatMap((building) => (building.unitsData ?? []).map((unit) => ({ ...unit, building })));
  const rentalUnits = units.filter((unit) => unit.rent > 0);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("name_asc");
  const monthlyRent = rentalUnits.reduce((total, unit) => total + unit.rent, 0);
  const rentedUnits = rentalUnits.reduce((total, unit) => total + (unit.quantity ?? 1), 0);
  const visibleRentalUnits = useMemo(() => rentalUnits.filter((unit) => `${unit.code} ${unit.building.name} ${unit.building.city} ${unit.building.state}`.toLowerCase().includes(query.toLowerCase())).sort((left, right) => sort === "value_desc" ? right.rent - left.rent : sort === "value_asc" ? left.rent - right.rent : sort === "location_asc" ? `${left.building.city} ${left.building.state}`.localeCompare(`${right.building.city} ${right.building.state}`, "pt-BR") : sort === "status_asc" ? left.status.localeCompare(right.status, "pt-BR") : `${left.building.name} ${left.code}`.localeCompare(`${right.building.name} ${right.code}`, "pt-BR")), [rentalUnits, query, sort]);
  if (loading) return <div className="content"><div className="empty-state"><p>Carregando financeiro...</p></div></div>;
  if (!organizationId) return <div className="content"><div className="empty-state"><h3>Nenhuma organização selecionada</h3><p>Entre em uma holding para visualizar as receitas.</p></div></div>;
  return <div className="content"><div className="page-heading"><div><div className="eyebrow"><CircleDollarSign size={13} /> Fluxo financeiro</div><h1>Financeiro</h1><p className="subtitle">Receitas exclusivamente dos aluguéis informados nos imóveis.</p></div><Link href="/despesas" className="button button-ghost"><Receipt size={14} /> Gerenciar despesas</Link></div>
    <div className="metrics"><div className="metric-card"><div className="metric-top"><span>Aluguéis mensais</span><span className="metric-icon"><ArrowUpRight size={15} /></span></div><div className="metric-value">{brl(monthlyRent)}</div><div className="metric-foot positive">{rentedUnits} unidades com aluguel</div></div><div className="metric-card"><div className="metric-top"><span>Despesas mensais</span><span className="metric-icon"><Receipt size={15} /></span></div><div className="metric-value">{brl(monthlyExpenses)}</div><div className="metric-foot">Detalhes na aba Despesas</div></div><div className="metric-card"><div className="metric-top"><span>Saldo mensal</span><span className="metric-icon">R$</span></div><div className={`metric-value ${monthlyProfit < 0 ? "negative" : ""}`}>{brl(monthlyProfit)}</div><div className="metric-foot">Receitas − despesas</div></div></div>
    <div className="panel"><div className="panel-heading"><div><h2>Receitas dos imóveis</h2><p>{visibleRentalUnits.length} de {rentalUnits.length} registros · origem: dados dos imóveis</p></div><div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><input className="table-filter" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar imóvel ou local" /><select className="filter-select" value={sort} onChange={(event) => setSort(event.target.value)}><option value="name_asc">Imóvel A–Z</option><option value="value_desc">Maior valor</option><option value="value_asc">Menor valor</option><option value="location_asc">Local A–Z</option><option value="status_asc">Status A–Z</option></select></div></div>{visibleRentalUnits.length ? <div className="table-wrap"><table><thead><tr><th>Imóvel / unidade</th><th>Localidade</th><th>Status</th><th>Valor mensal</th></tr></thead><tbody>{visibleRentalUnits.map((unit) => <tr key={unit.id}><td><strong>{unit.code}</strong><small>{unit.building.name}</small></td><td>{unit.building.city} · {unit.building.state || "—"}</td><td><span className="status status-alugado">Alugado</span></td><td className="positive"><strong>{brl(unit.rent)}</strong></td></tr>)}</tbody></table></div> : <div className="empty-state"><Receipt size={28} /><h3>Nenhuma receita encontrada</h3><p>Ajuste o filtro para visualizar outros registros.</p></div>}</div>
  </div>;
}
