"use client";

import { ArrowDownRight, CircleDollarSign, Download, Edit3, FileSpreadsheet, Plus, Receipt, Save, Trash2, Upload, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { usePortfolio } from "@/components/portfolio-provider";
import { brl } from "@/lib/format";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import type { ExpenseKind, ExpenseRecord } from "@/types/domain";

type Member = { member_id: string; user_id?: string | null; contact_id?: string | null; full_name: string; email: string; ownership_percentage: number; is_placeholder?: boolean };
const kindLabels: Record<ExpenseKind, string> = { fixed: "Fixa mensal", recurring: "Recorrente", one_time: "Avulsa" };
const today = () => new Date().toISOString().slice(0, 10);
const currentMonth = () => new Date().toISOString().slice(0, 7);
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

function parseImportedBoolean(value: unknown) {
  const text = normalizeSearch(value);
  if (["sim", "s", "yes", "y", "true", "1"].includes(text)) return true;
  if (["nao", "n", "no", "false", "0"].includes(text)) return false;
  return undefined;
}

function parseImportedKind(typeValue: unknown, monthlyValue: unknown): ExpenseKind {
  const type = normalizeSearch(typeValue);
  if (type.includes("avul") || type.includes("one_time") || type.includes("one time")) return "one_time";
  if (type.includes("fixa") || type.includes("fixed")) return "fixed";
  if (type.includes("recorr")) return "recurring";
  return parseImportedBoolean(monthlyValue) === false ? "one_time" : "recurring";
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
  const [editingExpense, setEditingExpense] = useState<ExpenseRecord | null>(null);
  const [form, setForm] = useState({ description: "", value: "", kind: "recurring" as ExpenseKind, category: "Operacional", responsibleUserIds: [] as string[], buildingId: "", date: today() });

  useEffect(() => {
    if (!organizationId) return;
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;
    supabase.rpc("list_organization_members", { target_org: organizationId }).then(({ data }) => setMembers((data ?? []) as Member[]));
  }, [organizationId]);

  const ownershipTotal = members.reduce((total, member) => total + Number(member.ownership_percentage || 0), 0);
  const expenseMemberIds = (expense: ExpenseRecord) => (expense.responsibilities?.length ? expense.responsibilities.map((item) => item.user_id ? `user:${item.user_id}` : item.contact_id ? `contact:${item.contact_id}` : "").filter(Boolean) : [expense.responsible_user_id ? `user:${expense.responsible_user_id}` : expense.responsible_contact_id ? `contact:${expense.responsible_contact_id}` : ""].filter(Boolean));
  const isIncludedInCurrentMonth = (expense: ExpenseRecord) => expense.expense_kind !== "one_time" || expense.expense_date?.startsWith(currentMonth());
  const memberOption = (member: Member) => member.user_id ? `user:${member.user_id}` : `contact:${member.contact_id}`;
  const expensesByPerson = useMemo(() => expenses.filter((expense) => isIncludedInCurrentMonth(expense)).reduce<Record<string, number>>((totals, expense) => { const assignments = expense.responsibilities?.length ? expense.responsibilities : expenseMemberIds(expense).map((id) => ({ user_id: id.startsWith("user:") ? id.slice(5) : undefined, contact_id: id.startsWith("contact:") ? id.slice(8) : undefined, share_percentage: 100 })); assignments.forEach((assignment) => { const id = assignment.user_id ? `user:${assignment.user_id}` : assignment.contact_id ? `contact:${assignment.contact_id}` : ""; if (id) totals[id] = (totals[id] ?? 0) + Number(expense.value || 0) * Number(assignment.share_percentage || 0) / 100; }); return totals; }, {}), [expenses]);
  const holdingExpenses = expenses.filter((expense) => isIncludedInCurrentMonth(expense) && !expense.responsibilities?.length && !expense.responsible_user_id && !expense.responsible_contact_id).reduce((total, expense) => total + Number(expense.value || 0), 0);
  const visibleExpenses = useMemo(() => expenses.filter((expense) => {
    const text = `${expense.description} ${expense.category} ${expense.responsible ?? "Holding"}`.toLowerCase();
    return text.includes(query.toLowerCase()) && (kindFilter === "all" || expense.expense_kind === kindFilter) && (responsibleFilter === "all" || (expenseMemberIds(expense).length ? expenseMemberIds(expense).includes(responsibleFilter) : responsibleFilter === "holding"));
  }).sort((left, right) => sort === "date_asc" ? left.expense_date.localeCompare(right.expense_date) : sort === "value_desc" ? right.value - left.value : sort === "value_asc" ? left.value - right.value : sort === "responsible_asc" ? (left.responsible ?? "Holding").localeCompare(right.responsible ?? "Holding", "pt-BR") : sort === "kind_asc" ? kindLabels[left.expense_kind].localeCompare(kindLabels[right.expense_kind], "pt-BR") : right.expense_date.localeCompare(left.expense_date)), [expenses, kindFilter, query, responsibleFilter, sort]);

  function updateForm(field: keyof typeof form, value: string) { setForm((current) => ({ ...current, [field]: value })); }

  async function addExpense(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!organizationId || role === "viewer") { setMessage("Seu perfil não pode cadastrar despesas."); return; }
    const value = Number(form.value.replace(",", "."));
    if (!form.description.trim() || !Number.isFinite(value) || value <= 0) { setMessage("Informe descrição e valor da despesa."); return; }
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;
    const selectedMembers = members.filter((item) => form.responsibleUserIds.includes(memberOption(item)));
    const primaryMember = selectedMembers[0];
    const sharePercentage = selectedMembers.length ? 100 / selectedMembers.length : 0;
    setSaving(true);
    const result = await supabase.from("expenses").insert({ organization_id: organizationId, description: form.description.trim(), category: form.category.trim() || "Operacional", value, expense_date: form.date || today(), competence: form.date || today(), recurring: form.kind !== "one_time", expense_kind: form.kind, responsible: selectedMembers.length ? selectedMembers.map((member) => member.full_name).join(", ") : "Holding", responsible_user_id: primaryMember?.user_id || null, responsible_contact_id: primaryMember?.contact_id || null, building_id: form.buildingId || null }).select("id").single();
    if (result.error) setMessage(result.error.message);
    else {
      if (selectedMembers.length) await supabase.from("expense_responsibilities").insert(selectedMembers.map((member) => ({ organization_id: organizationId, expense_id: result.data.id, user_id: member.user_id || null, contact_id: member.contact_id || null, share_percentage: sharePercentage })));
      setMessage("Despesa cadastrada e saldo atualizado."); setForm({ description: "", value: "", kind: "recurring", category: "Operacional", responsibleUserIds: [], buildingId: "", date: today() }); await refresh();
    }
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

  function openEditExpense(expense: ExpenseRecord) {
    const responsibleUserIds = expense.responsibilities?.length ? expense.responsibilities.map((item) => item.user_id ? `user:${item.user_id}` : item.contact_id ? `contact:${item.contact_id}` : "").filter(Boolean) : [expense.responsible_user_id ? `user:${expense.responsible_user_id}` : expense.responsible_contact_id ? `contact:${expense.responsible_contact_id}` : ""].filter(Boolean);
    setForm({ description: expense.description, value: String(expense.value), kind: expense.expense_kind, category: expense.category || "Operacional", responsibleUserIds, buildingId: expense.building_id ?? "", date: expense.expense_date || today() });
    setEditingExpense(expense);
    setMessage("");
  }

  async function saveEditedExpense(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingExpense || !organizationId || role === "viewer") { setMessage("Seu perfil não pode editar despesas."); return; }
    const value = Number(form.value.replace(",", "."));
    if (!form.description.trim() || !Number.isFinite(value) || value <= 0) { setMessage("Informe descrição e valor da despesa."); return; }
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;
    const selectedMembers = members.filter((item) => form.responsibleUserIds.includes(memberOption(item)));
    const primaryMember = selectedMembers[0];
    setSaving(true);
    const result = await supabase.from("expenses").update({ description: form.description.trim(), category: form.category.trim() || "Operacional", value, expense_date: form.date || today(), competence: form.date || today(), recurring: form.kind !== "one_time", expense_kind: form.kind, responsible: selectedMembers.length ? selectedMembers.map((member) => member.full_name).join(", ") : "Holding", responsible_user_id: primaryMember?.user_id || null, responsible_contact_id: primaryMember?.contact_id || null, building_id: form.buildingId || null }).eq("id", editingExpense.id).eq("organization_id", organizationId);
    if (result.error) setMessage(`Não foi possível atualizar: ${result.error.message}`);
    else {
      await supabase.from("expense_responsibilities").delete().eq("expense_id", editingExpense.id).eq("organization_id", organizationId);
      if (selectedMembers.length) await supabase.from("expense_responsibilities").insert(selectedMembers.map((member) => ({ organization_id: organizationId, expense_id: editingExpense.id, user_id: member.user_id || null, contact_id: member.contact_id || null, share_percentage: 100 / selectedMembers.length })));
      setMessage("Despesa atualizada e saldo recalculado."); setEditingExpense(null); await refresh();
    }
    setSaving(false);
  }

  function downloadExpenseTemplate() {
    const worksheet = XLSX.utils.aoa_to_sheet([["Despesa", "Data", "Valor", "Responsável", "Mensal", "Tipo", "Categoria", "Holding", "Imóvel"]]);
    worksheet["!cols"] = [{ wch: 34 }, { wch: 15 }, { wch: 16 }, { wch: 28 }, { wch: 12 }, { wch: 16 }, { wch: 20 }, { wch: 12 }, { wch: 28 }];
    worksheet["!autofilter"] = { ref: "A1:I1" };
    const instructions = XLSX.utils.aoa_to_sheet([
      ["Campo", "Obrigatório", "Valores ou formato aceito", "Exemplo / observação"],
      ["Despesa", "Sim", "Texto livre", "Condomínio, IPTU, manutenção"],
      ["Data", "Sim", "dd/mm/aaaa, aaaa-mm-dd ou data do Excel", "15/01/2026"],
      ["Valor", "Sim", "Número positivo; aceita R$ e vírgula decimal", "R$ 1.250,00"],
      ["Responsável", "Sim", "Nome completo ou e-mail cadastrado; use Holding para despesa coletiva", "Paulo Cardoso"],
      ["Mensal", "Não", "Sim ou Não", "Sim = entra no saldo mensal; Não = avulsa"],
      ["Tipo", "Não", "Fixa mensal, Recorrente ou Avulsa", "Tipo tem prioridade sobre Mensal"],
      ["Categoria", "Não", "Texto livre", "Condomínio, Imposto, Manutenção"],
      ["Holding", "Não", "Sim ou Não", "Sim = ignora o responsável e atribui à holding"],
      ["Imóvel", "Não", "Nome exato ou parcial do prédio cadastrado", "Edifício Cardoso"],
      [],
      ["Observação", "", "O nome do responsável e do imóvel deve corresponder ao cadastro da holding.", "Linhas com descrição, data e valor inválidos não são importadas."]
    ]);
    instructions["!cols"] = [{ wch: 20 }, { wch: 14 }, { wch: 62 }, { wch: 52 }];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Despesas");
    XLSX.utils.book_append_sheet(workbook, instructions, "Instruções e opções");
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
      const monthlyColumn = findColumn(["mensal", "recorrente", "recorrencia", "fixamensal", "eomesp"]);
      const typeColumn = findColumn(["tipo", "tipodespesa", "kind", "expensekind"]);
      const categoryColumn = findColumn(["categoria", "category", "classificacao"]);
      const holdingColumn = findColumn(["holding", "despesadaholding", "ehholding", "responsabilidadeholding"]);
      const buildingColumn = findColumn(["imovel", "predio", "building", "imovelrelacionado"]);
      if (!expenseColumn || !dateColumn || !valueColumn || !responsibleColumn) {
        setMessage("Erro: a planilha precisa das colunas Despesa, Data, Valor e Responsável. As demais são opcionais.");
        return;
      }
      const imported = rows.map((row) => {
        const description = String(row[expenseColumn] ?? "").trim();
        const value = parseImportedValue(row[valueColumn]);
        const expenseDate = parseImportedDate(row[dateColumn]);
        const responsibleText = String(row[responsibleColumn] ?? "").trim();
        const responsibleSearch = normalizeSearch(responsibleText);
        const isHolding = holdingColumn ? parseImportedBoolean(row[holdingColumn]) : undefined;
        const member = responsibleSearch && isHolding !== true ? members.find((item) => [item.full_name, item.email].some((candidate) => normalizeSearch(candidate) === responsibleSearch || responsibleSearch.includes(normalizeSearch(candidate)))) : undefined;
        const buildingText = buildingColumn ? String(row[buildingColumn] ?? "").trim() : "";
        const buildingSearch = normalizeSearch(buildingText);
        const building = buildingSearch ? buildings.find((item) => normalizeSearch(item.name) === buildingSearch || buildingSearch.includes(normalizeSearch(item.name))) : undefined;
        const expenseKind = parseImportedKind(typeColumn ? row[typeColumn] : "", monthlyColumn ? row[monthlyColumn] : "");
        return description && Number.isFinite(value) && value > 0 && expenseDate ? { organization_id: organizationId, description, category: categoryColumn ? String(row[categoryColumn] ?? "").trim() || "Importação Excel" : "Importação Excel", value, expense_date: expenseDate, competence: expenseDate, recurring: expenseKind !== "one_time", expense_kind: expenseKind, responsible: isHolding === true ? "Holding" : member?.full_name ?? (responsibleText || "Holding"), responsible_user_id: isHolding === true ? null : member?.user_id ?? null, responsible_contact_id: isHolding === true ? null : member?.contact_id ?? null, building_id: building?.dbId ?? null } : null;
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
    {message && <p className={message.startsWith("Erro") || message.startsWith("Não") || message.startsWith("Seu") || message.startsWith("Informe") ? "form-error" : "form-success"}><Receipt size={13} /> {message}</p>}
    <div className="metrics"><div className="metric-card"><div className="metric-top"><span>Despesas mensais</span><span className="metric-icon"><ArrowDownRight size={15} /></span></div><div className="metric-value">{brl(monthlyExpenses)}</div><div className="metric-foot">Fixas + recorrentes + avulsas do mês</div></div><div className="metric-card"><div className="metric-top"><span>Saldo mensal</span><span className="metric-icon">R$</span></div><div className={`metric-value ${monthlyProfit < 0 ? "negative" : ""}`}>{brl(monthlyProfit)}</div><div className="metric-foot">Receitas − despesas</div></div><div className="metric-card"><div className="metric-top"><span>Lançamentos</span><span className="metric-icon"><Receipt size={15} /></span></div><div className="metric-value">{expenses.length}</div><div className="metric-foot">Total cadastrado</div></div></div>
    <div className="panel expense-import-panel section-gap"><div><div className="panel-heading"><div><h2>Importar planilha</h2><p>Obrigatórias: Despesa · Data · Valor · Responsável.</p></div><FileSpreadsheet size={16} color="#80e2b0" /></div><p className="muted">O modelo também traz Mensal, Tipo, Categoria, Holding e Imóvel para automatizar o cadastro.</p></div><div className="expense-import-actions"><label className="expense-upload-button"><Upload size={14} />{importing ? "Lendo…" : "Importar Excel"}<input type="file" accept=".xlsx,.xls,.csv" onChange={(event) => void importSpreadsheet(event)} disabled={importing || role === "viewer"} /></label><button type="button" className="expense-template-link" onClick={downloadExpenseTemplate}><Download size={12} /> Baixar modelo</button></div></div>
    <div className="dashboard-grid"><div className="panel"><div className="panel-heading"><div><h2>Nova despesa</h2><p>Cadastre e atribua um ou mais responsáveis.</p></div><Plus size={17} color="#80e2b0" /></div><form className="form-grid" onSubmit={addExpense}><label className="form-grid-wide">Descrição<input value={form.description} onChange={(event) => updateForm("description", event.target.value)} placeholder="Condomínio, IPTU, manutenção..." required /></label><label>Valor<input type="number" min="0" step="0.01" value={form.value} onChange={(event) => updateForm("value", event.target.value)} placeholder="0,00" required /></label><label>Tipo<select value={form.kind} onChange={(event) => updateForm("kind", event.target.value)}><option value="fixed">Fixa mensal</option><option value="recurring">Recorrente</option><option value="one_time">Avulsa</option></select></label><label>Categoria<input value={form.category} onChange={(event) => updateForm("category", event.target.value)} /></label><label>Competência<input type="date" value={form.date} onChange={(event) => updateForm("date", event.target.value)} required /></label><label>Responsáveis <small className="muted">Selecione vários com Ctrl/Cmd</small><select multiple size={4} value={form.responsibleUserIds} onChange={(event) => setForm((current) => ({ ...current, responsibleUserIds: Array.from(event.target.selectedOptions, (option) => option.value) }))}>{members.map((member) => <option key={member.member_id} value={memberOption(member)}>{member.full_name} · {member.ownership_percentage || 0}%{member.is_placeholder ? " · sem acesso" : ""}</option>)}</select></label><label>Imóvel relacionado<select value={form.buildingId} onChange={(event) => updateForm("buildingId", event.target.value)}><option value="">Holding / todos</option>{buildings.filter((building) => building.dbId).map((building) => <option key={building.dbId} value={building.dbId}>{building.name}</option>)}</select></label><div className="form-grid-wide onboarding-actions"><span className="muted">Sem responsáveis, a despesa fica na holding. Com vários, o valor é dividido igualmente.</span><button type="submit" className="button button-primary" disabled={saving || role === "viewer"}>{saving ? "Salvando…" : "Cadastrar despesa"}</button></div></form></div><div className="panel"><div className="panel-heading"><div><h2>Lucro mensal por pessoa</h2><p>Participação da holding menos despesas atribuídas.</p></div></div>{members.length ? <div className="table-wrap profit-table-wrap"><table className="profit-table"><thead><tr><th>Pessoa</th><th>Participação</th><th>Receita</th><th>Despesas</th><th>Lucro líquido</th></tr></thead><tbody>{members.map((member) => { const share = ownershipTotal > 0 ? (monthlyProfit + monthlyExpenses) * Number(member.ownership_percentage || 0) / ownershipTotal : (monthlyProfit + monthlyExpenses) / members.length; const assigned = expensesByPerson[member.member_id] ?? 0; return <tr key={member.member_id}><td><strong>{member.full_name}</strong><small>{member.email || "Membro sem acesso"}</small></td><td>{Number(member.ownership_percentage || 0).toFixed(2).replace(".", ",")}%</td><td>{brl(share)}</td><td>{brl(assigned)}</td><td className={share - assigned < 0 ? "negative" : "positive"}><strong>{brl(share - assigned)}</strong></td></tr>; })}<tr><td><strong>Holding</strong><small>Despesas sem pessoa atribuída</small></td><td>—</td><td>—</td><td>{brl(holdingExpenses)}</td><td className={monthlyProfit - holdingExpenses < 0 ? "negative" : "positive"}><strong>{brl(monthlyProfit - holdingExpenses)}</strong></td></tr></tbody></table></div> : <div className="empty-state"><p>Nenhum membro disponível.</p></div>}</div></div>
    <div className="panel section-gap"><div className="panel-heading"><div><h2>Despesas cadastradas</h2><p>{visibleExpenses.length} de {expenses.length} lançamentos sincronizados.</p></div><div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><input className="table-filter" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar descrição ou responsável" /><select className="filter-select" value={kindFilter} onChange={(event) => setKindFilter(event.target.value)}><option value="all">Todos os tipos</option><option value="fixed">Fixas mensais</option><option value="recurring">Recorrentes</option><option value="one_time">Avulsas</option></select><select className="filter-select" value={responsibleFilter} onChange={(event) => setResponsibleFilter(event.target.value)}><option value="all">Todos os responsáveis</option><option value="holding">Holding</option>{members.map((member) => <option key={member.member_id} value={memberOption(member)}>{member.full_name}</option>)}</select><select className="filter-select" value={sort} onChange={(event) => setSort(event.target.value)}><option value="date_desc">Data mais recente</option><option value="date_asc">Data mais antiga</option><option value="responsible_asc">Responsável A–Z</option><option value="kind_asc">Tipo A–Z</option><option value="value_desc">Maior valor</option><option value="value_asc">Menor valor</option></select></div></div>{visibleExpenses.length ? <div className="table-wrap"><table><thead><tr><th>Descrição</th><th>Tipo</th><th>Responsável</th><th>Imóvel</th><th>Competência</th><th>Valor</th><th>Ações</th></tr></thead><tbody>{visibleExpenses.map((expense) => <tr key={expense.id}><td><strong>{expense.description}</strong><small>{expense.category}</small></td><td><span className="tag">{kindLabels[expense.expense_kind]}</span></td><td>{expense.responsible || "Holding"}</td><td>{buildings.find((building) => building.dbId === expense.building_id)?.name ?? "Holding"}</td><td>{expense.expense_date ? new Date(`${expense.expense_date}T12:00:00`).toLocaleDateString("pt-BR") : "—"}</td><td><strong>{brl(Number(expense.value || 0))}</strong></td><td><div className="table-actions"><button className="icon-btn" onClick={() => openEditExpense(expense)} disabled={role === "viewer"} aria-label={`Editar despesa ${expense.description}`}><Edit3 size={14} /></button><button className="icon-btn" onClick={() => void removeExpense(expense)} disabled={role === "viewer"} aria-label={`Excluir despesa ${expense.description}`}><Trash2 size={14} /></button></div></td></tr>)}</tbody></table></div> : <div className="empty-state"><Receipt size={28} /><h3>Nenhuma despesa encontrada</h3><p>Ajuste os filtros ou cadastre uma nova despesa.</p></div>}</div>
    {editingExpense && <div className="modal-backdrop"><form className="edit-modal" onSubmit={saveEditedExpense}><div className="panel-heading"><div><h2>Editar despesa</h2><p>Atualize o lançamento e recalcule o saldo automaticamente.</p></div><button type="button" className="icon-btn" onClick={() => setEditingExpense(null)} aria-label="Fechar edição"><X size={16} /></button></div><div className="form-grid"><label className="form-grid-wide">Descrição<input value={form.description} onChange={(event) => updateForm("description", event.target.value)} required /></label><label>Valor<input type="number" min="0" step="0.01" value={form.value} onChange={(event) => updateForm("value", event.target.value)} required /></label><label>Tipo<select value={form.kind} onChange={(event) => updateForm("kind", event.target.value)}><option value="fixed">Fixa mensal</option><option value="recurring">Recorrente</option><option value="one_time">Avulsa</option></select></label><label>Categoria<input value={form.category} onChange={(event) => updateForm("category", event.target.value)} /></label><label>Competência<input type="date" value={form.date} onChange={(event) => updateForm("date", event.target.value)} required /></label><label>Responsáveis <small className="muted">Selecione vários com Ctrl/Cmd</small><select multiple size={4} value={form.responsibleUserIds} onChange={(event) => setForm((current) => ({ ...current, responsibleUserIds: Array.from(event.target.selectedOptions, (option) => option.value) }))}>{members.map((member) => <option key={member.member_id} value={memberOption(member)}>{member.full_name}{member.is_placeholder ? " · sem acesso" : ""}</option>)}</select></label><label className="form-grid-wide">Imóvel relacionado<select value={form.buildingId} onChange={(event) => updateForm("buildingId", event.target.value)}><option value="">Holding / todos</option>{buildings.filter((building) => building.dbId).map((building) => <option key={building.dbId} value={building.dbId}>{building.name}</option>)}</select></label></div><div className="onboarding-actions"><button type="button" className="button button-ghost" onClick={() => setEditingExpense(null)}>Cancelar</button><button type="submit" className="button button-primary" disabled={saving}><Save size={14} /> {saving ? "Salvando…" : "Salvar alterações"}</button></div></form></div>}
  </div>;
}
