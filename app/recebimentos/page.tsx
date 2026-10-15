"use client";

import { CalendarDays, ChevronLeft, ChevronRight, CircleDollarSign, FileCheck2, LockKeyhole } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { usePortfolio } from "@/components/portfolio-provider";
import { brl, compactBrl } from "@/lib/format";
import { currentMonthKey, monthLabel, shiftMonth } from "@/lib/month";
import { createSupabaseBrowserClient } from "@/lib/supabase";

type ReportItem = { report_id: string; competence: string; monthly_target: number; sent_at: string | null; item_id: string; member_ref: string; member_name: string; personal_expenses: number; holding_expenses: number; total_expenses: number; net_amount: number };

export default function RecebimentosPage() {
  const { organizationId, role, actualRole, viewAsMemberId, loading } = usePortfolio();
  const [selectedMonth, setSelectedMonth] = useState(currentMonthKey);
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [loadingReports, setLoadingReports] = useState(true);
  const [error, setError] = useState("");
  const [reportRefresh, setReportRefresh] = useState(0);

  useEffect(() => {
    if (!organizationId || role !== "viewer") return;
    let active = true;
    async function loadReports() {
      const supabase = createSupabaseBrowserClient();
      if (!supabase) return;
      setLoadingReports(true); setError("");
      const user = (await supabase.auth.getUser()).data.user;
      const previewing = actualRole !== "viewer" && Boolean(viewAsMemberId);
      const userRef = previewing && viewAsMemberId?.startsWith("user:") ? viewAsMemberId.slice(5) : previewing ? null : user?.id ?? null;
      const contactRef = previewing && viewAsMemberId?.startsWith("contact:") ? viewAsMemberId.slice(8) : null;
      const result = await supabase.rpc("list_member_income_reports", { target_org: organizationId, target_member_user: userRef, target_member_contact: contactRef });
      if (!active) return;
      if (result.error) setError(result.error.message);
      else setReports((result.data ?? []) as ReportItem[]);
      setLoadingReports(false);
    }
    void loadReports();
    return () => { active = false; };
  }, [actualRole, organizationId, reportRefresh, role, viewAsMemberId]);

  useEffect(() => {
    if (!organizationId || role !== "viewer") return;
    const supabase = createSupabaseBrowserClient();
    const channel = supabase?.channel(`income-receipts-${organizationId}`);
    if (!channel) return;
    channel
      .on("postgres_changes", { event: "*", schema: "public", table: "income_division_reports", filter: `organization_id=eq.${organizationId}` }, () => setReportRefresh((current) => current + 1))
      .on("postgres_changes", { event: "*", schema: "public", table: "income_division_report_items", filter: `organization_id=eq.${organizationId}` }, () => setReportRefresh((current) => current + 1))
      .subscribe();
    return () => { void supabase?.removeChannel(channel); };
  }, [organizationId, role]);

  const report = useMemo(() => reports.find((item) => String(item.competence).slice(0, 7) === selectedMonth) ?? null, [reports, selectedMonth]);
  const reportStatus = report ? `Publicado em ${report.sent_at ? new Date(report.sent_at).toLocaleDateString("pt-BR") : ""}` : "Ainda não publicado";

  if (loading) return <div className="content"><div className="empty-state"><p>Carregando seus recebimentos…</p></div></div>;
  if (role !== "viewer") return <div className="content"><div className="access-gate-card panel division-access-card"><LockKeyhole size={27} /><h2>Área dos membros</h2><p>Abra esta página usando a visualização como membro para consultar um relatório publicado.</p></div></div>;

  return <div className="content income-receipts-page"><div className="page-heading"><div><div className="eyebrow"><CircleDollarSign size={13} /> Área do membro</div><h1>Recebimentos</h1><p className="subtitle">Consulte quanto está previsto para receber depois dos gastos do mês.</p></div></div><div className="panel income-receipts-toolbar"><div className="month-navigator"><button className="icon-btn" onClick={() => setSelectedMonth((month) => shiftMonth(month, -1))} aria-label="Mês anterior"><ChevronLeft size={16} /></button><div><small>Mês de vigência</small><strong>{monthLabel(selectedMonth)}</strong></div><button className="icon-btn" onClick={() => setSelectedMonth((month) => shiftMonth(month, 1))} aria-label="Próximo mês"><ChevronRight size={16} /></button></div><div className={`income-report-status ${report ? "sent" : "draft"}`}><span>{report ? <FileCheck2 size={13} /> : <CalendarDays size={13} />}</span><div><strong>{reportStatus}</strong><small>{report ? "Este relatório foi liberado pelo gestor." : "O gestor ainda não liberou este mês."}</small></div></div></div>{error && <div className="division-alert error">Não foi possível carregar os recebimentos deste mês.</div>}{loadingReports ? <div className="panel empty-state"><p>Carregando relatório…</p></div> : report ? <><div className="metrics income-receipts-metrics"><div className="metric-card"><div className="metric-top"><span>Valor mensal definido</span><CircleDollarSign size={15} /></div><div className="metric-value">{compactBrl(Number(report.monthly_target || 0))}</div><div className="metric-foot">Mesma meta para todos os membros</div></div><div className="metric-card"><div className="metric-top"><span>Gastos pessoais</span><CircleDollarSign size={15} /></div><div className="metric-value">{compactBrl(Number(report.personal_expenses || 0))}</div><div className="metric-foot">Responsabilidades individuais</div></div><div className="metric-card"><div className="metric-top"><span>Parcela da holding</span><CircleDollarSign size={15} /></div><div className="metric-value">{compactBrl(Number(report.holding_expenses || 0))}</div><div className="metric-foot">Responsabilidade rateada</div></div><div className="metric-card"><div className="metric-top"><span>Pix / depósito previsto</span><CircleDollarSign size={15} /></div><div className="metric-value">{compactBrl(Number(report.net_amount || 0))}</div><div className="metric-foot">Meta menos gastos do mês</div></div></div><section className="panel income-receipt-card"><div className="panel-heading"><div><h2>Resumo de {monthLabel(selectedMonth)}</h2><p>Este é o valor extra previsto além dos gastos registrados para sua responsabilidade.</p></div><span className={Number(report.net_amount || 0) >= 0 ? "income-receivable-badge" : "income-negative-badge"}>{brl(Number(report.net_amount || 0))}</span></div><div className="income-receipt-lines"><div><span>Valor mensal definido</span><strong>{brl(Number(report.monthly_target || 0))}</strong></div><div><span>Gastos pessoais</span><strong>− {brl(Number(report.personal_expenses || 0))}</strong></div><div><span>Parcela da holding</span><strong>− {brl(Number(report.holding_expenses || 0))}</strong></div><div className="total"><span>Recebimento previsto</span><strong>{brl(Number(report.net_amount || 0))}</strong></div></div></section></> : <section className="panel empty-state income-not-published"><CalendarDays size={28} /><h2>Relatório ainda não enviado</h2><p>O gestor precisa enviar o relatório de {monthLabel(selectedMonth)} para que ele apareça aqui.</p></section>}</div>;
}
