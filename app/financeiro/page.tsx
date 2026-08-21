"use client";

import { ArrowDownRight, ArrowUpRight, CircleDollarSign, Plus, Receipt, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { usePortfolio } from "@/components/portfolio-provider";
import { brl } from "@/lib/format";
import { createSupabaseBrowserClient } from "@/lib/supabase";

type ExpenseKind = "fixed" | "recurring" | "one_time";
type Expense = { id: string; description: string; category: string; value: number; expense_date: string; competence?: string; expense_kind: ExpenseKind; responsible?: string; responsible_user_id?: string; building_id?: string };
type Member = { user_id: string; full_name: string; email: string; ownership_percentage: number };

const kindLabels: Record<ExpenseKind, string> = { fixed: "Fixa mensal", recurring: "Recorrente", one_time: "Avulsa" };

function today() { return new Date().toISOString().slice(0, 10); }

export default function FinanceiroPage() {
  const { buildings, loading, organizationId, role, refresh } = usePortfolio();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [form, setForm] = useState({ description: "", value: "", kind: "recurring" as ExpenseKind, category: "Operacional", responsibleUserId: "", buildingId: "", date: today() });

  useEffect(() => {
    let active = true;
    async function load() {
      if (!organizationId) { setExpenses([]); setMembers([]); setDataLoading(false); return; }
      const supabase = createSupabaseBrowserClient();
      if (!supabase) return;
      setDataLoading(true);
      const [expensesResult, membersResult] = await Promise.all([
        supabase.from("expenses").select("id, description, category, value, expense_date, competence, expense_kind, responsible, responsible_user_id, building_id").eq("organization_id", organizationId).order("expense_date", { ascending: false }),
        supabase.rpc("list_organization_members", { target_org: organizationId }),
      ]);
      if (!active) return;
      if (expensesResult.error) setMessage("Não foi possível carregar as despesas.");
      else setExpenses((expensesResult.data ?? []) as Expense[]);
      if (!membersResult.error) setMembers((membersResult.data ?? []) as Member[]);
      setDataLoading(false);
    }
    void load();
    return () => { active = false; };
  }, [organizationId, reloadKey]);

  const units = useMemo(() => buildings.flatMap((building) => (building.unitsData ?? []).map((unit) => ({ ...unit, building }))), [buildings]);
  const monthlyRent = useMemo(() => units.reduce((total, unit) => total + (unit.rent > 0 ? unit.rent : 0), 0), [units]);
  const monthlyExpenses = useMemo(() => expenses.filter((expense) => expense.expense_kind !== "one_time").reduce((total, expense) => total + Number(expense.value || 0), 0), [expenses]);
  const oneTimeExpenses = useMemo(() => expenses.filter((expense) => expense.expense_kind === "one_time").reduce((total, expense) => total + Number(expense.value || 0), 0), [expenses]);
  const monthlyProfit = monthlyRent - monthlyExpenses;
  const ownershipTotal = members.reduce((total, member) => total + Number(member.ownership_percentage || 0), 0);
  const expensesByPerson = useMemo(() => expenses.filter((expense) => expense.expense_kind !== "one_time" && expense.responsible_user_id).reduce<Record<string, number>>((totals, expense) => { const id = String(expense.responsible_user_id); totals[id] = (totals[id] ?? 0) + Number(expense.value || 0); return totals; }, {}), [expenses]);
  const holdingExpenses = useMemo(() => expenses.filter((expense) => expense.expense_kind !== "one_time" && !expense.responsible_user_id).reduce((total, expense) => total + Number(expense.value || 0), 0), [expenses]);

  function updateForm(field: keyof typeof form, value: string) { setForm((current) => ({ ...current, [field]: value })); }

  async function addExpense(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!organizationId || role === "viewer") { setMessage("Seu perfil não pode cadastrar despesas."); return; }
    const value = Number(form.value.replace(",", "."));
    if (!form.description.trim() || !Number.isFinite(value) || value <= 0) { setMessage("Informe descrição e valor da despesa."); return; }
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;
    const member = members.find((item) => item.user_id === form.responsibleUserId);
    setSaving(true);
    setMessage("");
    const result = await supabase.from("expenses").insert({ organization_id: organizationId, description: form.description.trim(), category: form.category.trim() || "Operacional", value, expense_date: form.date || today(), competence: form.date || today(), recurring: form.kind !== "one_time", expense_kind: form.kind, responsible: member?.full_name ?? "Holding", responsible_user_id: member?.user_id || null, building_id: form.buildingId || null });
    if (result.error) setMessage(result.error.message);
    else { setMessage("Despesa cadastrada e sincronizada com o resultado mensal."); setForm({ description: "", value: "", kind: "recurring", category: "Operacional", responsibleUserId: "", buildingId: "", date: today() }); await refresh(); setReloadKey((key) => key + 1); }
    setSaving(false);
  }

  async function removeExpense(expense: Expense) {
    if (role === "viewer" || !organizationId) return;
    if (!window.confirm(`Excluir a despesa “${expense.description}”?`)) return;
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;
    const result = await supabase.from("expenses").delete().eq("id", expense.id).eq("organization_id", organizationId);
    setMessage(result.error ? result.error.message : "Despesa removida.");
    if (!result.error) { await refresh(); setReloadKey((key) => key + 1); }
  }

  if (loading || dataLoading) return <div className="content"><div className="empty-state"><p>Carregando financeiro...</p></div></div>;
  if (!organizationId) return <div className="content"><div className="empty-state"><h3>Nenhuma organização selecionada</h3><p>Entre em uma holding para lançar despesas.</p></div></div>;

  return <div className="content">
    <div className="page-heading"><div><div className="eyebrow"><CircleDollarSign size={13} /> Fluxo financeiro</div><h1>Financeiro</h1><p className="subtitle">Receitas dos aluguéis, despesas da holding e saldo mensal sincronizados.</p></div></div>
    {message && <p className={message.startsWith("Não") || message.startsWith("Seu") || message.startsWith("Informe") ? "form-error" : "form-success"}><Receipt size={13} /> {message}</p>}
    <div className="metrics"><div className="metric-card"><div className="metric-top"><span>Aluguéis mensais</span><span className="metric-icon"><ArrowUpRight size={15} /></span></div><div className="metric-value">{brl(monthlyRent)}</div><div className="metric-foot positive">Receita recorrente</div></div><div className="metric-card"><div className="metric-top"><span>Despesas mensais</span><span className="metric-icon"><ArrowDownRight size={15} /></span></div><div className="metric-value">{brl(monthlyExpenses)}</div><div className="metric-foot">{expenses.filter((expense) => expense.expense_kind !== "one_time").length} lançamentos recorrentes</div></div><div className="metric-card"><div className="metric-top"><span>Lucro mensal</span><span className="metric-icon">R$</span></div><div className={`metric-value ${monthlyProfit < 0 ? "negative" : ""}`}>{brl(monthlyProfit)}</div><div className="metric-foot">Receita − despesas</div></div><div className="metric-card"><div className="metric-top"><span>Despesas avulsas</span><span className="metric-icon"><Receipt size={15} /></span></div><div className="metric-value">{brl(oneTimeExpenses)}</div><div className="metric-foot">Não entram no mensal</div></div></div>
    <div className="panel section-gap"><div className="panel-heading"><div><h2>Receitas dos imóveis</h2><p>{units.length} unidades com dados · origem: aluguéis cadastrados nos imóveis</p></div></div>{units.filter((unit) => unit.rent > 0).length ? <div className="table-wrap"><table><thead><tr><th>Imóvel / unidade</th><th>Localidade</th><th>Status</th><th>Valor mensal</th></tr></thead><tbody>{units.filter((unit) => unit.rent > 0).map((unit) => <tr key={unit.id}><td><strong>{unit.code}</strong><small>{unit.building.name}</small></td><td>{unit.building.city} · {unit.building.state || "—"}</td><td><span className="status status-alugado">Alugado</span></td><td className="positive"><strong>{brl(unit.rent)}</strong></td></tr>)}</tbody></table></div> : <div className="empty-state"><Receipt size={28} /><h3>Nenhuma receita de aluguel</h3><p>Os valores informados nos imóveis aparecerão aqui.</p></div>}</div>
    <div className="dashboard-grid"><div className="panel"><div className="panel-heading"><div><h2>Nova despesa</h2><p>Cadastre um gasto e sincronize o saldo.</p></div><Plus size={17} color="#80e2b0" /></div><form className="form-grid" onSubmit={addExpense}><label className="form-grid-wide">Descrição<input value={form.description} onChange={(event) => updateForm("description", event.target.value)} placeholder="Ex.: condomínio, IPTU, manutenção" required /></label><label>Valor mensal / total<input type="number" min="0" step="0.01" value={form.value} onChange={(event) => updateForm("value", event.target.value)} placeholder="0,00" required /></label><label>Tipo<select value={form.kind} onChange={(event) => updateForm("kind", event.target.value)}><option value="fixed">Fixa mensal</option><option value="recurring">Recorrente</option><option value="one_time">Avulsa</option></select></label><label>Categoria<input value={form.category} onChange={(event) => updateForm("category", event.target.value)} placeholder="Operacional" /></label><label>Data / competência<input type="date" value={form.date} onChange={(event) => updateForm("date", event.target.value)} required /></label><label>Responsável<select value={form.responsibleUserId} onChange={(event) => updateForm("responsibleUserId", event.target.value)}><option value="">Holding (sem pessoa)</option>{members.map((member) => <option key={member.user_id} value={member.user_id}>{member.full_name} · {member.ownership_percentage || 0}%</option>)}</select></label><label>Imóvel relacionado<select value={form.buildingId} onChange={(event) => updateForm("buildingId", event.target.value)}><option value="">Todos / holding</option>{buildings.filter((building) => building.dbId).map((building) => <option key={building.dbId} value={building.dbId}>{building.name}</option>)}</select></label><div className="form-grid-wide onboarding-actions"><span className="muted">Despesas fixas e recorrentes reduzem o lucro mensal automaticamente.</span><button type="submit" className="button button-primary" disabled={saving || role === "viewer"}>{saving ? "Salvando…" : "Cadastrar despesa"}</button></div></form></div><div className="panel"><div className="panel-heading"><div><h2>Lucro mensal por pessoa</h2><p>Receita distribuída pela participação e descontada das despesas atribuídas.</p></div></div>{members.length ? <div className="table-wrap"><table><thead><tr><th>Pessoa</th><th>Participação</th><th>Receita</th><th>Despesas atribuídas</th><th>Lucro líquido</th></tr></thead><tbody>{members.map((member) => { const share = ownershipTotal > 0 ? monthlyRent * Number(member.ownership_percentage || 0) / ownershipTotal : monthlyRent / members.length; const assigned = expensesByPerson[member.user_id] ?? 0; return <tr key={member.user_id}><td><strong>{member.full_name}</strong><small>{member.email}</small></td><td>{Number(member.ownership_percentage || 0).toFixed(2).replace(".", ",")}%</td><td>{brl(share)}</td><td>{brl(assigned)}</td><td className={share - assigned < 0 ? "negative" : "positive"}><strong>{brl(share - assigned)}</strong></td></tr>; })}<tr><td><strong>Holding</strong><small>Despesas sem responsável individual</small></td><td>—</td><td>—</td><td>{brl(holdingExpenses)}</td><td className={monthlyProfit - holdingExpenses < 0 ? "negative" : "positive"}><strong>{brl(monthlyProfit - holdingExpenses)}</strong></td></tr></tbody></table></div> : <div className="empty-state"><p>Nenhum membro disponível para distribuir o lucro.</p></div>}</div></div>
    <div className="panel section-gap"><div className="panel-heading"><div><h2>Despesas cadastradas</h2><p>{expenses.length} lançamentos sincronizados com a holding.</p></div></div>{expenses.length ? <div className="table-wrap"><table><thead><tr><th>Descrição</th><th>Tipo</th><th>Responsável</th><th>Imóvel</th><th>Competência</th><th>Valor</th><th /></tr></thead><tbody>{expenses.map((expense) => <tr key={expense.id}><td><strong>{expense.description}</strong><small>{expense.category}</small></td><td><span className="tag">{kindLabels[expense.expense_kind]}</span></td><td>{expense.responsible || "Holding"}</td><td>{buildings.find((building) => building.dbId === expense.building_id)?.name ?? "Holding"}</td><td>{expense.expense_date ? new Date(`${expense.expense_date}T12:00:00`).toLocaleDateString("pt-BR") : "—"}</td><td><strong>{brl(Number(expense.value || 0))}</strong></td><td><button className="icon-btn" onClick={() => void removeExpense(expense)} disabled={role === "viewer"} aria-label={`Excluir despesa ${expense.description}`}><Trash2 size={14} /></button></td></tr>)}</tbody></table></div> : <div className="empty-state"><Receipt size={28} /><h3>Nenhuma despesa cadastrada</h3><p>Cadastre condomínio, impostos, manutenção ou outros custos da holding.</p></div>}</div>
  </div>;
}
