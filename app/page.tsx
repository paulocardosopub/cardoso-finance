"use client";

import Link from "next/link";
import { ArrowUpRight, BellRing, CircleDollarSign, Landmark, MoreHorizontal, Plus, Receipt, Tag, TrendingUp } from "lucide-react";
import { WealthChart } from "@/components/wealth-chart";
import { PropertyAlbum } from "@/components/property-album";
import { usePortfolio } from "@/components/portfolio-provider";
import { brl, compactBrl } from "@/lib/format";
import type { Building } from "@/types/domain";
import { useEffect, useState } from "react";

function saleUnits(building: Building) { return (building.unitsData ?? []).filter((unit) => unit.status === "venda"); }
function isForSale(building: Building) { return building.status === "venda" || saleUnits(building).length > 0; }
const welcomeMessages = [
  "Bem-vindo de volta, {name}!",
  "Bom te ver por aqui, {name}!",
  "Que bom ter você de volta, {name}!",
  "Tudo pronto para hoje, {name}?",
  "Vamos cuidar da sua carteira, {name}?",
  "Sua visão financeira está esperando por você, {name}.",
  "Olá, {name}! Vamos acompanhar seus imóveis?",
  "Mais um passo para organizar seu patrimônio, {name}.",
  "Seja bem-vindo, {name}! Aqui está sua carteira.",
  "Pronto para uma nova visão da sua carteira, {name}?",
];

export default function DashboardPage() {
  const { buildings, notifications, loading, organizationId, userName } = usePortfolio();
  const [welcomeIndex, setWelcomeIndex] = useState(0);
  useEffect(() => { setWelcomeIndex(Math.floor(Math.random() * welcomeMessages.length)); }, []);
  const totalValue = buildings.reduce((total, building) => total + building.value, 0);
  const totalRevenue = buildings.reduce((total, building) => total + building.revenue, 0);
  const occupied = buildings.reduce((total, building) => total + building.occupied, 0);
  const units = buildings.reduce((total, building) => total + building.units, 0);
  const occupancy = units ? Math.round((occupied / units) * 100) : 0;
  const ending = notifications.filter((item) => item.type === "lease_ending").length;
  const adjustments = notifications.filter((item) => item.type === "rent_adjustment").length;
  const saleBuildings = buildings.filter(isForSale);
  if (loading) return <div className="content"><div className="empty-state"><p>Carregando sua carteira...</p></div></div>;
  if (!organizationId) return <div className="content"><div className="empty-state"><Landmark size={30} /><h3>Crie sua primeira organização</h3><p>Depois da criação, os 62 registros válidos da planilha serão importados no Supabase.</p><Link href="/onboarding" className="button button-primary"><Plus size={15} /> Começar</Link></div></div>;
  return <div className="content">
    <div className="page-heading"><div><div className="eyebrow"><TrendingUp size={13} /> Carteira sincronizada</div><h1>{welcomeMessages[welcomeIndex].replace("{name}", userName)}</h1><p className="subtitle">Dados reais da sua organização, com patrimônio baseado exclusivamente em AVALIAÇÃO.</p></div><Link href="/imoveis" className="button button-primary"><Plus size={15} /><span>Gerenciar imóveis</span></Link></div>
    <section className="metrics"><Metric icon={<CircleDollarSign size={15} />} label="Patrimônio imobiliário" value={compactBrl(totalValue)} foot={`${buildings.length} prédios organizados`} positive /><Metric icon={<ArrowUpRight size={15} />} label="Aluguéis mensais" value={brl(totalRevenue)} foot="Somente aluguéis informados" positive /><Metric icon={<Receipt size={15} />} label="Despesas cadastradas" value={brl(0)} foot="Nenhuma cadastrada" /><Metric icon={<Landmark size={15} />} label="Ocupação" value={`${occupancy}%`} foot={`${occupied} de ${units} unidades`} positive /></section>
    <section className="dashboard-grid">
      <div className="panel"><div className="panel-heading"><div><h2>Patrimônio por grupo</h2><p>Valores atuais gravados no banco</p></div><button className="icon-btn" aria-label="Mais opções"><MoreHorizontal size={17} /></button></div><div className="legend"><span><i /> Avaliação</span></div><WealthChart buildings={buildings} /></div>
      <div className="panel"><div className="panel-heading"><div><h2>Alertas</h2><p>Contratos e reajustes registrados</p></div><BellRing size={17} color="#80e2b0" /></div><div className="payment-line"><span>Contratos terminando<small>Próximos 90 dias</small></span><strong>{ending}</strong></div><div className="payment-line"><span>Reajustes próximos<small>Próximos 60 dias</small></span><strong>{adjustments}</strong></div><div className="empty-state" style={{ minHeight: 100 }}>{notifications.length ? notifications.slice(0, 3).map((item) => <div key={item.id} className="activity-item" style={{ width: "100%" }}><h3>{item.title}</h3><p>{item.message}</p></div>) : <p>Nenhum contrato com datas cadastradas.</p>}</div></div>
      {saleBuildings.length > 0 && <div className="panel sale-panel"><div className="panel-heading"><div><h2><Tag size={16} /> Imóveis à venda</h2><p>Oportunidades destacadas da sua carteira</p></div><Link href="/imoveis" className="panel-link">Ver lista completa</Link></div><div className="sale-list">{saleBuildings.map((building) => { const availableUnits = saleUnits(building); return <Link href={`/imoveis/${building.id}`} key={building.id} className="sale-card"><div><strong>{building.name}</strong><small>{building.city}, {building.state} · {availableUnits.length ? `${availableUnits.length} unidade${availableUnits.length > 1 ? "s" : ""} à venda` : "Grupo à venda"}</small>{availableUnits.length > 0 && <span className="sale-codes">{availableUnits.map((unit) => unit.code).join(" · ")}</span>}</div><div className="building-value"><strong>{compactBrl(building.value)}</strong><small>AVALIAÇÃO</small></div></Link>; })}</div></div>}
      <div className="panel"><div className="panel-heading"><div><h2>Atividade recente</h2><p>Movimentações financeiras reais</p></div></div><div className="empty-state"><Receipt size={28} /><h3>Nenhuma atividade registrada</h3><p>A planilha contém imóveis e aluguéis, sem despesas ou histórico de lançamentos.</p></div></div>
      <PropertyAlbum buildings={buildings} organizationId={organizationId} />
    </section>
  </div>;
}

function Metric({ icon, label, value, foot, positive }: { icon: React.ReactNode; label: string; value: string; foot: string; positive?: boolean }) { return <div className="metric-card"><div className="metric-top"><span>{label}</span><span className="metric-icon">{icon}</span></div><div className="metric-value">{value}</div><div className={`metric-foot ${positive ? "positive" : ""}`}>{foot}</div></div>; }
