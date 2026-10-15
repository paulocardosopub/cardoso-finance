"use client";

import { CalendarDays, Check, ChevronLeft, ChevronRight, CircleDollarSign, FileCheck2, Plus, Save, UsersRound, X } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { usePortfolio } from "@/components/portfolio-provider";
import { brl, compactBrl } from "@/lib/format";
import { calculateIncomeDivision, memberReference, type IncomeDivisionMember } from "@/lib/income-division";
import { currentMonthKey, monthLabel, shiftMonth } from "@/lib/month";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import type { ExpenseKind } from "@/types/domain";

type ReportRow = { id: string; competence: string; monthly_target: number; status: "draft" | "sent"; sent_at?: string | null; sent_by?: string | null };
type ExpenseForm = { description: string; value: string; kind: ExpenseKind; category: string; responsibleRef: string };

const kindLabels: Record<ExpenseKind, string> = { fixed: "Fixa mensal", recurring: "Recorrente", one_time: "Avulsa" };
const todayForMonth = (month: string) => `${month}-01`;

function parseMoney(value: string) {
  const normalized = value.trim().replace(/R\$\s?/g, "").replace(/\./g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function memberFromPreview(member: { memberId: string; userId: string | null; contactId: string | null; name: string; ownershipPercentage?: number }): IncomeDivisionMember {
  return { memberId: member.memberId, userId: member.userId, contactId: member.contactId, name: member.name, ownershipPercentage: member.ownershipPercentage ?? 0 };
}

export default function IncomeDivisionPanel() {
  const { organizationId, role, expenses, previewMembers, refresh } = usePortfolio();
  const [selectedMonth, setSelectedMonth] = useState(currentMonthKey);
  const [targetValue, setTargetValue] = useState("");
  const [report, setReport] = useState<ReportRow | null>(null);
  const [reportLoading, setReportLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [creatingExpense, setCreatingExpense] = useState(false);
  const [expenseForm, setExpenseForm] = useState<ExpenseForm>({ description: "", value: "", kind: "recurring", category: "Operacional", responsibleRef: "holding" });

  const members = useMemo(() => previewMembers.filter((member) => member.role !== "employee").map(memberFromPreview), [previewMembers]);
  const targetAmount = parseMoney(targetValue);
  const calculation = useMemo(() => calculateIncomeDivision(expenses, members, selectedMonth, targetAmount), [expenses, members, selectedMonth, targetAmount]);

  useEffect(() => {
    if (!organizationId) return;
    let active = true;
    async function loadReport() {
      const supabase = createSupabaseBrowserClient();
      if (!supabase) return;
      setReportLoading(true);
      const result = await supabase.from("income_division_reports").select("id, competence, monthly_target, status, sent_at, sent_by").eq("organization_id", organizationId).eq("competence", todayForMonth(selectedMonth)).maybeSingle();
      if (!active) return;
      if (result.error) {
        setReport(null);
        setError(result.error.message);
      } else {
        const row = result.data as Record<string, unknown> | null;
        const next = row ? { id: String(row.id), competence: String(row.competence), monthly_target: Number(row.monthly_target ?? 0), status: String(row.status) === "sent" ? "sent" as const : "draft" as const, sent_at: row.sent_at ? String(row.sent_at) : null, sent_by: row.sent_by ? String(row.sent_by) : null } : null;
        setReport(next);
        setTargetValue(next ? String(next.monthly_target) : "");
        setError("");
      }
      setReportLoading(false);
    }
    void loadReport();
    return () => { active = false; };
  }, [organizationId, selectedMonth]);

  async function persistReport(status: "draft" | "sent") {
    if (!organizationId || role === "viewer") return;
    if (targetAmount < 0) { setError("Informe um valor mensal válido."); return; }
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;
    setSaving(true); setError(""); setMessage("");
    try {
      const user = (await supabase.auth.getUser()).data.user;
      const upsert = await supabase.from("income_division_reports").upsert({ organization_id: organizationId, competence: todayForMonth(selectedMonth), monthly_target: targetAmount, status, sent_at: status === "sent" ? new Date().toISOString() : null, sent_by: status === "sent" ? user?.id ?? null : null }, { onConflict: "organization_id,competence" }).select("id, competence, monthly_target, status, sent_at, sent_by").single();
      if (upsert.error || !upsert.data) throw upsert.error ?? new Error("Não foi possível salvar o relatório.");
      const next = upsert.data as ReportRow;
      if (status === "sent") {
        const remove = await supabase.from("income_division_report_items").delete().eq("organization_id", organizationId).eq("report_id", next.id);
        if (remove.error) throw remove.error;
        const rows = calculation.members.map((member) => ({ report_id: next.id, organization_id: organizationId, member_user_id: member.userId, member_contact_id: member.contactId, member_ref: memberReference(member), member_name: member.name, personal_expenses: member.personalExpenses, holding_expenses: member.holdingExpenses, total_expenses: member.totalExpenses, monthly_target: member.targetAmount, net_amount: member.netAmount }));
        if (rows.length) {
          const insert = await supabase.from("income_division_report_items").insert(rows);
          if (insert.error) throw insert.error;
        }
        setMessage(`Relatório de ${monthLabel(selectedMonth)} enviado para os membros.`);
      } else {
        setMessage(`Rascunho de ${monthLabel(selectedMonth)} salvo.`);
      }
      setReport(next);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Não foi possível salvar o relatório.");
    } finally {
      setSaving(false);
    }
  }

  async function addExpense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!organizationId || role === "viewer") return;
    const value = parseMoney(expenseForm.value);
    if (!expenseForm.description.trim() || value <= 0) { setError("Informe descrição e valor da despesa."); return; }
    const selectedMember = members.find((member) => memberReference(member) === expenseForm.responsibleRef);
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;
    setSaving(true); setError(""); setMessage("");
    const expenseDate = todayForMonth(selectedMonth);
    const result = await supabase.from("expenses").insert({ organization_id: organizationId, description: expenseForm.description.trim(), category: expenseForm.category.trim() || "Operacional", value, expense_date: expenseDate, competence: expenseDate, recurring: expenseForm.kind !== "one_time", expense_kind: expenseForm.kind, responsible: selectedMember?.name ?? "Holding", responsible_user_id: selectedMember?.userId ?? null, responsible_contact_id: selectedMember?.contactId ?? null }).select("id").single();
    if (result.error || !result.data) {
      setError(result.error?.message ?? "Não foi possível cadastrar a despesa.");
    } else {
      if (selectedMember) {
        const responsibility = await supabase.from("expense_responsibilities").insert({ organization_id: organizationId, expense_id: result.data.id, user_id: selectedMember.userId, contact_id: selectedMember.contactId, share_percentage: 100 });
        if (responsibility.error) { setError(responsibility.error.message); setSaving(false); return; }
      }
      setExpenseForm({ description: "", value: "", kind: "recurring", category: "Operacional", responsibleRef: "holding" });
      setCreatingExpense(false);
      setMessage("Despesa criada na base compartilhada com a aba Despesas.");
      await refresh({ silent: true });
    }
    setSaving(false);
  }

  const reportStatus = reportLoading ? "Carregando status…" : report?.status === "sent" ? `Enviado${report.sent_at ? ` em ${new Date(report.sent_at).toLocaleDateString("pt-BR")}` : ""}` : "Rascunho ainda não enviado";
  return <div className="income-division-panel">
    <div className="page-heading division-heading income-division-heading"><div><div className="eyebrow"><CircleDollarSign size={13} /> Divisão de rendimentos</div><h1>Rendimentos mensais</h1><p className="subtitle">Defina a mesma meta para todos e veja quanto cada membro receberá além das suas responsabilidades.</p></div><div className="page-heading-actions"><button className="button button-ghost" onClick={() => setCreatingExpense((current) => !current)}><Plus size={14} /> Nova despesa</button><button className="button button-ghost" onClick={() => void persistReport("draft")} disabled={saving}><Save size={14} /> Salvar rascunho</button><button className="button button-primary" onClick={() => void persistReport("sent")} disabled={saving || !members.length}>{saving ? "Salvando…" : <><FileCheck2 size={14} /> Enviar relatório do mês</>}</button></div></div>
    <div className="income-division-toolbar panel"><div className="month-navigator"><button className="icon-btn" onClick={() => setSelectedMonth((month) => shiftMonth(month, -1))} aria-label="Mês anterior"><ChevronLeft size={16} /></button><div><small>Mês de vigência</small><strong>{monthLabel(selectedMonth)}</strong></div><button className="icon-btn" onClick={() => setSelectedMonth((month) => shiftMonth(month, 1))} aria-label="Próximo mês"><ChevronRight size={16} /></button></div><label className="income-target-field"><span>Valor mensal igual para todos</span><div><b>R$</b><input inputMode="decimal" value={targetValue} onChange={(event) => setTargetValue(event.target.value)} placeholder="0,00" /></div></label><div className={`income-report-status ${report?.status === "sent" ? "sent" : "draft"}`}><span>{report?.status === "sent" ? <Check size={13} /> : <CalendarDays size={13} />}</span><div><strong>{reportStatus}</strong><small>{report?.status === "sent" ? "Membros já podem consultar este mês." : "Você pode revisar e enviar meses anteriores."}</small></div></div></div>
    {error && <div className="division-alert error">{error}</div>}{message && <div className="division-alert"><Check size={14} /> {message}</div>}
    {creatingExpense && <form className="panel income-expense-form" onSubmit={(event) => void addExpense(event)}><div className="panel-heading"><div><h2>Nova despesa sincronizada</h2><p>O lançamento será salvo na mesma base usada em Despesas e entrará no mês selecionado.</p></div><button type="button" className="icon-btn" onClick={() => setCreatingExpense(false)} aria-label="Fechar"><X size={15} /></button></div><div className="income-expense-fields"><label>Descrição<input value={expenseForm.description} onChange={(event) => setExpenseForm((current) => ({ ...current, description: event.target.value }))} placeholder="Ex.: condomínio, imposto ou manutenção" /></label><label>Valor<input inputMode="decimal" value={expenseForm.value} onChange={(event) => setExpenseForm((current) => ({ ...current, value: event.target.value }))} placeholder="0,00" /></label><label>Tipo<select value={expenseForm.kind} onChange={(event) => setExpenseForm((current) => ({ ...current, kind: event.target.value as ExpenseKind }))}>{(Object.keys(kindLabels) as ExpenseKind[]).map((kind) => <option value={kind} key={kind}>{kindLabels[kind]}</option>)}</select></label><label>Responsável<select value={expenseForm.responsibleRef} onChange={(event) => setExpenseForm((current) => ({ ...current, responsibleRef: event.target.value }))}><option value="holding">Holding · rateio por participação</option>{members.map((member) => <option key={memberReference(member)} value={memberReference(member)}>{member.name}</option>)}</select></label></div><div className="onboarding-actions"><button type="button" className="button button-ghost" onClick={() => setCreatingExpense(false)}>Cancelar</button><button type="submit" className="button button-primary" disabled={saving}><Plus size={14} /> Cadastrar despesa</button></div></form>}
    <div className="metrics income-division-metrics"><div className="metric-card"><div className="metric-top"><span>Meta mensal por membro</span><UsersRound size={15} /></div><div className="metric-value">{compactBrl(targetAmount)}</div><div className="metric-foot">Valor igual definido pelo gestor</div></div><div className="metric-card"><div className="metric-top"><span>Despesas do mês</span><CircleDollarSign size={15} /></div><div className="metric-value">{compactBrl(calculation.expenseTotal)}</div><div className="metric-foot">{calculation.applicableExpenses} lançamentos aplicáveis</div></div><div className="metric-card"><div className="metric-top"><span>Despesas da holding</span><CircleDollarSign size={15} /></div><div className="metric-value">{compactBrl(calculation.holdingTotal)}</div><div className="metric-foot">Rateadas pela participação</div></div><div className="metric-card"><div className="metric-top"><span>Total a receber</span><CircleDollarSign size={15} /></div><div className="metric-value">{compactBrl(calculation.members.reduce((sum, member) => sum + member.netAmount, 0))}</div><div className="metric-foot">Saldo extra após responsabilidades</div></div></div>
    <section className="panel income-members-panel"><div className="panel-heading"><div><h2>Resumo por membro</h2><p>O valor a receber é a meta mensal menos as despesas pessoais e a parcela de despesas da holding.</p></div><span className="income-sync-note">Sempre sincronizado com Despesas</span></div><div className="income-member-grid">{calculation.members.map((member, index) => <article className="income-member-card" key={member.ref}><div className="income-member-header"><span className={`income-member-avatar income-color-${index % 4}`}><UsersRound size={15} /></span><div><strong>{member.name}</strong><small>{member.holdingExpenses > 0 ? "Com responsabilidade na holding" : "Responsabilidades individuais"}</small></div><span className="income-member-number">#{index + 1}</span></div><div className="income-member-values"><span><small>Gastos pessoais</small><strong>{brl(member.personalExpenses)}</strong></span><span><small>Parcela da holding</small><strong>{brl(member.holdingExpenses)}</strong></span><span><small>Total de gastos</small><strong>{brl(member.totalExpenses)}</strong></span><span className={member.netAmount >= 0 ? "income-receivable" : "income-negative"}><small>{member.netAmount >= 0 ? "Extra a receber" : "Saldo negativo"}</small><strong>{brl(member.netAmount)}</strong></span></div></article>)}</div>{!members.length && <div className="empty-state"><UsersRound size={24} /><p>Nenhum membro disponível para montar o relatório.</p></div>}</section>
    <div className="income-division-footnote"><CalendarDays size={14} /><span>Competência selecionada: <strong>{monthLabel(selectedMonth)}</strong>. Relatórios enviados podem ser reabertos e reenviados pelo gestor para corrigir meses anteriores.</span></div>
  </div>;
}
