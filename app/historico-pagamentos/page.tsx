"use client";

import { CalendarDays, CheckCircle2, CircleDollarSign, History, Paperclip } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { usePortfolio } from "@/components/portfolio-provider";
import { brl } from "@/lib/format";
import { monthLabel } from "@/lib/month";
import { createSupabaseBrowserClient } from "@/lib/supabase";

type PaymentHistoryRow = {
  id: string;
  payment_id?: string | null;
  description: string;
  amount: number;
  payment_date: string;
  competence: string;
  notes?: string | null;
  receipt_path?: string | null;
  registered_at: string;
};

function localDate(value?: string | null) {
  if (!value) return "—";
  return new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR");
}

export default function HistoricoPagamentosPage() {
  const { organizationId, role, actualRole, viewAsMemberId, previewMembers, loading } = usePortfolio();
  const [rows, setRows] = useState<PaymentHistoryRow[]>([]);
  const [loadingRows, setLoadingRows] = useState(true);
  const [message, setMessage] = useState("");

  const loadHistory = useCallback(async () => {
    if (!organizationId || role !== "employee") return;
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;
    setLoadingRows(true);
    const selectedEmployee = actualRole !== "employee" && viewAsMemberId?.startsWith("user:") ? viewAsMemberId.slice(5) : null;
    const result = await supabase.rpc("list_employee_payment_history", { target_org: organizationId, target_employee: selectedEmployee });
    if (result.error) setMessage("Não foi possível carregar o histórico de pagamentos.");
    else setRows((result.data ?? []) as PaymentHistoryRow[]);
    setLoadingRows(false);
  }, [actualRole, organizationId, role, viewAsMemberId]);

  useEffect(() => { void loadHistory(); }, [loadHistory]);

  if (loading) return <div className="content"><div className="empty-state"><p>Carregando sua área segura…</p></div></div>;
  if (role !== "employee") return <div className="content"><div className="empty-state"><History size={28} /><h3>Histórico operacional</h3><p>Esta aba está disponível para a funcionária.</p></div></div>;

  return <div className="content">
    <div className="page-heading"><div><div className="eyebrow"><History size={13} /> OPERAÇÃO DA FUNCIONÁRIA</div><h1>Histórico de pagamentos</h1><p className="subtitle">{actualRole === "employee" ? "Pagamentos confirmados por você, incluindo competências de meses anteriores." : `Pagamentos confirmados por ${previewMembers.find((member) => (member.userId ? `user:${member.userId}` : member.memberId) === viewAsMemberId)?.name ?? "esta funcionária"}, incluindo competências de meses anteriores.`}</p></div><div className="tag"><CalendarDays size={13} /> Todos os meses</div></div>
    {message && <p className="form-error"><CheckCircle2 size={13} /> {message}</p>}
    <section className="metrics"><div className="metric-card"><div className="metric-top"><span>Pagamentos registrados</span><History size={16} /></div><strong className="metric-value">{rows.length}</strong><small className="metric-foot">Somente confirmações existentes no banco</small></div><div className="metric-card"><div className="metric-top"><span>Total recebido</span><CircleDollarSign size={16} /></div><strong className="metric-value">{brl(rows.reduce((sum, row) => sum + Number(row.amount || 0), 0))}</strong><small className="metric-foot">Valores efetivamente confirmados</small></div></section>
    <section className="panel section-gap"><div className="panel-heading"><div><h2>Pagamentos registrados</h2><p>Não há lançamentos criados apenas para preencher esta lista: cada linha vem de um crédito de aluguel confirmado.</p></div></div>{loadingRows ? <div className="empty-state"><p>Carregando histórico…</p></div> : rows.length ? <div className="table-wrap"><table><thead><tr><th>Imóvel / unidade</th><th>Competência</th><th>Data do pagamento</th><th>Valor recebido</th><th>Observação</th><th>Comprovante</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td><strong>{row.description}</strong></td><td>{monthLabel(row.competence.slice(0, 7))}</td><td>{localDate(row.payment_date)}</td><td className="positive"><strong>{brl(Number(row.amount || 0))}</strong></td><td>{row.notes || "—"}</td><td>{row.receipt_path ? <span className="tag"><Paperclip size={12} /> Anexado</span> : "—"}</td></tr>)}</tbody></table></div> : <div className="empty-state"><History size={28} /><h3>{actualRole === "employee" ? "Nenhum pagamento registrado por você" : "Nenhum pagamento registrado pelas funcionárias"}</h3><p>{actualRole === "employee" ? "Quando você confirmar um aluguel, ele aparecerá aqui com a data, competência e valor informados." : "As confirmações reais feitas pelas funcionárias aparecerão aqui."}</p></div>}</section>
  </div>;
}
