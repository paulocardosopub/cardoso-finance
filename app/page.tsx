import Link from "next/link";
import { ArrowUpRight, CircleDollarSign, Landmark, MoreHorizontal, Plus, Receipt, TrendingUp } from "lucide-react";
import { WealthChart } from "@/components/wealth-chart";
import { demoActivities, demoBuildings } from "@/lib/demo-data";
import { brl, compactBrl } from "@/lib/format";

export default function DashboardPage() {
  const totalValue = demoBuildings.reduce((total, building) => total + building.value, 0);
  const totalRevenue = demoBuildings.reduce((total, building) => total + building.revenue, 0);
  const totalExpenses = demoBuildings.reduce((total, building) => total + building.expenses, 0);
  const occupied = demoBuildings.reduce((total, building) => total + building.occupied, 0);
  const units = demoBuildings.reduce((total, building) => total + building.units, 0);
  return <div className="content">
    <div className="page-heading"><div><div className="eyebrow"><TrendingUp size={13} /> Dados iniciais importados</div><h1>Boa tarde, Paulo.</h1><p className="subtitle">Visão consolidada dos 63 registros de imóveis da sua planilha.</p></div><Link href="/onboarding" className="button button-primary"><Plus size={15} /><span>Adicionar patrimônio</span></Link></div>
    <section className="metrics">
      <Metric icon={<CircleDollarSign size={15} />} label="Patrimônio imobiliário" value={compactBrl(totalValue)} foot={`${demoBuildings.length} prédios organizados`} positive />
      <Metric icon={<ArrowUpRight size={15} />} label="Receita mensal" value={brl(totalRevenue)} foot="↑ 8,2% vs. julho" positive />
      <Metric icon={<Receipt size={15} />} label="Despesas mensais" value={brl(totalExpenses)} foot="12 lançamentos" />
      <Metric icon={<Landmark size={15} />} label="Resultado mensal" value={brl(totalRevenue - totalExpenses)} foot="Margem de 70,5%" positive />
    </section>
    <section className="dashboard-grid">
      <div className="panel"><div className="panel-heading"><div><h2>Evolução patrimonial</h2><p>Patrimônio consolidado nos últimos 6 meses</p></div><button className="icon-btn" aria-label="Mais opções"><MoreHorizontal size={17} /></button></div><div className="legend"><span><i /> Patrimônio</span><span><i className="blue" /> Projeção</span></div><WealthChart /></div>
      <div className="panel"><div className="panel-heading"><div><h2>Ocupação imobiliária</h2><p>Todos os ativos alugáveis</p></div><Link href="/imoveis" className="panel-link">Ver imóveis</Link></div><div className="occupancy"><div className="occupancy-ring" style={{ background: `conic-gradient(var(--accent) 0 ${(occupied / units) * 100}%, #253143 ${(occupied / units) * 100}% 100%)` }}><strong>{Math.round((occupied / units) * 100)}%</strong></div><div className="occupancy-meta"><div><div className="occupancy-line"><span>Unidades ocupadas</span><strong>{occupied}</strong></div><div className="progress"><span style={{ width: `${(occupied / units) * 100}%` }} /></div></div><div><div className="occupancy-line"><span>Unidades vagas</span><strong>{units - occupied}</strong></div><div className="progress"><span style={{ width: `${((units - occupied) / units) * 100}%`, background: "#62b6ff" }} /></div></div><div className="occupancy-line"><span>Receita identificada</span><strong>{brl(totalRevenue)}</strong></div></div></div></div>
      <div className="panel"><div className="panel-heading"><div><h2>Carteira imobiliária</h2><p>Ativos sob gestão da holding</p></div><Link href="/imoveis" className="panel-link">Ver todos</Link></div><div className="building-list">{demoBuildings.map((building) => <Link href={`/imoveis/${building.id}`} key={building.id} className="building-row"><div className="building-thumb" /><div className="building-info"><strong>{building.name}</strong><small>{building.city}, {building.state} · {building.units} unidades</small></div><div className="building-value"><strong>{compactBrl(building.value)}</strong><small>{Math.round((building.occupied / building.units) * 100)}% ocupado</small></div></Link>)}</div></div>
      <div className="panel"><div className="panel-heading"><div><h2>Atividade recente</h2><p>Últimas alterações na organização</p></div><Link href="/organizacao" className="panel-link">Histórico</Link></div><div className="activity-list">{demoActivities.map((activity) => <div className="activity-item" key={activity.id}><h3>{activity.title}</h3><p>{activity.detail}</p><strong>{activity.value}</strong><time>{activity.date}</time></div>)}</div></div>
    </section>
  </div>;
}

function Metric({ icon, label, value, foot, positive }: { icon: React.ReactNode; label: string; value: string; foot: string; positive?: boolean }) {
  return <div className="metric-card"><div className="metric-top"><span>{label}</span><span className="metric-icon">{icon}</span></div><div className="metric-value">{value}</div><div className={`metric-foot ${positive ? "positive" : ""}`}>{foot}</div></div>;
}
