"use client";

import { ArrowDownRight, CircleDollarSign, Download, FileSpreadsheet, Plus, Receipt, Trash2, Upload } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { usePortfolio } from "@/components/portfolio-provider";
import { brl } from "@/lib/format";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import type { ExpenseKind, ExpenseRecord } from "@/types/domain";

type Member = { user_id: string; full_name: string; email: string; ownership_percentage: number };
const kindLabels: Record<ExpenseKind, string> = { fixed: "Fixa mensal", recurring: "Recorrente", one_time: "Avulsa" };
const today = () => new Date().toISOString().slice(0, 10);
const normalizeHeader = (value: unknown) => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
const normalizeSearch = (value: unknown) => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

function parseImportedValue(value: unknown) {
  if (typeof value === "number") return value;
  const text = String(value ?? "").trim().replace(/[R$\s]/g, "");
  if (!text) return NaN;
  if (text.includes(",")) return Number(text.replace(/\./g, "").replace(",", ".").replace(/[^0-9.-]/g, ""));
  if (/^-?\d{1,3}(\.\d{3})+$/.test(text)) return Number(text.replace(/\./g, ""));
  return Number(text.replace(/[^0-9.-]/g, ""));
}

function parseImportedDate(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value === "number" && Number.isFinite(value)) {
    const excelDate = new Date(Math.round((value - 25569) * 86400 * 1000));
    if (!Number.isNaN(excelDate.getTime())) return excelDate.toISOString().slice(0, 10);
  }
  const text = String(value ?? "").trim();
  const brazilian = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
  if (brazilian) {
    const year = brazilian[3].length === 2 ? `20${brazilian[3]}` : brazilian[3];
    return `${year}-${brazilian[2].padStart(2, "0")}-${brazilian[1].padStart(2, "0")}`;
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
}

