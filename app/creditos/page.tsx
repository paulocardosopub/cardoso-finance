"use client";

import { ArrowUpRight, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, CircleDollarSign } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { usePortfolio } from "@/components/portfolio-provider";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import { brl } from "@/lib/format";
import { currentMonthKey, monthLabel, shiftMonth } from "@/lib/month";

type Credit = { id: string; value: number; revenue_date: string; competence: string; description: string; origin?: string | null; source_payment_id?: string | null; source_sale_id?: string | null };
export default function CreditosPage() {
  const { organizationId, role, loading } = usePortfolio();
  const [credits, setCredits] = useState<Credit[]>([]);
  const [message, setMessage] = useState("");
  const [selectedMonth, setSelectedMonth] = useState(currentMonthKey);
  useEffect(() => {
    if (!organizationId || role === "viewer" || role === "employee") return;
    const supabase = createSupabaseBrowserClient(); if (!supabase) return;
    supabase.from("revenues").select("id, value, revenue_date, competence, description, origin, source_payment_id, source_sale_id").eq("organization_id", organizationId).order("revenue_date", { ascending: false }).then(({ data, error }) => { if (error) setMessage("Não foi possível carregar os créditos."); else setCredits((data ?? []) as Credit[]); });
  }, [organizationId, role]);
  const visibleCredits = useMemo(() => credits.filter((credit) => !credit.competence || credit.competence.startsWith(selectedMonth)), [credits, selectedMonth]);
  const total = useMemo(() => visibleCredits.reduce((sum, credit) => sum + Number(credit.value || 0), 0), [visibleCredits]);
  if (loading) return <div className="content"><div className="empty-state"><p>Carregando créditos...</p></div></div>;
  if (!organizationId) return <div className="content"><div className="empty-state"><CircleDollarSign size={28} /><h3>Nenhuma holding selecionada</h3></div></div>;
 return <div className="content"><div className="page-heading"><div><div className="eyebrow"><ArrowUpRight size={13} /> Entradas confirmadas</div><h1>Créditos</h1><p className="subtitle">Cada confirmação de aluguel cria automaticamente um crédito nesta lista.</p></div><div className="month-navigator"><button type="button" className="icon-btn" onClick={() => setSelectedMonth((value) => shiftMonth(value, -1))} aria-label="Mês anterior"><ChevronLeft size={16} /></button><CalendarDays size={15} /><strong>{monthLabel(selectedMonth)}</strong><button type="button" className="icon-btn" onClick={() => setSelectedMonth((value) => shiftMonth(value, 1))} aria-label="Próximo mês"><ChevronRight size={16} /></button></div></div>{message && <p className="form-error"><CheckCircle2 size={13} /> {message}</p>}<div className="metrics"><div className="metric-card"><div className="metric-top"><span>Créditos em {monthLabel(selectedMonth)}</span><span className="metric-icon"><ArrowUpRight size={15} /></span></div><div className="metric-value">{visibleCredits.length}</div><div className="metric-foot">Lançamentos de entrada</div></div><div className="metric-card"><div className="metric-top"><span>Total creditado</span><span className="metric-icon">R$</span></div><div className="metric-value">{brl(total)}</div><div className="metric-foot">Valores confirmados</div></div></div><div className="panel"><div className="panel-heading"><div><h2>Créditos de {monthLabel(selectedMonth)}</h2><p>Ao desmarcar um pagamento, o crédito correspondente é removido.</p></div></div>{visibleCredits.length ? <div className="table-wrap"><table><thead><tr><th>Descrição</th><th>Competência</th><th>Data</th><th>Origem</th><th>Valor</th></tr></thead><tbody>{visibleCredits.map((credit) => <tr key={credit.id}><td><strong>{credit.description}</strong>{credit.source_payment_id && <small>Pagamento confirmado</small>}{credit.source_sale_id && <small>Venda confirmada</small>}</td><td>{credit.competence ? new Date(`${credit.competence}T12:00:00`).toLocaleDateString("pt-BR") : "—"}</td><td>{credit.revenue_date ? new Date(`${credit.revenue_date}T12:00:00`).toLocaleDateString("pt-BR") : "—"}</td><td>{credit.origin === "lease_payment" ? "Aluguel" : credit.origin === "property_sale" ? "Venda de imóvel" : credit.origin || "Manual"}</td><td className="positive"><strong>{brl(Number(credit.value || 0))}</strong></td></tr>)}</tbody></table></div> : <div className="empty-state"><CircleDollarSign size={28} /><h3>Nenhum crédito registrado</h3><p>Confirme um pagamento na aba Aluguéis para criar o primeiro crédito.</p></div>}</div></div>;
}

