"use client";

import Link from "next/link";
import { ArrowUpRight, CalendarDays, ChevronLeft, ChevronRight, CircleDollarSign, Landmark, Receipt, Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { usePortfolio } from "@/components/portfolio-provider";
import { brl } from "@/lib/format";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import { currentMonthKey, isRentalMonthAvailable, unitRentActiveInMonth, monthLabel, shiftMonth } from "@/lib/month";
import { unitsMonthlyRent } from "@/lib/rent";

type FinancialHistoryRow = { id: string; event_type: "credit" | "debit"; amount: number; description: string; occurred_at: string; source_payment_id?: string | null };

export default function FinanceiroPage() {
  const { buildings, loading, organizationId, bankAccount, bankBalance, expenses, leasePayments, refresh, role } = usePortfolio();
  const units = buildings.filter((building) => building.status !== "vendido").flatMap((building) => (building.unitsData ?? []).map((unit) => ({ ...unit, building })));
  const rentalUnits = units.filter((unit) => unit.rent > 0);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("name_asc");
  const [history, setHistory] = useState<FinancialHistoryRow[]>([]);
  const [selectedMonth, setSelectedMonth] = useState(currentMonthKey);
  const [bankValue, setBankValue] = useState("");
  const [savingBank, setSavingBank] = useState(false);
  const [bankMessage, setBankMessage] = useState("");
  const canEditBank = role === "owner" || role === "admin" || role === "manager";
  useEffect(() => {
    if (!organizationId) return;
    const supabase = createSupabaseBrowserClient(); if (!supabase) return;
    supabase.from("financial_history").select("id, event_type, amount, description, occurred_at, source_payment_id").eq("organization_id", organizationId).order("occurred_at", { ascending: false }).limit(100).then(({ data }) => setHistory((data ?? []) as FinancialHistoryRow[]));
  }, [organizationId]);
  useEffect(() => {
    setBankValue(String(bankBalance));
  }, [bankBalance]);
  const rentalMonthAvailable = isRentalMonthAvailable(selectedMonth);
  const rentalUnitsForMonth = useMemo(() => rentalMonthAvailable ? rentalUnits.filter((unit) => unitRentActiveInMonth(unit, selectedMonth)) : [], [rentalMonthAvailable, rentalUnits, selectedMonth]);
  const monthlyRent = unitsMonthlyRent(rentalUnitsForMonth);
  const periodPayments = rentalMonthAvailable ? leasePayments.filter((payment) => payment.competence.startsWith(selectedMonth)) : [];
  const periodReceived = periodPayments.reduce((total, payment) => total + payment.receivedAmount, 0);
  const periodExpenses = expenses.filter((expense) => expense.expense_kind !== "one_time" || expense.expense_date?.startsWith(selectedMonth));
  const periodExpenseTotal = periodExpenses.reduce((total, expense) => total + Number(expense.value || 0), 0);
  const periodProfit = periodReceived - periodExpenseTotal;
  const rentedUnits = rentalUnitsForMonth.reduce((total, unit) => total + (unit.quantity ?? 1), 0);
  const visibleRentalUnits = useMemo(() => rentalUnitsForMonth.filter((unit) => `${unit.code} ${unit.building.name} ${unit.building.city} ${unit.building.state}`.toLowerCase().includes(query.toLowerCase())).sort((left, right) => sort === "value_desc" ? right.rent - left.rent : sort === "value_asc" ? left.rent - right.rent : sort === "location_asc" ? `${left.building.city} ${left.building.state}`.localeCompare(`${right.building.city} ${right.building.state}`, "pt-BR") : sort === "status_asc" ? left.status.localeCompare(right.status, "pt-BR") : `${left.building.name} ${left.code}`.localeCompare(`${right.building.name} ${right.code}`)), [rentalUnitsForMonth, query, sort]);
  async function saveBankBalance(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!organizationId || !canEditBank) { setBankMessage("Seu perfil não pode alterar o saldo bancário."); return; }
    const requestedBalance = Number(bankValue.replace(",", "."));
    if (!Number.isFinite(requestedBalance)) { setBankMessage("Informe um saldo bancário válido."); return; }
    const supabase = createSupabaseBrowserClient(); if (!supabase) return;
    const registeredMovements = bankBalance - (bankAccount?.initialBalance ?? 0);
    const initialBalance = requestedBalance - registeredMovements;
    setSavingBank(true); setBankMessage("");
    const result = bankAccount
      ? await supabase.from("bank_accounts").update({ initial_balance: initialBalance }).eq("id", bankAccount.id).eq("organization_id", organizationId)
      : await supabase.from("bank_accounts").insert({ organization_id: organizationId, name: "Conta principal", initial_balance: initialBalance });
    if (result.error) setBankMessage(`Não foi possível atualizar o saldo: ${result.error.message}`);
    else { setBankMessage(`Saldo bancário atualizado para ${brl(requestedBalance)}.`); await refresh(); }
    setSavingBank(false);
  }
  if (loading) return <div className="content"><div className="empty-state"><p>Carregando financeiro...</p></div></div>;
  if (!organizationId) return <div className="content"><div className="empty-state"><h3>Nenhuma organização selecionada</h3><p>Entre em uma holding para visualizar as receitas.</p></div></div>;
  return <div className="content"><div className="page-heading"><div><div className="eyebrow"><CircleDollarSign size={13} /> Fluxo financeiro</div><h1>Financeiro</h1><p className="subtitle">Receitas exclusivamente dos aluguéis informados nos imóveis. Período: {monthLabel(selectedMonth)} · recebido: {brl(periodReceived)}.</p></div><div className="page-heading-actions"><div className="month-navigator"><button type="button" className="icon-btn" onClick={() => setSelectedMonth((value) => shiftMonth(value, -1))} aria-label="Mês anterior"><ChevronLeft size={16} /></button><CalendarDays size={15} /><strong>{monthLabel(selectedMonth)}</strong><button type="button" className="icon-btn" onClick={() => setSelectedMonth((value) => shiftMonth(value, 1))} aria-label="Próximo mês"><ChevronRight size={16} /></button></div><Link href="/alugueis" className="button button-primary"><ArrowUpRight size={14} /> Registrar aluguéis</Link><Link href="/despesas" className="button button-ghost"><Receipt size={14} /> Gerenciar despesas</Link></div></div>
    <div className="metrics"><div className="metric-card"><div className="metric-top"><span>Aluguéis mensais</span><span className="metric-icon"><ArrowUpRight size={15} /></span></div><div className="metric-value">{brl(monthlyRent)}</div><div className="metric-foot positive">{rentedUnits} unidades com aluguel</div></div><div className="metric-card"><div className="metric-top"><span>Despesas mensais</span><span className="metric-icon"><Receipt size={15} /></span></div><div className="metric-value">{brl(periodExpenseTotal)}</div><div className="metric-foot">Detalhes na aba Despesas</div></div><div className="metric-card"><div className="metric-top"><span>Saldo mensal</span><span className="metric-icon">R$</span></div><div className={`metric-value ${periodProfit < 0 ? "negative" : ""}`}>{brl(periodProfit)}</div><div className="metric-foot">Receitas − despesas</div></div><div className="metric-card"><div className="metric-top"><span>Saldo bancário</span><span className="metric-icon">R$</span></div><div className={`metric-value ${bankBalance < 0 ? "negative" : ""}`}>{brl(bankBalance)}</div><div className="metric-foot">Conta da holding</div></div></div>
    <div className="panel section-gap"><div className="panel-heading"><div><h2>Saldo da conta da holding</h2><p>Informe o saldo atual real da conta. Os lançamentos registrados continuam preservados no histórico.</p></div><Landmark size={17} color="#80e2b0" /></div><form className="form-grid" onSubmit={saveBankBalance}><label>Saldo bancário atual<input type="number" step="0.01" value={bankValue} onChange={(event) => setBankValue(event.target.value)} placeholder="0,00" required disabled={!canEditBank} /></label><div className="onboarding-actions"><button className="button button-primary" type="submit" disabled={savingBank || !canEditBank}><Save size={14} /> {savingBank ? "Salvando..." : "Atualizar saldo"}</button></div></form>{bankMessage ? <p className="muted" style={{ marginTop: 12 }}>{bankMessage}</p> : null}</div>
    <div className="panel"><div className="panel-heading"><div><h2>Receitas dos imóveis</h2><p>{visibleRentalUnits.length} de {rentalUnitsForMonth.length} registros · competência de {monthLabel(selectedMonth)}</p></div><div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><input className="table-filter" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar imóvel ou local" /><select className="filter-select" value={sort} onChange={(event) => setSort(event.target.value)}><option value="name_asc">Imóvel A–Z</option><option value="value_desc">Maior valor</option><option value="value_asc">Menor valor</option><option value="location_asc">Local A–Z</option><option value="status_asc">Status A–Z</option></select></div></div>{visibleRentalUnits.length ? <div className="table-wrap"><table><thead><tr><th>Imóvel / unidade</th><th>Localidade</th><th>Status</th><th>Valor mensal</th></tr></thead><tbody>{visibleRentalUnits.map((unit) => <tr key={unit.id}><td><strong>{unit.code}</strong><small>{unit.building.name}</small></td><td>{unit.building.city} · {unit.building.state || "—"}</td><td><span className="status status-alugado">Alugado</span></td><td className="positive"><strong>{brl(unit.rent)}</strong></td></tr>)}</tbody></table></div> : <div className="empty-state"><Receipt size={28} /><h3>Nenhuma receita encontrada</h3><p>Ajuste o filtro para visualizar outros registros.</p></div>}</div>
    <div className="panel section-gap"><div className="panel-heading"><div><h2>Histórico financeiro</h2><p>Confirmações de aluguel entram como crédito; quando desfeitas, ficam registradas como saída.</p></div></div>{history.filter((entry) => !entry.source_payment_id || entry.occurred_at >= "2026-08-01T00:00:00").length ? <div className="table-wrap"><table><thead><tr><th>Evento</th><th>Descrição</th><th>Data</th><th>Valor</th></tr></thead><tbody>{history.filter((entry) => !entry.source_payment_id || entry.occurred_at >= "2026-08-01T00:00:00").map((entry) => <tr key={entry.id}><td><span className={`status ${entry.event_type === "credit" ? "status-alugado" : "status-vago"}`}>{entry.event_type === "credit" ? "Crédito" : "Saída"}</span></td><td>{entry.description}</td><td>{new Date(entry.occurred_at).toLocaleString("pt-BR")}</td><td className={entry.event_type === "credit" ? "positive" : "negative"}><strong>{entry.event_type === "credit" ? "+" : "−"} {brl(Number(entry.amount || 0))}</strong></td></tr>)}</tbody></table></div> : <div className="empty-state" style={{ minHeight: 120 }}><p>Nenhum evento financeiro automático registrado.</p></div>}</div>
  </div>;
}

