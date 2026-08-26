"use client";

import { ArrowDownRight, ArrowUpRight, CalendarClock, CalendarDays, Check, ChevronLeft, ChevronRight, CircleDollarSign, Edit3, Landmark, Plus, Save, Send, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { usePortfolio } from "@/components/portfolio-provider";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import { brl } from "@/lib/format";
import type { LeasePaymentRecord, LeasePaymentStatus } from "@/types/domain";
import { currentMonthKey, monthLabel, shiftMonth } from "@/lib/month";

type Member = { member_id: string; user_id?: string | null; contact_id?: string | null; full_name: string; email: string; ownership_percentage: number; is_placeholder?: boolean };
type LeaseRow = { leaseId: string; unitId: string; buildingId: string; buildingName: string; unitCode: string; tenant: string; rent: number; dueDay: number };
type PaymentForm = { leaseId: string; competence: string; dueDate: string; expectedAmount: string; receivedAmount: string; receivedAt: string; status: LeasePaymentStatus; notes: string };

const today = () => new Date().toISOString().slice(0, 10);
const month = () => new Date().toISOString().slice(0, 7);
const firstDay = (value = month()) => `${value}-01`;
const dateLabel = (value?: string) => value ? new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR") : "—";
const statusLabels: Record<LeasePaymentStatus, string> = { pending: "Pendente", paid: "Pago", overdue: "Atrasado", partial: "Parcial", waived: "Dispensado" };

function dueDateFor(competence: string, dueDay: number) {
  const [year, monthNumber] = competence.slice(0, 7).split("-").map(Number);
  const lastDay = new Date(year, monthNumber, 0).getDate();
  return `${year}-${String(monthNumber).padStart(2, "0")}-${String(Math.min(Math.max(dueDay || 10, 1), lastDay)).padStart(2, "0")}`;
}

function paymentState(payment: LeasePaymentRecord | undefined, lease: LeaseRow) {
  if (payment?.status === "paid" || payment?.status === "waived" || (payment && payment.receivedAmount >= payment.expectedAmount && payment.expectedAmount > 0)) return "paid";
  if (payment?.status === "partial" || (payment && payment.receivedAmount > 0)) return "partial";
  const due = payment?.dueDate ?? dueDateFor(month(), lease.dueDay);
  if (payment?.status === "overdue" || due < today()) return "overdue";
  return "pending";
}

function blankPayment(lease?: LeaseRow): PaymentForm {
  const competence = firstDay();
  return { leaseId: lease?.leaseId ?? "", competence, dueDate: lease ? dueDateFor(competence, lease.dueDay) : competence, expectedAmount: lease ? String(lease.rent) : "", receivedAmount: "", receivedAt: "", status: "pending", notes: "" };
}

export default function AlugueisPage() {
  const { buildings, leasePayments, distributions, bankAccount, bankBalance, loading, organizationId, role, refresh } = usePortfolio();
  const [members, setMembers] = useState<Member[]>([]);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [bankValue, setBankValue] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sort, setSort] = useState("competence_desc");
  const [paymentForm, setPaymentForm] = useState<PaymentForm>(blankPayment());
  const [editingPayment, setEditingPayment] = useState<LeasePaymentRecord | null>(null);
  const [transferValue, setTransferValue] = useState("");
  const [transferDate, setTransferDate] = useState(today());
  const [transferDescription, setTransferDescription] = useState("Distribuição mensal aos sócios");
  const [selectedMonth, setSelectedMonth] = useState(currentMonthKey);

  useEffect(() => { setBankValue(bankAccount ? String(bankAccount.initialBalance) : ""); }, [bankAccount]);
  useEffect(() => {
    if (!organizationId) return;
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;
    supabase.rpc("list_organization_members", { target_org: organizationId }).then(({ data }) => setMembers((data ?? []) as Member[]));
  }, [organizationId]);

  const leases = useMemo<LeaseRow[]>(() => buildings.filter((building) => building.status !== "vendido").flatMap((building) => (building.unitsData ?? []).filter((unit) => unit.lease && unit.rent > 0).map((unit) => ({ leaseId: unit.lease!.id, unitId: unit.id, buildingId: building.dbId ?? building.id, buildingName: building.name, unitCode: unit.code, tenant: unit.tenantName ?? unit.tenant ?? "Inquilino não informado", rent: unit.rent, dueDay: unit.lease!.dueDay ?? 10 }))), [buildings]);
  const leaseById = useMemo(() => new Map(leases.map((lease) => [lease.leaseId, lease])), [leases]);
  const currentPayments = useMemo(() => leasePayments.filter((payment) => payment.competence.startsWith(selectedMonth)), [leasePayments, selectedMonth]);
  const receivedThisMonth = currentPayments.filter((payment) => payment.status === "paid" || payment.receivedAmount > 0).reduce((sum, payment) => sum + (payment.netAmount || payment.receivedAmount), 0);
  const missingPayments = leases.filter((lease) => paymentState(currentPayments.find((payment) => payment.leaseId === lease.leaseId), lease) !== "paid");
  const overduePayments = missingPayments.filter((lease) => paymentState(currentPayments.find((payment) => payment.leaseId === lease.leaseId), lease) === "overdue");
  const visiblePayments = useMemo(() => leasePayments.filter((payment) => payment.competence.startsWith(selectedMonth)).filter((payment) => {
    const lease = leaseById.get(payment.leaseId);
    if (!lease) return false;
    const state = paymentState(payment, lease);
    return (statusFilter === "all" || state === statusFilter) && `${lease.buildingName} ${lease.unitCode} ${lease.tenant}`.toLowerCase().includes(query.toLowerCase());
  }).sort((left, right) => {
    const leftLease = leaseById.get(left.leaseId); const rightLease = leaseById.get(right.leaseId);
    if (sort === "value_desc") return right.expectedAmount - left.expectedAmount;
    if (sort === "value_asc") return left.expectedAmount - right.expectedAmount;
    if (sort === "tenant_asc") return (leftLease?.tenant ?? "").localeCompare(rightLease?.tenant ?? "", "pt-BR");
    return sort === "competence_asc" ? left.competence.localeCompare(right.competence) : right.competence.localeCompare(left.competence);
  }), [leasePayments, leaseById, query, sort, statusFilter, selectedMonth]);

  function selectLease(leaseId: string) {
    const lease = leaseById.get(leaseId);
    setPaymentForm((current) => ({ ...current, leaseId, expectedAmount: lease ? String(lease.rent) : current.expectedAmount, dueDate: lease ? dueDateFor(current.competence, lease.dueDay) : current.dueDate }));
  }

  async function saveBankAccount(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!organizationId || role === "viewer") { setMessage("Seu perfil não pode alterar o saldo bancário."); return; }
    const initialBalance = Number(bankValue.replace(",", "."));
    if (!Number.isFinite(initialBalance) || initialBalance < 0) { setMessage("Informe um saldo inicial válido."); return; }
    const supabase = createSupabaseBrowserClient(); if (!supabase) return;
    setSaving(true);
    const result = bankAccount ? await supabase.from("bank_accounts").update({ initial_balance: initialBalance }).eq("id", bankAccount.id).eq("organization_id", organizationId) : await supabase.from("bank_accounts").insert({ organization_id: organizationId, name: "Conta principal", initial_balance: initialBalance });
    setMessage(result.error ? `Não foi possível salvar o saldo: ${result.error.message}` : "Saldo bancário atualizado.");
    if (!result.error) await refresh();
    setSaving(false);
  }

  async function generateMonthCharges() {
    if (!organizationId || role === "viewer") { setMessage("Seu perfil não pode gerar cobranças."); return; }
    const supabase = createSupabaseBrowserClient(); if (!supabase) return;
    const existing = new Set(currentPayments.map((payment) => payment.leaseId));
    const rows = leases.filter((lease) => !existing.has(lease.leaseId)).map((lease) => ({ organization_id: organizationId, lease_id: lease.leaseId, competence: firstDay(selectedMonth), due_date: dueDateFor(selectedMonth, lease.dueDay), expected_amount: lease.rent, received_amount: 0, status: "pending" }));
    if (!rows.length) { setMessage(`Todas as unidades alugadas já têm cobrança para ${monthLabel(selectedMonth)}.`); return; }
    setSaving(true);
    const result = await supabase.from("lease_payments").insert(rows);
    setMessage(result.error ? `Não foi possível gerar as cobranças: ${result.error.message}` : `${rows.length} cobrança(s) criada(s) para ${monthLabel(selectedMonth)}.`);
    if (!result.error) await refresh();
    setSaving(false);
  }

  async function savePayment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!organizationId || role === "viewer") { setMessage("Seu perfil não pode registrar aluguéis."); return; }
    const expected = Number(paymentForm.expectedAmount.replace(",", "."));
    const received = Number(paymentForm.receivedAmount.replace(",", ".") || 0);
    if (!paymentForm.leaseId || !paymentForm.competence || !Number.isFinite(expected) || expected <= 0 || !Number.isFinite(received) || received < 0) { setMessage("Informe imóvel, competência e valores válidos."); return; }
    const supabase = createSupabaseBrowserClient(); if (!supabase) return;
    const status = paymentForm.status === "waived" ? "waived" : received >= expected ? "paid" : received > 0 ? "partial" : paymentForm.status;
    setSaving(true);
    const payload = { organization_id: organizationId, lease_id: paymentForm.leaseId, competence: firstDay(paymentForm.competence), due_date: paymentForm.dueDate, expected_amount: expected, received_amount: received, received_at: paymentForm.receivedAt || null, status, notes: paymentForm.notes.trim() };
    const result = await supabase.from("lease_payments").upsert(payload, { onConflict: "lease_id,competence" });
    setMessage(result.error ? `Não foi possível salvar o aluguel: ${result.error.message}` : "Aluguel atualizado e saldo recalculado.");
    if (!result.error) { setEditingPayment(null); setPaymentForm(blankPayment(leases[0])); await refresh(); }
    setSaving(false);
  }

  async function removePayment(payment: LeasePaymentRecord) {
    if (!organizationId || role === "viewer" || (role !== "owner" && role !== "admin") || !window.confirm("Excluir este lançamento de aluguel?")) return;
    const supabase = createSupabaseBrowserClient(); if (!supabase) return;
    const result = await supabase.from("lease_payments").delete().eq("id", payment.id).eq("organization_id", organizationId);
    setMessage(result.error ? result.error.message : "Lançamento removido e saldo recalculado.");
    if (!result.error) await refresh();
  }

  async function togglePaymentCheck(payment: LeasePaymentRecord) {
    if (!organizationId || role === "viewer") return;
    const supabase = createSupabaseBrowserClient(); if (!supabase) return;
    const paid = payment.status === "paid" || payment.receivedAmount >= payment.expectedAmount;
    setSaving(true); setMessage("");
    const result = await supabase.rpc("toggle_lease_payment", { target_org: organizationId, target_lease: payment.leaseId, target_competence: payment.competence, mark_paid: !paid });
    setMessage(result.error ? "Não foi possível atualizar a confirmação do pagamento." : (!paid ? "Pagamento confirmado e crédito criado." : "Pagamento desmarcado e crédito desfeito."));
    if (!result.error) await refresh();
    setSaving(false);
  }

  async function transferToMembers(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!organizationId || role === "viewer") { setMessage("Seu perfil não pode registrar transferências."); return; }
    const amount = Number(transferValue.replace(",", "."));
    if (!Number.isFinite(amount) || amount <= 0 || amount >= bankBalance) { setMessage("A transferência deve ser positiva e manter saldo positivo na conta."); return; }
    if (!members.length) { setMessage("Cadastre os membros antes de distribuir o saldo."); return; }
    const totalOwnership = members.reduce((sum, member) => sum + Number(member.ownership_percentage || 0), 0);
    const supabase = createSupabaseBrowserClient(); if (!supabase) return;
    setSaving(true);
    const distribution = await supabase.from("distributions").insert({ organization_id: organizationId, distribution_date: transferDate, description: transferDescription.trim() || "Distribuição aos sócios", total_value: amount, status: "paid" }).select("id").single();
    if (distribution.error || !distribution.data) { setMessage(distribution.error?.message ?? "Não foi possível criar a distribuição."); setSaving(false); return; }
    let allocated = 0;
    const items = members.map((member, index) => {
      const percentage = totalOwnership > 0 ? Number(member.ownership_percentage || 0) / totalOwnership : 1 / members.length;
      const value = index === members.length - 1 ? amount - allocated : Math.round(amount * percentage * 100) / 100;
      allocated += value;
      return { organization_id: organizationId, distribution_id: distribution.data.id, user_id: member.user_id || null, contact_id: member.contact_id || null, percentage: percentage * 100, value, payment_status: "paid", paid_at: transferDate };
    }).filter((item) => item.user_id || item.contact_id);
    const itemsResult = await supabase.from("distribution_items").insert(items);
    if (itemsResult.error) { await supabase.from("distributions").delete().eq("id", distribution.data.id).eq("organization_id", organizationId); setMessage(`Não foi possível distribuir: ${itemsResult.error.message}`); }
    else { setMessage("Transferência registrada e saldo bancário atualizado."); setTransferValue(""); await refresh(); }
    setSaving(false);
  }

  if (loading) return <div className="content"><div className="empty-state"><p>Carregando aluguéis...</p></div></div>;
  if (!organizationId) return <div className="content"><div className="empty-state"><Landmark size={30} /><h3>Nenhuma organização selecionada</h3><p>Entre em uma holding para controlar os aluguéis.</p></div></div>;
  return <div className="content">
    <div className="page-heading"><div><div className="eyebrow"><CircleDollarSign size={13} /> Receitas imobiliárias</div><h1>Aluguéis</h1><p className="subtitle">Registre recebimentos vinculados ao imóvel e acompanhe o saldo da conta da holding.</p></div><div className="page-heading-actions"><div className="month-navigator"><button type="button" className="icon-btn" onClick={() => setSelectedMonth((value) => shiftMonth(value, -1))} aria-label="Mês anterior"><ChevronLeft size={16} /></button><CalendarDays size={15} /><strong>{monthLabel(selectedMonth)}</strong><button type="button" className="icon-btn" onClick={() => setSelectedMonth((value) => shiftMonth(value, 1))} aria-label="Próximo mês"><ChevronRight size={16} /></button></div><button className="button button-primary" onClick={() => { setEditingPayment(null); setPaymentForm({ ...blankPayment(leases[0]), competence: firstDay(selectedMonth), dueDate: leases[0] ? dueDateFor(selectedMonth, leases[0].dueDay) : firstDay(selectedMonth) }); }} disabled={role === "viewer"}><Plus size={14} /> Registrar aluguel</button></div></div>
    {message && <p className={message.startsWith("Não") || message.startsWith("Seu") || message.startsWith("Informe") || message.startsWith("A transferência") || message.startsWith("Cadastre") ? "form-error" : "form-success"}><Check size={13} /> {message}</p>}
    <section className="metrics"><div className="metric-card"><div className="metric-top"><span>Saldo bancário</span><span className="metric-icon"><Landmark size={15} /></span></div><div className={`metric-value ${bankBalance < 0 ? "negative" : ""}`}>{brl(bankBalance)}</div><div className="metric-foot">Saldo atual após movimentações</div></div><div className="metric-card"><div className="metric-top"><span>Recebido em {monthLabel(selectedMonth)}</span><span className="metric-icon"><ArrowUpRight size={15} /></span></div><div className="metric-value">{brl(receivedThisMonth)}</div><div className="metric-foot">{currentPayments.length} lançamento(s) em {monthLabel(selectedMonth)}</div></div><div className="metric-card"><div className="metric-top"><span>Em aberto</span><span className="metric-icon"><CalendarClock size={15} /></span></div><div className="metric-value">{missingPayments.length}</div><div className="metric-foot">{overduePayments.length} atrasado(s)</div></div><div className="metric-card"><div className="metric-top"><span>Transferências</span><span className="metric-icon"><ArrowDownRight size={15} /></span></div><div className="metric-value">{brl(distributions.reduce((sum, item) => sum + item.totalValue, 0))}</div><div className="metric-foot">Total distribuído aos membros</div></div></section>
    <div className="dashboard-grid"><section className="panel"><div className="panel-heading"><div><h2>Conta bancária</h2><p>Informe o saldo que já existe na conta antes dos novos lançamentos.</p></div><Landmark size={17} color="#80e2b0" /></div><form className="form-grid" onSubmit={saveBankAccount}><label>Saldo inicial / atual<input type="number" min="0" step="0.01" value={bankValue} onChange={(event) => setBankValue(event.target.value)} placeholder="0,00" required /></label><div className="onboarding-actions"><button className="button button-primary" type="submit" disabled={saving || role === "viewer"}><Save size={14} /> Salvar saldo</button></div></form><p className="muted">O saldo é calculado automaticamente: saldo inicial + aluguéis recebidos − despesas pagas − transferências.</p></section><section className="panel"><div className="panel-heading"><div><h2>Fechamento do mês</h2><p>Transfira aos membros conforme a participação cadastrada.</p></div><Send size={17} color="#80e2b0" /></div><form className="form-grid" onSubmit={transferToMembers}><label>Valor da transferência<input type="number" min="0.01" step="0.01" value={transferValue} onChange={(event) => setTransferValue(event.target.value)} placeholder="0,00" required /></label><label>Data<input type="date" value={transferDate} onChange={(event) => setTransferDate(event.target.value)} required /></label><label className="form-grid-wide">Descrição<input value={transferDescription} onChange={(event) => setTransferDescription(event.target.value)} /></label><div className="form-grid-wide onboarding-actions"><span className="muted">O sistema calcula a parcela de cada membro e impede deixar o saldo zerado ou negativo.</span><button className="button button-primary" type="submit" disabled={saving || role === "viewer"}><Send size={14} /> Registrar transferência</button></div></form></section></div>
    <section className="panel section-gap"><div className="panel-heading"><div><h2>Cobranças de {monthLabel(selectedMonth)}</h2><p>{missingPayments.length ? `${missingPayments.length} aluguel(is) ainda sem pagamento integral.` : "Todos os aluguéis cadastrados estão pagos no mês selecionado."}</p></div><button className="button button-ghost button-small" onClick={() => void generateMonthCharges()} disabled={saving || role === "viewer"}><CalendarClock size={13} /> Gerar cobranças do mês</button></div>{missingPayments.length ? <div className="alert-list">{missingPayments.slice(0, 8).map((lease) => { const payment = currentPayments.find((item) => item.leaseId === lease.leaseId); const state = paymentState(payment, lease); return <div className="payment-line" key={lease.leaseId}><span><strong>{lease.buildingName} · {lease.unitCode}</strong><small>{lease.tenant} · vencimento dia {lease.dueDay}</small></span><span><b className={state === "overdue" ? "negative" : "warning-text"}>{state === "overdue" ? "Atrasado" : "Pendente"}</b><small>{payment ? dateLabel(payment.dueDate) : "Cobrança não gerada"}</small></span></div>; })}</div> : <div className="empty-state" style={{ minHeight: 90 }}><Check size={24} /><p>Nenhuma cobrança pendente.</p></div>}</section>
    <section className="panel section-gap"><div className="panel-heading"><div><h2>Recebimentos registrados</h2><p>{visiblePayments.length} de {leasePayments.length} lançamentos sincronizados.</p></div><div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><input className="table-filter" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar imóvel ou inquilino" /><select className="filter-select" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">Todos os status</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><select className="filter-select" value={sort} onChange={(event) => setSort(event.target.value)}><option value="competence_desc">Competência recente</option><option value="competence_asc">Competência antiga</option><option value="tenant_asc">Inquilino A–Z</option><option value="value_desc">Maior valor</option><option value="value_asc">Menor valor</option></select></div></div>{visiblePayments.length ? <div className="table-wrap"><table><thead><tr><th>Imóvel / unidade</th><th>Inquilino</th><th>Competência</th><th>Vencimento</th><th>Recebido</th><th>Status</th><th>Ações</th></tr></thead><tbody>{visiblePayments.map((payment) => { const lease = leaseById.get(payment.leaseId); if (!lease) return null; const state = paymentState(payment, lease); return <tr key={payment.id}><td><strong>{lease.buildingName}</strong><small>{lease.unitCode}</small></td><td>{lease.tenant}</td><td>{dateLabel(payment.competence)}</td><td>{dateLabel(payment.dueDate)}</td><td><strong>{brl(payment.netAmount || payment.receivedAmount)}</strong><small>de {brl(payment.expectedAmount)}</small></td><td><span className={`status status-${state === "paid" ? "alugado" : state === "overdue" ? "vago" : "negociacao"}`}>{statusLabels[state as LeasePaymentStatus]}</span></td><td><div className="table-actions"><button className={state === "paid" ? "icon-btn positive" : "icon-btn"} onClick={() => void togglePaymentCheck(payment)} disabled={role === "viewer" || saving} aria-label={state === "paid" ? "Desmarcar pagamento" : "Confirmar pagamento"}><Check size={14} /></button><button className="icon-btn" onClick={() => { setEditingPayment(payment); setPaymentForm({ leaseId: payment.leaseId, competence: payment.competence, dueDate: payment.dueDate, expectedAmount: String(payment.expectedAmount), receivedAmount: String(payment.receivedAmount), receivedAt: payment.receivedAt ?? "", status: payment.status, notes: payment.notes ?? "" }); }} disabled={role === "viewer"} aria-label="Editar aluguel"><Edit3 size={14} /></button><button className="icon-btn" onClick={() => void removePayment(payment)} disabled={role === "viewer" || (role !== "owner" && role !== "admin")} aria-label="Excluir aluguel"><Trash2 size={14} /></button></div></td></tr>; })}</tbody></table></div> : <div className="empty-state"><CircleDollarSign size={28} /><h3>Nenhum recebimento registrado</h3><p>Gere as cobranças do mês e registre os pagamentos recebidos.</p></div>}</section>
    {editingPayment !== null || paymentForm.leaseId ? <div className="modal-backdrop"><form className="edit-modal" onSubmit={savePayment}><div className="panel-heading"><div><h2>{editingPayment ? "Editar aluguel" : "Registrar aluguel"}</h2><p>Todo recebimento fica vinculado a um imóvel, unidade e inquilino.</p></div><button type="button" className="icon-btn" onClick={() => { setEditingPayment(null); setPaymentForm(blankPayment()); }} aria-label="Fechar"><X size={16} /></button></div><div className="form-grid"><label className="form-grid-wide">Imóvel e unidade<select value={paymentForm.leaseId} onChange={(event) => selectLease(event.target.value)} required><option value="">Selecione uma unidade alugada</option>{leases.map((lease) => <option key={lease.leaseId} value={lease.leaseId}>{lease.buildingName} · {lease.unitCode} · {lease.tenant}</option>)}</select></label><label>Competência<input type="date" value={paymentForm.competence} onChange={(event) => { const value = event.target.value; const lease = leaseById.get(paymentForm.leaseId); setPaymentForm((current) => ({ ...current, competence: value, dueDate: lease ? dueDateFor(value, lease.dueDay) : current.dueDate })); }} required /></label><label>Data de vencimento<input type="date" value={paymentForm.dueDate} onChange={(event) => setPaymentForm((current) => ({ ...current, dueDate: event.target.value }))} required /></label><label>Valor esperado<input type="number" min="0" step="0.01" value={paymentForm.expectedAmount} onChange={(event) => setPaymentForm((current) => ({ ...current, expectedAmount: event.target.value }))} required /></label><label>Valor recebido<input type="number" min="0" step="0.01" value={paymentForm.receivedAmount} onChange={(event) => setPaymentForm((current) => ({ ...current, receivedAmount: event.target.value }))} /></label><label>Data do pagamento<input type="date" value={paymentForm.receivedAt} onChange={(event) => setPaymentForm((current) => ({ ...current, receivedAt: event.target.value }))} /></label><label>Status<select value={paymentForm.status} onChange={(event) => setPaymentForm((current) => ({ ...current, status: event.target.value as LeasePaymentStatus }))}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="form-grid-wide">Observações<textarea rows={3} value={paymentForm.notes} onChange={(event) => setPaymentForm((current) => ({ ...current, notes: event.target.value }))} /></label></div><div className="onboarding-actions"><button type="button" className="button button-ghost" onClick={() => { setEditingPayment(null); setPaymentForm(blankPayment()); }}>Cancelar</button><button type="submit" className="button button-primary" disabled={saving}><Save size={14} /> {saving ? "Salvando…" : "Salvar recebimento"}</button></div></form></div> : null}
  </div>;
}

