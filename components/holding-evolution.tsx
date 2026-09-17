"use client";

import { useEffect, useState } from "react";
import { Area, AreaChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Activity, BarChart3, Building2, CheckCircle2, ChevronLeft, ChevronRight, Home, TrendingDown, TrendingUp } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import { brl, compactBrl } from "@/lib/format";
import { currentMonthKey, monthLabel, shiftMonth } from "@/lib/month";

type EvolutionMonth = {
  month: string;
  totalUnits: number;
  occupiedUnits: number;
  vacantUnits: number;
  occupancyRate: number;
  monthlyIncome: number;
  newRentalIncome: number;
  rentAdjustmentIncome: number;
  newRentals: number;
  vacatedUnits: number;
  incomeChangePercent: number;
};

type EvolutionEvent = {
  id: string;
  eventType: string;
  occurredAt: string;
  buildingName: string;
  unitCode?: string | null;
  oldStatus?: string | null;
  newStatus?: string | null;
  oldRent?: number | null;
  newRent?: number | null;
  oldTenantName?: string | null;
  newTenantName?: string | null;
  monthlyImpact: number;
  responsibleName?: string | null;
};

type EvolutionResponse = { months?: EvolutionMonth[]; events?: EvolutionEvent[] };

function monthShort(value: string) {
  return monthLabel(value).replace(/ de \d{4}$/i, "").slice(0, 3);
}

function eventDescription(event: EvolutionEvent) {
  const unit = `${event.buildingName}${event.unitCode ? ` · ${event.unitCode}` : ""}`;
  if (event.eventType === "lease_created" || (event.eventType === "status_changed" && event.newStatus === "rented")) return `${unit} passou a ser alugada${event.newRent ? ` por ${brl(Number(event.newRent))}/mês` : ""}.`;
  if (event.eventType === "lease_status_changed" && event.newStatus === "vacant") return `${unit} ficou desocupada.`;
  if (event.eventType === "unit_deleted" || event.eventType === "lease_deleted") return `${unit} foi removida do controle operacional.`;
  if (event.eventType === "rent_changed") return `Aluguel de ${unit} alterado de ${brl(Number(event.oldRent ?? 0))} para ${brl(Number(event.newRent ?? 0))}.`;
  if (event.eventType === "tenant_changed") return `Inquilino de ${unit} alterado${event.newTenantName ? ` para ${event.newTenantName}` : ""}.`;
  if (event.eventType === "unit_created") return `${unit} foi adicionada à carteira.`;
  return `Status de ${unit} alterado de ${event.oldStatus ?? "—"} para ${event.newStatus ?? "—"}.`;
}

function eventLabel(event: EvolutionEvent) {
  if (event.eventType === "lease_created" || (event.eventType === "status_changed" && event.newStatus === "rented")) return "Nova locação";
  if (event.eventType === "lease_status_changed" || event.eventType === "status_changed") return event.newStatus === "vacant" ? "Unidade desocupada" : "Status atualizado";
  if (event.eventType === "rent_changed") return "Aluguel atualizado";
  if (event.eventType === "tenant_changed") return "Inquilino atualizado";
  if (event.eventType === "unit_created") return "Unidade adicionada";
  if (event.eventType === "unit_deleted" || event.eventType === "lease_deleted") return "Registro removido";
  return "Atualização operacional";
}