export default function DespesasPage() {
  const { buildings, loading, organizationId, role, expenses, monthlyExpenses, monthlyProfit, refresh } = usePortfolio();
  const [members, setMembers] = useState<Member[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("date_desc");
  const [kindFilter, setKindFilter] = useState("all");
  const [responsibleFilter, setResponsibleFilter] = useState("all");
  const [importing, setImporting] = useState(false);
  const [form, setForm] = useState({ description: "", value: "", kind: "recurring" as ExpenseKind, category: "Operacional", responsibleUserId: "", buildingId: "", date: today() });

  useEffect(() => {
    if (!organizationId) return;
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;
    supabase.rpc("list_organization_members", { target_org: organizationId }).then(({ data }) => setMembers((data ?? []) as Member[]));
  }, [organizationId]);

  const ownershipTotal = members.reduce((total, member) => total + Number(member.ownership_percentage || 0), 0);
  const expensesByPerson = useMemo(() => expenses.filter((expense) => expense.expense_kind !== "one_time" && expense.responsible_user_id).reduce<Record<string, number>>((totals, expense) => { const id = String(expense.responsible_user_id); totals[id] = (totals[id] ?? 0) + Number(expense.value || 0); return totals; }, {}), [expenses]);
  const holdingExpenses = expenses.filter((expense) => expense.expense_kind !== "one_time" && !expense.responsible_user_id).reduce((total, expense) => total + Number(expense.value || 0), 0);
  const visibleExpenses = useMemo(() => expenses.filter((expense) => {
    const text = `${expense.description} ${expense.category} ${expense.responsible ?? "Holding"}`.toLowerCase();
    return text.includes(query.toLowerCase()) && (kindFilter === "all" || expense.expense_kind === kindFilter) && (responsibleFilter === "all" || (expense.responsible_user_id ?? "holding") === responsibleFilter);
  }).sort((left, right) => sort === "date_asc" ? left.expense_date.localeCompare(right.expense_date) : sort === "value_desc" ? right.value - left.value : sort === "value_asc" ? left.value - right.value : sort === "responsible_asc" ? (left.responsible ?? "Holding").localeCompare(right.responsible ?? "Holding", "pt-BR") : sort === "kind_asc" ? kindLabels[left.expense_kind].localeCompare(kindLabels[right.expense_kind], "pt-BR") : right.expense_date.localeCompare(left.expense_date)), [expenses, kindFilter, query, responsibleFilter, sort]);

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
    const result = await supabase.from("expenses").insert({ organization_id: organizationId, description: form.description.trim(), category: form.category.trim() || "Operacional", value, expense_date: form.date || today(), competence: form.date || today(), recurring: form.kind !== "one_time", expense_kind: form.kind, responsible: member?.full_name ?? "Holding", responsible_user_id: member?.user_id || null, building_id: form.buildingId || null });
    if (result.error) setMessage(result.error.message);
    else { setMessage("Despesa cadastrada e saldo atualizado."); setForm({ description: "", value: "", kind: "recurring", category: "Operacional", responsibleUserId: "", buildingId: "", date: today() }); await refresh(); }
    setSaving(false);
  }

  async function removeExpense(expense: ExpenseRecord) {
    if (role === "viewer" || !organizationId || !window.confirm(`Excluir a despesa “${expense.description}”?`)) return;
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;
    const result = await supabase.from("expenses").delete().eq("id", expense.id).eq("organization_id", organizationId);
    setMessage(result.error ? result.error.message : "Despesa removida e saldo atualizado.");
    if (!result.error) await refresh();
  }

  function downloadExpenseTemplate() {
    const worksheet = XLSX.utils.aoa_to_sheet([["Despesa", "Data", "Valor", "Responsável"]]);
    worksheet["!cols"] = [{ wch: 34 }, { wch: 15 }, { wch: 16 }, { wch: 28 }];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Despesas");
    XLSX.writeFile(workbook, "modelo-despesas-cardoso-finance.xlsx");
  }

  async function importSpreadsheet(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.currentTarget.value = "";
    if (!file || !organizationId || role === "viewer") return;
    setImporting(true);
    setMessage("");
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = firstSheet ? XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, { defval: "" }) : [];
      const headers = Object.keys(rows[0] ?? {});
      const findColumn = (aliases: string[]) => headers.find((header) => aliases.includes(normalizeHeader(header)));
      const expenseColumn = findColumn(["despesa", "descricao", "description", "gasto"]);
      const dateColumn = findColumn(["data", "date", "competencia", "competence"]);
      const valueColumn = findColumn(["valor", "value", "amount", "preco"]);
      const responsibleColumn = findColumn(["responsavel", "responsible", "responsavelnome", "responsavelpor"]);
      if (!expenseColumn || !dateColumn || !valueColumn || !responsibleColumn) {
        setMessage("Erro: a planilha precisa das colunas Despesa, Data, Valor e Responsável.");
        return;
      }
      const imported = rows.map((row) => {
        const description = String(row[expenseColumn] ?? "").trim();
        const value = parseImportedValue(row[valueColumn]);
        const expenseDate = parseImportedDate(row[dateColumn]);
        const responsibleText = String(row[responsibleColumn] ?? "").trim();
        const responsibleSearch = normalizeSearch(responsibleText);
        const member = responsibleSearch ? members.find((item) => [item.full_name, item.email].some((candidate) => normalizeSearch(candidate) === responsibleSearch || responsibleSearch.includes(normalizeSearch(candidate)))) : undefined;
        return description && Number.isFinite(value) && value > 0 && expenseDate ? { organization_id: organizationId, description, category: "Importação Excel", value, expense_date: expenseDate, competence: expenseDate, recurring: true, expense_kind: "recurring" as const, responsible: member?.full_name ?? (responsibleText || "Holding"), responsible_user_id: member?.user_id ?? null, building_id: null } : null;
      }).filter((item): item is NonNullable<typeof item> => Boolean(item));
      if (!imported.length) {
        setMessage("Erro: nenhuma linha válida foi encontrada. Confira descrição, data e valor.");
        return;
      }
      const supabase = createSupabaseBrowserClient();
      if (!supabase) return;
      const result = await supabase.from("expenses").insert(imported);
      if (result.error) setMessage(`Erro ao importar: ${result.error.message}`);
      else { setMessage(`${imported.length} despesa(s) importada(s) e saldo atualizado.`); await refresh(); }
    } catch (error) {
      setMessage(`Erro ao ler a planilha: ${error instanceof Error ? error.message : "arquivo inválido"}.`);
    } finally {
      setImporting(false);
    }
  }

  if (loading) return <div className="content"><div className="empty-state"><p>Carregando despesas...</p></div></div>;
  if (!organizationId) return <div className="content"><div className="empty-state"><h3>Nenhuma organização selecionada</h3><p>Entre em uma holding para lançar despesas.</p></div></div>;
  return <div className="content"><div className="page-heading"><div><div className="eyebrow"><CircleDollarSign size={13} /> Controle de despesas</div><h1>Despesas</h1><p className="subtitle">Despesas fixas, recorrentes e avulsas sincronizadas com o saldo financeiro.</p></div></div>
    {message && <p className={message.startsWith("Erro") || message.startsWith("Seu") || message.startsWith("Informe") ? "form-error" : "form-success"}><Receipt size={13} /> {message}</p>}
    <div className="metrics"><div className="metric-card"><div className="metric-top"><span>Despesas mensais</span><span className="metric-icon"><ArrowDownRight size={15} /></span></div><div className="metric-value">{brl(monthlyExpenses)}</div><div className="metric-foot">Fixas + recorrentes</div></div><div className="metric-card"><div className="metric-top"><span>Saldo mensal</span><span className="metric-icon">R$</span></div><div className={`metric-value ${monthlyProfit < 0 ? "negative" : ""}`}>{brl(monthlyProfit)}</div><div className="metric-foot">Receitas − despesas</div></div><div className="metric-card"><div className="metric-top"><span>Lançamentos</span><span className="metric-icon"><Receipt size={15} /></span></div><div className="metric-value">{expenses.length}</div><div className="metric-foot">Total cadastrado</div></div></div>
    <div className="panel section-gap"><div className="panel-heading"><div><h2>Importar planilha</h2><p>Adicione várias despesas de uma vez, sem precisar digitar linha por linha.</p></div><FileSpreadsheet size={17} color="#80e2b0" /></div><div className="upload-grid"><label className="upload-card"><Upload size={22} /><strong>{importing ? "Lendo planilha…" : "Selecionar Excel"}</strong><small>Colunas: Despesa · Data · Valor · Responsável</small><input type="file" accept=".xlsx,.xls,.csv" onChange={(event) => void importSpreadsheet(event)} disabled={importing || role === "viewer"} /></label><button type="button" className="upload-card" onClick={downloadExpenseTemplate}><Download size={22} /><strong>Baixar planilha modelo</strong><small>Arquivo Excel pronto para preencher</small></button></div><p className="muted">A leitura é gratuita e acontece no próprio navegador. As linhas válidas entram como despesas recorrentes; nomes ou e-mails de membros são vinculados automaticamente.</p></div>
    <div className="dashboard-grid"><div className="panel"><div className="panel-heading"><div><h2>Nova despesa</h2><p>Cadastre e atribua o responsável.</p></div><Plus size={17} color="#80e2b0" /></div><form className="form-grid" onSubmit={addExpense}><label className="form-grid-wide">Descrição<input value={form.description} onChange={(event) => updateForm("description", event.target.value)} placeholder="Condomínio, IPTU, manutenção..." required /></label><label>Valor<input type="number" min="0" step="0.01" value={form.value} onChange={(event) => updateForm("value", event.target.value)} placeholder="0,00" required /></label><label>Tipo<select value={form.kind} onChange={(event) => updateForm("kind", event.target.value)}><option value="fixed">Fixa mensal</option><option value="recurring">Recorrente</option><option value="one_time">Avulsa</option></select></label><label>Categoria<input value={form.category} onChange={(event) => updateForm("category", event.target.value)} /></label><label>Competência<input type="date" value={form.date} onChange={(event) => updateForm("date", event.target.value)} required /></label><label>Responsável<select value={form.responsibleUserId} onChange={(event) => updateForm("responsibleUserId", event.target.value)}><option value="">Holding</option>{members.map((member) => <option key={member.user_id} value={member.user_id}>{member.full_name} · {member.ownership_percentage || 0}%</option>)}</select></label><label>Imóvel relacionado<select value={form.buildingId} onChange={(event) => updateForm("buildingId", event.target.value)}><option value="">Holding / todos</option>{buildings.filter((building) => building.dbId).map((building) => <option key={building.dbId} value={building.dbId}>{building.name}</option>)}</select></label><div className="form-grid-wide onboarding-actions"><span className="muted">As despesas mensais reduzem o saldo automaticamente.</span><button type="submit" className="button button-primary" disabled={saving || role === "viewer"}>{saving ? "Salvando…" : "Cadastrar despesa"}</button></div></form></div><div className="panel"><div className="panel-heading"><div><h2>Lucro mensal por pessoa</h2><p>Participação da holding menos despesas atribuídas.</p></div></div>{members.length ? <div className="table-wrap"><table><thead><tr><th>Pessoa</th><th>Participação</th><th>Receita</th><th>Despesas</th><th>Lucro líquido</th></tr></thead><tbody>{members.map((member) => { const share = ownershipTotal > 0 ? (monthlyProfit + monthlyExpenses) * Number(member.ownership_percentage || 0) / ownershipTotal : (monthlyProfit + monthlyExpenses) / members.length; const assigned = expensesByPerson[member.user_id] ?? 0; return <tr key={member.user_id}><td><strong>{member.full_name}</strong><small>{member.email}</small></td><td>{Number(member.ownership_percentage || 0).toFixed(2).replace(".", ",")}%</td><td>{brl(share)}</td><td>{brl(assigned)}</td><td className={share - assigned < 0 ? "negative" : "positive"}><strong>{brl(share - assigned)}</strong></td></tr>; })}<tr><td><strong>Holding</strong><small>Despesas sem pessoa atribuída</small></td><td>—</td><td>—</td><td>{brl(holdingExpenses)}</td><td className={monthlyProfit - holdingExpenses < 0 ? "negative" : "positive"}><strong>{brl(monthlyProfit - holdingExpenses)}</strong></td></tr></tbody></table></div> : <div className="empty-state"><p>Nenhum membro disponível.</p></div>}</div></div>
    <div className="panel section-gap"><div className="panel-heading"><div><h2>Despesas cadastradas</h2><p>{visibleExpenses.length} de {expenses.length} lançamentos sincronizados.</p></div><div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><input className="table-filter" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar descrição ou responsável" /><select className="filter-select" value={kindFilter} onChange={(event) => setKindFilter(event.target.value)}><option value="all">Todos os tipos</option><option value="fixed">Fixas mensais</option><option value="recurring">Recorrentes</option><option value="one_time">Avulsas</option></select><select className="filter-select" value={responsibleFilter} onChange={(event) => setResponsibleFilter(event.target.value)}><option value="all">Todos os responsáveis</option><option value="holding">Holding</option>{members.map((member) => <option key={member.user_id} value={member.user_id}>{member.full_name}</option>)}</select><select className="filter-select" value={sort} onChange={(event) => setSort(event.target.value)}><option value="date_desc">Data mais recente</option><option value="date_asc">Data mais antiga</option><option value="responsible_asc">Responsável A–Z</option><option value="kind_asc">Tipo A–Z</option><option value="value_desc">Maior valor</option><option value="value_asc">Menor valor</option></select></div></div>{visibleExpenses.length ? <div className="table-wrap"><table><thead><tr><th>Descrição</th><th>Tipo</th><th>Responsável</th><th>Imóvel</th><th>Competência</th><th>Valor</th><th /></tr></thead><tbody>{visibleExpenses.map((expense) => <tr key={expense.id}><td><strong>{expense.description}</strong><small>{expense.category}</small></td><td><span className="tag">{kindLabels[expense.expense_kind]}</span></td><td>{expense.responsible || "Holding"}</td><td>{buildings.find((building) => building.dbId === expense.building_id)?.name ?? "Holding"}</td><td>{expense.expense_date ? new Date(`${expense.expense_date}T12:00:00`).toLocaleDateString("pt-BR") : "—"}</td><td><strong>{brl(Number(expense.value || 0))}</strong></td><td><button className="icon-btn" onClick={() => void removeExpense(expense)} disabled={role === "viewer"} aria-label={`Excluir despesa ${expense.description}`}><Trash2 size={14} /></button></td></tr>)}</tbody></table></div> : <div className="empty-state"><Receipt size={28} /><h3>Nenhuma despesa encontrada</h3><p>Ajuste os filtros ou cadastre uma nova despesa.</p></div>}</div>
  </div>;
}
