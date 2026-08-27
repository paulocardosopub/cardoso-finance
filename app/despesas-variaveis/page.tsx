"use client";

import { CalendarDays, Plus, Receipt, WalletCards } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePortfolio } from "@/components/portfolio-provider";
import { brl } from "@/lib/format";
import { currentMonthKey, monthLabel, shiftMonth } from "@/lib/month";
import { createSupabaseBrowserClient } from "@/lib/supabase";

type VariableExpense = {
  id: string;
  description: string;
  category: string;
  value: number;
  expense_date: string;
  building_id?: string | null;
  created_role?: string | null;
};

const today = () => new Date().toISOString().slice(0, 10);

export default function DespesasVariaveisPage() {
  const { organizationId, role, actualRole, buildings, loading } = usePortfolio();
  const [selectedMonth, setSelectedMonth] = useState(currentMonthKey);
  const [expenses, setExpenses] = useState<VariableExpense[]>([]);
  const [form, setForm] = useState({ description: "", value: "", category: "Administração de imóveis", buildingId: "", date: today() });
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState("");
  const [loadingExpenses, setLoadingExpenses] = useState(false);

  const loadExpenses = useCallback(async () => {
    if (!organizationId) return;
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;
    setLoadingExpenses(true);
    const user = (await supabase.auth.getUser()).data.user;
    if (!user) { setLoadingExpenses(false); return; }
    const result = await supabase.from("expenses")
      .select("id, description, category, value, expense_date, building_id, created_role")
      .eq("organization_id", organizationId)
      .eq("created_by", user.id)
      .eq("created_role", "employee")
      .eq("expense_kind", "one_time")
      .order("expense_date", { ascending: false });
    if (result.error) setMessage("Não foi possível carregar suas despesas variáveis.");
    else setExpenses((result.data ?? []) as VariableExpense[]);
    setLoadingExpenses(false);
  }, [organizationId]);

  useEffect(() => { void loadExpenses(); }, [loadExpenses]);

  const periodExpenses = useMemo(() => expenses.filter((expense) => expense.expense_date?.startsWith(selectedMonth)), [expenses, selectedMonth]);
  const periodTotal = periodExpenses.reduce((sum, expense) => sum + Number(expense.value || 0), 0);

  async function createExpense(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!organizationId || role !== "employee" || actualRole !== "employee") { setMessage("Apenas a funcionária pode lançar despesas variáveis."); return; }
    const value = Number(form.value.replace(",", "."));
    if (!form.description.trim() || !Number.isFinite(value) || value <= 0 || !form.date) { setMessage("Informe descrição, valor e data da despesa."); return; }
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;
    setSaving(true); setMessage("");
    const result = await supabase.rpc("create_employee_variable_expense", {
      target_org: organizationId,
      expense_description: form.description.trim(),
      expense_value: value,
      expense_date_value: form.date,
      expense_category: form.category.trim() || "Administração de imóveis",
      expense_building: form.buildingId || null,
    });
    if (result.error) setMessage(result.error.message === "not_authorized" ? "Seu perfil não pode lançar esta despesa." : "Não foi possível criar a despesa variável.");
    else {
      setMessage("Despesa variável criada e lançada como despesa de todos.");
      setForm({ description: "", value: "", category: "Administração de imóveis", buildingId: "", date: today() });
      setCreating(false);
      await loadExpenses();
    }
    setSaving(false);
  }

  return <section className="content">
    <div className="page-heading"><div><div className="eyebrow"><WalletCards size={14} /> OPERAÇÃO DA FUNCIONÁRIA</div><h1>Despesas variáveis</h1><p>Registre custos da administração dos imóveis. Eles entram como despesas de todos.</p></div></div>
    <div className="month-toolbar"><div className="month-navigator"><button className="icon-btn" onClick={() => setSelectedMonth((month) => shiftMonth(month, -1))} aria-label="Mês anterior">‹</button><CalendarDays size={16} /><strong>{monthLabel(selectedMonth)}</strong><button className="icon-btn" onClick={() => setSelectedMonth((month) => shiftMonth(month, 1))} aria-label="Próximo mês">›</button></div></div>
    {message && !creating && <div className={message.startsWith("Não") || message.startsWith("Informe") ? "form-error" : "form-success"}>{message}</div>}
    <div className="metrics"><div className="metric-card"><div className="metric-top"><span>Despesas do mês</span><Receipt size={16} /></div><strong className="metric-value">{periodExpenses.length}</strong><small className="metric-foot">Lançamentos feitos por você</small></div><div className="metric-card"><div className="metric-top"><span>Total do mês</span><WalletCards size={16} /></div><strong className="metric-value">{brl(periodTotal)}</strong><small className="metric-foot">Despesa coletiva da holding</small></div></div>
    <div className="panel section-gap"><div className="panel-heading"><div><h2>Nova despesa variável</h2><p>Informe o gasto realizado na administração de um imóvel.</p></div><Plus size={17} color="#80e2b0" /></div><p className="muted">Abra o formulário para registrar lâmpadas, canos e materiais de obra, mantendo a lista visível ao fundo.</p><button type="button" className="button button-primary" onClick={() => { setCreating(true); setMessage(""); }}><Plus size={15} /> Nova despesa variável</button></div>
    {creating && <div className="modal-backdrop"><form className="edit-modal" onSubmit={createExpense}><div className="panel-heading"><div><h2>Nova despesa variável</h2><p>Informe o gasto realizado na administração de um imóvel.</p></div><button type="button" className="icon-btn" onClick={() => { setCreating(false); setMessage(""); }} aria-label="Fechar nova despesa"><span aria-hidden="true">×</span></button></div>{message && <p className={message.startsWith("Não") || message.startsWith("Informe") ? "form-error" : "form-success"}>{message}</p>}<div className="form-grid"><label className="form-grid-wide">Descrição<input autoFocus value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} placeholder="Ex.: lâmpadas, canos e materiais de obra" required /></label><label>Valor<input inputMode="decimal" value={form.value} onChange={(event) => setForm((current) => ({ ...current, value: event.target.value }))} placeholder="R$ 0,00" required /></label><label>Data do gasto<input type="date" value={form.date} onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))} required /></label><label>Categoria<input value={form.category} onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))} placeholder="Administração de imóveis" /></label><label>Imóvel relacionado (opcional)<select value={form.buildingId} onChange={(event) => setForm((current) => ({ ...current, buildingId: event.target.value }))}><option value="">Todos / sem imóvel específico</option>{buildings.filter((building) => building.dbId).map((building) => <option key={building.dbId} value={building.dbId}>{building.name} · {building.city || building.state}</option>)}</select></label></div><div className="onboarding-actions"><button className="button button-ghost" type="button" onClick={() => setCreating(false)}>Cancelar</button><button className="button button-primary" type="submit" disabled={saving || loading}><Plus size={15} />{saving ? "Salvando…" : "Criar despesa variável"}</button></div></form></div>}
    <div className="panel section-gap"><div className="panel-heading"><div><h2>Lançamentos de {monthLabel(selectedMonth)}</h2><p>Identificados como criados pela funcionária na aba Despesas.</p></div></div>{loadingExpenses ? <div className="empty-state"><p>Carregando lançamentos…</p></div> : periodExpenses.length ? <div className="table-wrap"><table><thead><tr><th>Descrição</th><th>Imóvel</th><th>Data</th><th>Origem</th><th>Valor</th></tr></thead><tbody>{periodExpenses.map((expense) => <tr key={expense.id}><td><strong>{expense.description}</strong><small>{expense.category}</small></td><td>{buildings.find((building) => building.dbId === expense.building_id)?.name ?? "Todos / holding"}</td><td>{new Date(`${expense.expense_date}T12:00:00`).toLocaleDateString("pt-BR")}</td><td><span className="tag">Funcionária</span></td><td><strong>{brl(Number(expense.value || 0))}</strong></td></tr>)}</tbody></table></div> : <div className="empty-state"><Receipt size={28} /><h3>Nenhuma despesa neste mês</h3><p>Os lançamentos variáveis feitos por você aparecerão aqui.</p></div>}</div>
  </section>;
}
