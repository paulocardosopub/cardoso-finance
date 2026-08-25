"use client";

import { ArrowUpRight, CheckCircle2, CircleDollarSign } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { usePortfolio } from "@/components/portfolio-provider";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import { brl } from "@/lib/format";

type Credit = { id: string; value: number; revenue_date: string; competence: string; description: string; origin?: string | null; source_payment_id?: string | null };
export default function CreditosPage() {
  const { organizationId, role, loading } = usePortfolio();
  const [credits, setCredits] = useState<Credit[]>([]);
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (!organizationId || role === "viewer" || role === "employee") return;
    const supabase = createSupabaseBrowserClient(); if (!supabase) return;
    supabase.from("revenues").select("id, value, revenue_date, competence, description, origin, source_payment_id").eq("organization_id", organizationId).order("revenue_date", { ascending: false }).then(({ data, error }) => { if (error) setMessage("Não foi possível carregar os créditos."); else setCredits((data ?? []) as Credit[]); });
  }, [organizationId, role]);
  const total = useMemo(() => credits.reduce((sum, credit) => sum + Number(credit.value || 0), 0), [credits]);
  if (loading) return <div className="content"><div className="empty-state"><p>Carregando créditos...</p></div></div>;
  if (!organizationId) return <div className="content"><div className="empty-state"><CircleDollarSign size={28} /><h3>Nenhuma holding selecionada</h3></div></div>;
  return <div className="content"><div className="page-heading"><div><div className="eyebrow"><ArrowUpRight size={13} /> Entradas confirmadas</div><h1>Créditos</h1><p className="subtitle">Cada confirmação de aluguel cria automaticamente um crédito nesta lista.</p></div></div>{message && <p className="form-error"><CheckCircle2 size={13} /> {message}</p>}<div className="metrics"><div className="metric-card"><div className="metric-top"><span>Créditos registrados</span><span className="metric-icon"><ArrowUpRight size={15} /></span></div><div className="metric-value">{credits.length}</div><div className="metric-foot">Lançamentos de entrada</div></div><div className="metric-card"><div className="metric-top"><span>Total creditado</span><span className="metric-icon">R$</span></div><div className="metric-value">{brl(total)}</div><div className="metric-foot">Valores confirmados</div></div></div><div className="panel"><div className="panel-heading"><div><h2>Créditos</h2><p>Ao desmarcar um pagamento, o crédito correspondente é removido.</p></div></div>{credits.length ? <div className="table-wrap"><table><thead><tr><th>Descrição</th><th>Competência</th><th>Data</th><th>Origem</th><th>Valor</th></tr></thead><tbody>{credits.map((credit) => <tr key={credit.id}><td><strong>{credit.description}</strong>{credit.source_payment_id && <small>Pagamento confirmado</small>}</td><td>{credit.competence ? new Date(`${credit.competence}T12:00:00`).toLocaleDateString("pt-BR") : "—"}</td><td>{credit.revenue_date ? new Date(`${credit.revenue_date}T12:00:00`).toLocaleDateString("pt-BR") : "—"}</td><td>{credit.origin === "lease_payment" ? "Aluguel" : credit.origin || "Manual"}</td><td className="positive"><strong>{brl(Number(credit.value || 0))}</strong></td></tr>)}</tbody></table></div> : <div className="empty-state"><CircleDollarSign size={28} /><h3>Nenhum crédito registrado</h3><p>Confirme um pagamento na aba Aluguéis para criar o primeiro crédito.</p></div>}</div></div>;
}
