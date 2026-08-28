"use client";

import Link from "next/link";
import { ArrowUpRight, BellRing, Building2, CalendarDays, ChevronLeft, ChevronRight, CircleDollarSign, Landmark, MapPinned, MoreHorizontal, Plus, Receipt, Tag, TrendingUp, WalletCards } from "lucide-react";
import { WealthChart } from "@/components/wealth-chart";
import { PropertyAlbum } from "@/components/property-album";
import { usePortfolio } from "@/components/portfolio-provider";
import { brl, compactBrl } from "@/lib/format";
import type { Building } from "@/types/domain";
import { buildingPath } from "@/lib/building-path";
import { buildingIsForSale, sortBuildingsForDisplay } from "@/lib/building-order";
import { useEffect, useState } from "react";
import { PropertyMap, type PropertyMapPin } from "@/components/property-map";
import { EmployeeDashboard } from "@/components/employee-dashboard";
import { monthLabel, currentMonthKey, isRentalMonthAvailable, shiftMonth } from "@/lib/month";

function saleUnits(building: Building) { return (building.unitsData ?? []).filter((unit) => unit.status === "venda" || unit.status === "venda_alugado"); }
function isForSale(building: Building) { return buildingIsForSale(building); }
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
  const { buildings, notifications, leasePayments, expenses, loading, organizationId, userName, bankBalance, role, actualRole, viewAsMemberId, previewMembers, memberVisibility, memberSummary, ownershipSummary, refresh } = usePortfolio();
  const [welcomeIndex, setWelcomeIndex] = useState(0);
  const [selectedMonth, setSelectedMonth] = useState(() => currentMonthKey());
  useEffect(() => { setWelcomeIndex(Math.floor(Math.random() * welcomeMessages.length)); }, []);
  const activeBuildings = sortBuildingsForDisplay(buildings.filter((building) => building.status !== "vendido"));
  const totalValue = activeBuildings.reduce((total, building) => total + building.value, 0);
  const occupied = activeBuildings.reduce((total, building) => total + building.occupied, 0);
  const units = activeBuildings.reduce((total, building) => total + building.units, 0);
  const occupancy = units ? Math.round((occupied / units) * 100) : 0;
  const ending = notifications.filter((item) => item.type === "lease_ending").length;
  const adjustments = notifications.filter((item) => item.type === "rent_adjustment").length;
  const currentMonth = selectedMonth;
  const monthPayments = leasePayments.filter((item) => item.competence.startsWith(selectedMonth));
  const monthlyExpected = isRentalMonthAvailable(selectedMonth) ? activeBuildings.flatMap((building) => building.unitsData ?? []).reduce((sum, unit) => sum + (unit.lease && unit.rent > 0 ? unit.rent * (unit.quantity ?? 1) : 0), 0) : 0;
  const monthlyPaid = isRentalMonthAvailable(selectedMonth) ? monthPayments.filter((payment) => payment.status === "paid" || payment.receivedAmount > 0).reduce((sum, payment) => sum + (payment.netAmount || payment.receivedAmount || 0), 0) : 0;
  const selectedMonthlyExpenses = expenses.filter((expense) => expense.expense_kind !== "one_time" || expense.expense_date?.startsWith(selectedMonth)).reduce((sum, expense) => sum + Number(expense.value || 0), 0);
  const selectedMonthlyProfit = monthlyPaid - selectedMonthlyExpenses;
  const unpaidBuildings = activeBuildings.filter((building) => (building.unitsData ?? []).some((unit) => {
    if (!unit.lease || unit.rent <= 0) return false;
    const payment = monthPayments.find((item) => item.leaseId === unit.lease?.id);
    return !payment || (payment.status !== "paid" && payment.status !== "waived" && payment.receivedAmount < payment.expectedAmount);
  }));
  const rentOpen = activeBuildings.flatMap((building) => building.unitsData ?? []).filter((unit) => {
    if (!isRentalMonthAvailable(currentMonth)) return false;
    if (!unit.lease || unit.rent <= 0) return false;
    const payment = leasePayments.find((item) => item.leaseId === unit.lease?.id && item.competence.startsWith(currentMonth));
    return !payment || (payment.status !== "paid" && payment.status !== "waived" && payment.receivedAmount < payment.expectedAmount);
  }).length;
  const saleBuildings = activeBuildings.filter(isForSale);
  if (loading) return <div className="content"><div className="empty-state"><p>Carregando sua carteira...</p></div></div>;
  if (!organizationId) return <div className="content"><div className="empty-state"><Landmark size={30} /><h3>Crie sua primeira organização</h3><p>Depois da criação, os 62 registros válidos da planilha serão importados no Supabase.</p><Link href="/onboarding" className="button button-primary"><Plus size={15} /> Começar</Link></div></div>;
  if (role === "employee") return <EmployeeDashboard buildings={buildings} organizationId={organizationId} userName={userName} refresh={refresh} />;
  if (role === "viewer") return <MemberDashboard buildings={activeBuildings} organizationId={organizationId} userName={userName} viewedMemberName={actualRole !== "viewer" ? previewMembers.find((member) => member.userId === viewAsMemberId || `user:${member.userId}` === viewAsMemberId || `contact:${member.contactId}` === viewAsMemberId || member.memberId === viewAsMemberId)?.name : undefined} visibility={memberVisibility} summary={memberSummary} ownership={ownershipSummary} />;
  return <div className="content">
    <div className="page-heading"><div><div className="eyebrow"><TrendingUp size={13} /> Carteira sincronizada</div><h1>{welcomeMessages[welcomeIndex].replace("{name}", userName)}</h1><p className="subtitle">Dados reais da sua organização, com patrimônio baseado exclusivamente em AVALIAÇÃO. Mês de referência: {monthLabel(selectedMonth)}.</p></div><div className="page-heading-actions"><div className="month-navigator"><button type="button" className="icon-btn" onClick={() => setSelectedMonth((month) => shiftMonth(month, -1))} aria-label="Mês anterior"><ChevronLeft size={16} /></button><CalendarDays size={15} /><strong>{monthLabel(selectedMonth)}</strong><button type="button" className="icon-btn" onClick={() => setSelectedMonth((month) => shiftMonth(month, 1))} aria-label="Próximo mês"><ChevronRight size={16} /></button></div><Link href="/imoveis" className="button button-primary"><Plus size={15} /><span>Gerenciar imóveis</span></Link></div></div>
    <section className="metrics"><Metric href="/patrimonio" icon={<CircleDollarSign size={15} />} label="Patrimônio imobiliário" value={compactBrl(totalValue)} foot={`${buildings.length} prédios organizados`} positive /><Metric href={`/imoveis?month=${selectedMonth}`} icon={<ArrowUpRight size={15} />} label="Aluguéis mensais esperados" value={brl(monthlyExpected)} foot={`Previstos em ${monthLabel(selectedMonth)}`} positive /><Metric href={`/imoveis?month=${selectedMonth}`} icon={<ArrowUpRight size={15} />} label={`Aluguéis mensais atuais (${monthLabel(selectedMonth)})`} value={brl(monthlyPaid)} foot={`Recebidos em ${monthLabel(selectedMonth)}`} positive /><Metric href={`/imoveis?filter=nao-pagos&month=${selectedMonth}`} icon={<Receipt size={15} />} label="Imóveis que ainda não pagaram esse mês" value={String(unpaidBuildings.length)} foot={`Aluguel registrado, sem confirmação em ${monthLabel(selectedMonth)}`} positive={unpaidBuildings.length === 0} /><Metric href={`/despesas?month=${selectedMonth}`} icon={<Receipt size={15} />} label="Despesas mensais" value={brl(selectedMonthlyExpenses)} foot={`Saldo após despesas: ${brl(selectedMonthlyProfit)}`} /><Metric href={`/imoveis?filter=vagos&month=${selectedMonth}`} icon={<Landmark size={15} />} label="Ocupação" value={`${occupancy}%`} foot={`${occupied} de ${units} unidades`} positive /><Metric href="/financeiro" icon={<WalletCards size={15} />} label="Saldo bancário" value={brl(bankBalance)} foot="Após aluguéis, despesas e transferências" positive={bankBalance >= 0} /></section>
    <section className="dashboard-grid">
      <div className="panel"><div className="panel-heading"><div><h2>Patrimônio por grupo</h2><p>Valores atuais gravados no banco</p></div><button className="icon-btn" aria-label="Mais opções"><MoreHorizontal size={17} /></button></div><div className="legend"><span><i /> Avaliação</span></div><WealthChart buildings={activeBuildings} /></div>
      <div className="panel"><div className="panel-heading"><div><h2>Alertas</h2><p>Contratos, reajustes e recebimentos</p></div><BellRing size={17} color="#80e2b0" /></div><div className="payment-line"><span>Contratos terminando<small>Próximos 90 dias</small></span><strong>{ending}</strong></div><div className="payment-line"><span>Reajustes próximos<small>Próximos 60 dias</small></span><strong>{adjustments}</strong></div><Link href="/alugueis" className="payment-line"><span>Aluguéis em aberto<small>Cobrar neste mês</small></span><strong className={rentOpen ? "negative" : "positive"}>{rentOpen}</strong></Link><div className="empty-state" style={{ minHeight: 100 }}>{notifications.length ? notifications.slice(0, 3).map((item) => <div key={item.id} className="activity-item" style={{ width: "100%" }}><h3>{item.title}</h3><p>{item.message}</p></div>) : <p>{rentOpen ? "Há recebimentos pendentes. Veja a aba Aluguéis para cobrar." : "Nenhum alerta financeiro pendente."}</p>}</div></div>
      {saleBuildings.length > 0 && <div className="panel sale-panel"><div className="panel-heading"><div><h2><Tag size={16} /> Imóveis à venda</h2><p>Oportunidades destacadas da sua carteira</p></div><Link href="/imoveis" className="panel-link">Ver lista completa</Link></div><div className="sale-list">{saleBuildings.map((building) => { const availableUnits = saleUnits(building); return <Link href={buildingPath(building)} key={building.id} className="sale-card"><div><strong>{building.name}</strong><small>{building.city}, {building.state} · {availableUnits.length ? `${availableUnits.length} unidade${availableUnits.length > 1 ? "s" : ""} à venda` : "Grupo à venda"}</small>{availableUnits.length > 0 && <span className="sale-codes">{availableUnits.map((unit) => unit.code).join(" · ")}</span>}</div><div className="building-value"><strong>{compactBrl(building.value)}</strong><small>AVALIAÇÃO</small></div></Link>; })}</div></div>}
      <div className="panel"><div className="panel-heading"><div><h2>Atividade recente</h2><p>Movimentações financeiras reais</p></div></div><div className="empty-state"><Receipt size={28} /><h3>Nenhuma atividade registrada</h3><p>A planilha contém imóveis e aluguéis, sem despesas ou histórico de lançamentos.</p></div></div>
      <PropertyAlbum buildings={activeBuildings} organizationId={organizationId} />
    </section>
  </div>;
}

