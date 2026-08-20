import Link from "next/link";
import { ArrowUpRight, CircleDollarSign, Landmark, MoreHorizontal, Plus, Receipt, TrendingUp } from "lucide-react";
import { WealthChart } from "@/components/wealth-chart";
import { initialBuildingsForApp } from "@/lib/initial-data";
import { brl, compactBrl } from "@/lib/format";

export default function DashboardPage() {
  const totalValue = initialBuildingsForApp.reduce((total, building) => total + building.value, 0);
  const totalRevenue = initialBuildingsForApp.reduce((total, building) => total + building.revenue, 0);
  const totalExpenses = initialBuildingsForApp.reduce((total, building) => total + building.expenses, 0);
  const occupied = initialBuildingsForApp.reduce((total, building) => total + building.occupied, 0);
  const units = initialBuildingsForApp.reduce((total, building) => total + building.units, 0);
  return <div className="content">
    <div className="page-heading"><div><div className="eyebrow"><TrendingUp size={13} /> Dados iniciais importados</div><h1>Visão geral da carteira.</h1><p className="subtitle">Consolidação dos 63 registros de imóveis da sua planilha.</p></div><Link href="/onboarding" className="button button-primary"><Plus size={15} /><span>Adicionar patrimônio</span></Link></div>
    <section className="metrics">
      <Metric icon={<CircleDollarSign size={15} />} label="Patrimônio imobiliário" value={compactBrl(totalValue)} foot={`${initialBuildingsForApp.length} prédios organizados`} positive />
      <Metric icon={<ArrowUpRight size={15} />} label="Aluguéis mensais" value={brl(totalRevenue)} foot="Somente valores informados" positive />
      <Metric icon={<Receipt size={15} />} label="Despesas cadastradas" value={brl(totalExpenses)} foot="Nenhuma na planilha" />
      <Metric icon={<Landmark size={15} />} label="Resultado antes de despesas" value={brl(totalRevenue - totalExpenses)} foot="Receitas menos despesas cadastradas" positive />
    </section>
    <section className="dashboard-grid">
      <div className="panel"><div className="panel-heading"><div><h2>Patrimônio por grupo</h2><p>Valores de avaliação informados na planilha</p></div><button className="icon-btn" aria-label="Mais opções"><MoreHorizontal size={17} /></button></div><div className="legend"><span><i /> Avaliação</span></div><WealthChart /></div>
      <div className="panel"><div className="panel-heading"><div><h2>Ocupação imobiliária</h2><p>Todos os ativos alugáveis</p></div><Link href="/imoveis" className="panel-link">Ver imóveis</Link></div><div className="occupancy"><div className="occupancy-ring" style={{ background: `conic-gradient(var(--accent) 0 ${(occupied / units) * 100}%, #253143 ${(occupied / units) * 100}% 100%)` }}><strong>{Math.round((occupied / units) * 100)}%</strong></div><div className="occupancy-meta"><div><div className="occupancy-line"><span>Unidades ocupadas</span><strong>{occupied}</strong></div><div className="progress"><span style={{ width: `${(occupied / units) * 100}%` }} /></div></div><div><div className="occupancy-line"><span>Unidades vagas</span><strong>{units - occupied}</strong></div><div className="progress"><span style={{ width: `${((units - occupied) / units) * 100}%`, background: "#62b6ff" }} /></div></div><div className="occupancy-line"><span>Receita identificada</span><strong>{brl(totalRevenue)}</strong></div></div></div></div>
      <div className="panel"><div className="panel-heading"><div><h2>Carteira imobiliária</h2><p>Grupos criados a partir dos nomes repetidos da planilha</p></div><Link href="/imoveis" className="panel-link">Ver todos</Link></div><div className="building-list">{initialBuildingsForApp.map((building) => <Link href={`/imoveis/${building.id}`} key={building.id} className="building-row"><div className="building-thumb" /><div className="building-info"><strong>{building.name}</strong><small>{building.city}, {building.state} · {building.units} unidades</small></div><div className="building-value"><strong>{compactBrl(building.value)}</strong><small>{Math.round((building.occupied / building.units) * 100)}% ocupado</small></div></Link>)}</div></div>
      <div className="panel"><div className="panel-heading"><div><h2>Atividade recente</h2><p>Eventos financeiros ainda não cadastrados</p></div></div><div className="empty-state"><Receipt size={28} /><h3>Nenhuma atividade registrada</h3><p>A planilha contém imóveis e aluguéis informados, mas não contém despesas ou histórico de lançamentos.</p></div></div>
    </section>
  </div>;
}

function Metric({ icon, label, value, foot, positive }: { icon: React.ReactNode; label: string; value: string; foot: string; positive?: boolean }) {
  return <div className="metric-card"><div className="metric-top"><span>{label}</span><span className="metric-icon">{icon}</span></div><div className="metric-value">{value}</div><div className={`metric-foot ${positive ? "positive" : ""}`}>{foot}</div></div>;
}