export function HoldingEvolution({ organizationId }: { organizationId: string }) {
  const [months, setMonths] = useState<EvolutionMonth[]>([]);
  const [events, setEvents] = useState<EvolutionEvent[]>([]);
  const [periodStart, setPeriodStart] = useState(() => shiftMonth(currentMonthKey(), -5));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    if (!supabase || !organizationId) return;
    let active = true;
    const load = async () => {
      const result = await supabase.rpc("get_holding_evolution", { target_org: organizationId, target_start_month: `${periodStart}-01`, target_month_count: 6 });
      if (!active) return;
      if (result.error) { setError(result.error.message); setLoading(false); return; }
      const data = (result.data ?? {}) as EvolutionResponse;
      setMonths((data.months ?? []).map((item) => ({ ...item, totalUnits: Number(item.totalUnits ?? 0), occupiedUnits: Number(item.occupiedUnits ?? 0), vacantUnits: Number(item.vacantUnits ?? 0), occupancyRate: Number(item.occupancyRate ?? 0), monthlyIncome: Number(item.monthlyIncome ?? 0), newRentals: Number(item.newRentals ?? 0), vacatedUnits: Number(item.vacatedUnits ?? 0), newRentalIncome: Number(item.newRentalIncome ?? 0), rentAdjustmentIncome: Number(item.rentAdjustmentIncome ?? 0), incomeChangePercent: Number(item.incomeChangePercent ?? 0) })));
      setEvents((data.events ?? []).map((item) => ({ ...item, monthlyImpact: Number(item.monthlyImpact ?? 0) })));
      setLoading(false);
    };
    void load();
    const channel = supabase.channel(`cardoso-evolution-${organizationId}`).on("postgres_changes", { event: "*", schema: "public", table: "unit_evolution_history", filter: `organization_id=eq.${organizationId}` }, () => { void load(); }).subscribe();
    return () => { active = false; void supabase.removeChannel(channel); };
  }, [organizationId, periodStart]);

  if (loading) return <section className="panel evolution-panel"><div className="panel-heading"><div><h2>Evolução da holding</h2><p>Carregando histórico operacional…</p></div><Activity size={17} color="#80e2b0" /></div></section>;
  if (error) return <section className="panel evolution-panel"><div className="panel-heading"><div><h2>Evolução da holding</h2><p>Não foi possível carregar a evolução agora.</p></div><Activity size={17} color="#ff8c8c" /></div><p className="form-error">{error}</p></section>;
  if (!months.length) return <section className="panel evolution-panel"><div className="panel-heading"><div><h2>Evolução da holding</h2><p>Ainda não há dados históricos suficientes.</p></div><Activity size={17} color="#80e2b0" /></div><div className="empty-state" style={{ minHeight: 100 }}><BarChart3 size={25} /><p>As alterações futuras serão registradas automaticamente por unidade.</p></div></section>;

  const current = months[months.length - 1];
  return <section className="panel evolution-panel">
    <div className="panel-heading"><div><h2>Evolução da holding</h2><p>Dados reais por unidade · {monthLabel(months[0].month)} a {monthLabel(months[months.length - 1].month)}</p></div><div className="evolution-period-actions"><button type="button" className="icon-btn" onClick={() => setPeriodStart((month) => shiftMonth(month, -6))} aria-label="Período anterior"><ChevronLeft size={16} /></button><Activity size={17} color="#80e2b0" /><button type="button" className="icon-btn" disabled={periodStart >= shiftMonth(currentMonthKey(), -5)} onClick={() => setPeriodStart((month) => shiftMonth(month, 6))} aria-label="Próximo período"><ChevronRight size={16} /></button></div></div>
    <div className="evolution-metrics">
      <div className="evolution-stat"><span><Building2 size={14} /> Unidades</span><strong>{current.totalUnits}</strong><small>{current.occupiedUnits} ocupadas · {current.vacantUnits} livres · +{current.newRentals} alugadas · −{current.vacatedUnits} desocupadas</small></div>
      <div className="evolution-stat"><span><Home size={14} /> Ocupação</span><strong>{current.occupancyRate.toFixed(1).replace(".", ",")}%</strong><small>Meta acompanhada por mês</small></div>
      <div className="evolution-stat"><span><TrendingUp size={14} /> Aluguel mensal</span><strong>{brl(current.monthlyIncome)}</strong><small className={current.incomeChangePercent >= 0 ? "positive" : "negative"}>{current.incomeChangePercent >= 0 ? "+" : ""}{current.incomeChangePercent.toFixed(1).replace(".", ",")}% vs. mês anterior</small></div>
      <div className="evolution-stat"><span><CheckCircle2 size={14} /> Novos valores</span><strong>{brl(current.newRentalIncome + current.rentAdjustmentIncome)}</strong><small>{brl(current.newRentalIncome)} locações · {brl(current.rentAdjustmentIncome)} reajustes</small></div>
    </div>
    <div className="evolution-chart-grid">
      <div className="evolution-chart"><h3>Aluguel mensal</h3><p>Valor esperado das unidades alugadas</p><ResponsiveContainer width="100%" height={245}><AreaChart data={months}><defs><linearGradient id="evolutionIncome" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#80e2b0" stopOpacity={0.35} /><stop offset="95%" stopColor="#80e2b0" stopOpacity={0} /></linearGradient></defs><CartesianGrid stroke="#263145" strokeDasharray="3 3" vertical={false} /><XAxis dataKey="month" tickFormatter={monthShort} stroke="#758197" fontSize={11} /><YAxis tickFormatter={(value) => compactBrl(Number(value))} stroke="#758197" fontSize={10} width={55} /><Tooltip formatter={(value) => brl(Number(value))} labelFormatter={(label) => monthLabel(String(label))} /><Area type="monotone" dataKey="monthlyIncome" name="Aluguel" stroke="#80e2b0" fill="url(#evolutionIncome)" strokeWidth={2} /></AreaChart></ResponsiveContainer></div>
      <div className="evolution-chart"><h3>Ocupação</h3><p>Unidades ocupadas, livres e taxa</p><ResponsiveContainer width="100%" height={245}><LineChart data={months}><CartesianGrid stroke="#263145" strokeDasharray="3 3" vertical={false} /><XAxis dataKey="month" tickFormatter={monthShort} stroke="#758197" fontSize={11} /><YAxis stroke="#758197" fontSize={10} allowDecimals={false} /><Tooltip formatter={(value, name) => [name === "Taxa" ? `${Number(value).toFixed(1).replace(".", ",")}%` : Number(value), name]} labelFormatter={(label) => monthLabel(String(label))} /><Legend /><Line type="monotone" dataKey="occupiedUnits" name="Ocupadas" stroke="#80e2b0" strokeWidth={2} dot={{ r: 2 }} /><Line type="monotone" dataKey="vacantUnits" name="Livres" stroke="#62b6ff" strokeWidth={2} dot={{ r: 2 }} /><Line type="monotone" dataKey="occupancyRate" name="Taxa" stroke="#f0be4a" strokeWidth={2} dot={{ r: 2 }} /></LineChart></ResponsiveContainer></div>
    </div>
    <div className="evolution-timeline"><div className="panel-heading"><div><h3>Histórico operacional</h3><p>Alterações comprovadas em imóveis e unidades</p></div><span className="tag">{events.length} eventos</span></div>{events.length ? <div className="activity-list">{events.slice(0, 30).map((event) => { const positive = event.monthlyImpact > 0; return <div className="activity-item" key={event.id}><h3>{new Date(event.occurredAt).toLocaleDateString("pt-BR")} · {eventLabel(event)}</h3><p>{eventDescription(event)}{event.responsibleName ? ` Responsável: ${event.responsibleName}.` : ""}</p>{event.monthlyImpact !== 0 && <strong className={positive ? "positive" : "negative"}>{positive ? "+" : "−"}{brl(Math.abs(event.monthlyImpact))}/mês</strong>}<time>{new Date(event.occurredAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</time></div>; })}</div> : <div className="empty-state" style={{ minHeight: 90 }}><TrendingDown size={24} /><p>Nenhuma alteração registrada nos últimos meses.</p></div>}</div>
  </section>;
}