function Metric({ icon, label, value, foot, positive, href }: { icon: React.ReactNode; label: string; value: string; foot: string; positive?: boolean; href?: string }) { const content = <><div className="metric-top"><span>{label}</span><span className="metric-icon">{icon}</span></div><div className="metric-value">{value}</div><div className={`metric-foot ${positive ? "positive" : ""}`}>{foot}</div></>; return href ? <Link href={href} className="metric-card metric-card-link">{content}</Link> : <div className="metric-card">{content}</div>; }

function MemberDashboard({ buildings, organizationId, userName, viewedMemberName, visibility, summary, ownership }: { buildings: Building[]; organizationId: string; userName: string; viewedMemberName?: string; visibility: ReturnType<typeof usePortfolio>["memberVisibility"]; summary: ReturnType<typeof usePortfolio>["memberSummary"]; ownership: ReturnType<typeof usePortfolio>["ownershipSummary"] }) {
  const totalOccupied = buildings.reduce((sum, building) => sum + building.occupied, 0);
  const totalUnits = buildings.reduce((sum, building) => sum + building.units, 0);
  const statusCounts = buildings.reduce<Record<string, number>>((counts, building) => ({ ...counts, [building.status]: (counts[building.status] ?? 0) + 1 }), {});
  const states = buildings.reduce<Record<string, number>>((counts, building) => building.state ? ({ ...counts, [building.state]: (counts[building.state] ?? 0) + 1 }) : counts, {});
  const pins: PropertyMapPin[] = buildings.filter((building) => Number.isFinite(building.latitude) && Number.isFinite(building.longitude)).map((building) => ({ id: building.id, name: building.name, latitude: Number(building.latitude), longitude: Number(building.longitude), status: building.status, tone: building.status === "venda" ? "sale" : building.occupied > 0 ? "rented" : "available", city: [building.city, building.state].filter(Boolean).join(", "), address: building.address, googleMapsUrl: `https://www.google.com/maps/search/?api=1&query=${building.latitude},${building.longitude}` }));
  return <div className="content member-dashboard">
    <div className="page-heading"><div><div className="eyebrow"><TrendingUp size={13} /> Visão consolidada</div><h1>Olá, {viewedMemberName ?? userName}!</h1><p className="subtitle">{viewedMemberName ? `Visualização do membro ${viewedMemberName}.` : "Acompanhe aqui as informações patrimoniais compartilhadas com os membros."} Mês de referência: {monthLabel(currentMonthKey())}.</p></div><span className="tag">Acesso de consulta</span></div>
    <section className="metrics member-dashboard-metrics">
      {visibility.showTotalAssets && <><Metric href="/patrimonio" icon={<CircleDollarSign size={15} />} label="Seu patrimônio" value={compactBrl(summary.totalValue)} foot="Sua participação proporcional" positive /><Metric href="/patrimonio" icon={<Landmark size={15} />} label="Patrimônio total da holding" value={compactBrl(summary.holdingTotalValue)} foot="Valor total dos imóveis" positive /></>}
      <Metric href="/imoveis" icon={<Building2 size={15} />} label="Imóveis" value={String(summary.totalBuildings)} foot={`${summary.totalUnits || totalUnits} unidades cadastradas`} positive />
      {visibility.showPropertyStatus && <Metric href="/imoveis?filter=vagos" icon={<Landmark size={15} />} label="Ocupação" value={`${totalUnits ? Math.round(totalOccupied / totalUnits * 100) : 0}%`} foot={`${totalOccupied} de ${totalUnits} unidades`} positive />}
      {visibility.showRentalInfo && <><Metric href="/creditos" icon={<ArrowUpRight size={15} />} label="Aluguéis recebidos no mês" value={brl(summary.paidRent ?? 0)} foot="Somente pagamentos confirmados" positive /><Metric href="/creditos" icon={<ArrowUpRight size={15} />} label="Sua receita líquida mensal" value={brl(summary.netRevenue ?? summary.totalRent)} foot={`${summary.ownershipPercentage.toFixed(2).replace(".", ",")}% da receita, após despesas`} positive={(summary.netRevenue ?? summary.totalRent) >= 0} /></>}
    </section>
    <section className="dashboard-grid">
      {visibility.showPropertyValues && <div className="panel"><div className="panel-heading"><div><h2>Patrimônio por imóvel</h2><p>Distribuição dos valores compartilhados</p></div></div><WealthChart buildings={buildings} /></div>}
      {visibility.showPropertyStatus && <div className="panel"><div className="panel-heading"><div><h2>Imóveis por status</h2><p>Resumo da situação atual da carteira</p></div></div><div className="member-summary-list">{Object.entries(statusCounts).map(([status, count]) => <div className="setting-row" key={status}><span>{status === "ativo" ? "Ativos" : status === "reforma" ? "Em reforma" : status === "venda" ? "À venda" : status === "vendido" ? "Vendidos" : "Inativos"}</span><strong>{count}</strong></div>)}</div></div>}
      {visibility.showLocations && Object.keys(states).length > 0 && <div className="panel"><div className="panel-heading"><div><h2>Distribuição por estado</h2><p>Localização geral dos imóveis</p></div></div>{Object.entries(states).sort((a, b) => b[1] - a[1]).map(([state, count]) => <div className="setting-row" key={state}><span>{state}</span><strong>{count} {count === 1 ? "imóvel" : "imóveis"}</strong></div>)}</div>}
      {visibility.showOwnershipByBeneficiary && ownership.length > 0 && <div className="panel"><div className="panel-heading"><div><h2>Participações</h2><p>Distribuição autorizada pelos administradores</p></div></div>{ownership.map((item) => <div className="setting-row" key={item.name}><span>{item.name}</span><strong>{item.percentage.toFixed(2).replace(".", ",")}%</strong></div>)}</div>}
      {visibility.showMap && pins.length > 0 && <div className="panel member-map-panel"><div className="panel-heading"><div><h2>Mapa dos imóveis</h2><p>{pins.length} localização{pins.length > 1 ? "ões" : ""} compartilhada{pins.length > 1 ? "s" : ""}</p></div><MapPinned size={17} color="#80e2b0" /></div><PropertyMap pins={pins} /></div>}
      {visibility.showPhotos && <PropertyAlbum buildings={buildings} organizationId={organizationId} />}
    </section>
  </div>;
}

