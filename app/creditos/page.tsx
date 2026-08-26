"use client";

import { ArrowUpRight, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, CircleDollarSign } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePortfolio } from "@/components/portfolio-provider";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import { brl } from "@/lib/format";
import { currentMonthKey, monthLabel, shiftMonth } from "@/lib/month";

type Credit = { id: string; value: number; revenue_date: string; competence: string; description: string; origin?: string | null; source_payment_id?: string | null; source_sale_id?: string | null; beneficiary_user_id?: string | null; beneficiary_contact_id?: string | null };
type Beneficiary = { member_id: string; user_id?: string | null; contact_id?: string | null; full_name: string; email?: string | null };
export default function CreditosPage() {
  const { organizationId, role, loading } = usePortfolio();
  const [credits, setCredits] = useState<Credit[]>([]);
  const [beneficiaries, setBeneficiaries] = useState<Beneficiary[]>([]);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ value: "", description: "", beneficiary: "" });
  const [message, setMessage] = useState("");
  const [selectedMonth, setSelectedMonth] = useState(currentMonthKey);
  const canManage = role === "owner" || role === "admin" || role === "manager";
  const loadCredits = useCallback(async () => {
    if (!organizationId || role === "viewer" || role === "employee") return;
    const supabase = createSupabaseBrowserClient(); if (!supabase) return;
    const result = await supabase.from("revenues").select("id, value, revenue_date, competence, description, origin, source_payment_id, source_sale_id, beneficiary_user_id, beneficiary_contact_id").eq("organization_id", organizationId).order("revenue_date", { ascending: false });
    if (result.error) setMessage("Não foi possível carregar os créditos."); else setCredits((result.data ?? []) as Credit[]);
  }, [organizationId, role]);
  useEffect(() => { void loadCredits(); }, [loadCredits]);
  useEffect(() => {
    if (!organizationId || !canManage) return;
    const supabase = createSupabaseBrowserClient(); if (!supabase) return;
    supabase.rpc("list_organization_members", { target_org: organizationId }).then(({ data }) => setBeneficiaries((data ?? []) as Beneficiary[]));
  }, [organizationId, canManage]);
  async function createCredit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!organizationId || !form.value || !form.description.trim() || !form.beneficiary) { setMessage("Informe valor, descrição e beneficiário."); return; }
    const value = Number(form.value.replace(",", "."));
    if (!Number.isFinite(value) || value <= 0) { setMessage("Informe um valor válido para o crédito."); return; }
    const person = beneficiaries.find((item) => item.member_id === form.beneficiary);
    if (!person) { setMessage("Selecione um beneficiário válido."); return; }
    const supabase = createSupabaseBrowserClient(); if (!supabase) return;
    setSaving(true); setMessage("");
    const result = await supabase.rpc("create_individual_credit", { target_org: organizationId, target_value: value, target_competence: `${selectedMonth}-01`, target_description: form.description.trim(), target_beneficiary_user: person.user_id ?? null, target_beneficiary_contact: person.contact_id ?? null });
    if (result.error) setMessage(result.error.message === "beneficiary_not_found" ? "Beneficiário não encontrado nesta holding." : "Não foi possível criar o crédito individual.");
    else { setForm({ value: "", description: "", beneficiary: "" }); setCreating(false); setMessage("Crédito individual criado e incluído no saldo da holding."); await loadCredits(); }
    setSaving(false);
  }
  const visibleCredits = useMemo(() => credits.filter((credit) => !credit.competence || credit.competence.startsWith(selectedMonth)), [credits, selectedMonth]);
  const total = useMemo(() => visibleCredits.reduce((sum, credit) => sum + Number(credit.value || 0), 0), [visibleCredits]);
  if (loading) return <div className="content"><div className="empty-state"><p>Carregando créditos...</p></div></div>;
  if (!organizationId) return <div className="content"><div className="empty-state"><CircleDollarSign size={28} /><h3>Nenhuma holding selecionada</h3></div></div>;
 return <div className="content"><div className="page-heading"><div><div className="eyebrow"><ArrowUpRight size={13} /> Entradas confirmadas</div><h1>Créditos</h1><p className="subtitle">Cada confirmação de aluguel cria automaticamente um crédito nesta lista. Você também pode lançar benefícios individuais.</p></div><div className="page-heading-actions"><div className="month-navigator"><button type="button" className="icon-btn" onClick={() => setSelectedMonth((value) => shiftMonth(value, -1))} aria-label="Mês anterior"><ChevronLeft size={16} /></button><CalendarDays size={15} /><strong>{monthLabel(selectedMonth)}</strong><button type="button" className="icon-btn" onClick={() => setSelectedMonth((value) => shiftMonth(value, 1))} aria-label="Próximo mês"><ChevronRight size={16} /></button></div>{canManage && <button type="button" className="button button-primary" onClick={() => { setCreating(true); setMessage(""); }}><ArrowUpRight size={14} /> Crédito individual</button>}</div></div>{message && <p className={message.includes("não") || message.includes("Não") || message.includes("Informe") ? "form-error" : "form-success"}><CheckCircle2 size={13} /> {message}</p>}{creating && <div className="panel"><form onSubmit={createCredit}><div className="panel-heading"><div><h2>Novo crédito individual</h2><p>Competência: {monthLabel(selectedMonth)} · o valor entra no saldo da holding.</p></div><button type="button" className="icon-btn" onClick={() => setCreating(false)} aria-label="Fechar">×</button></div><div className="form-grid"><label>Beneficiário<select value={form.beneficiary} onChange={(event) => setForm((current) => ({ ...current, beneficiary: event.target.value }))}><option value="">Selecione uma pessoa</option>{beneficiaries.map((person) => <option value={person.member_id} key={person.member_id}>{person.full_name}{person.email ? ` · ${person.email}` : ""}</option>)}</select></label><label>Valor<input type="number" min="0.01" step="0.01" value={form.value} onChange={(event) => setForm((current) => ({ ...current, value: event.target.value }))} placeholder="0,00" /></label><label style={{ gridColumn: "1 / -1" }}>Descrição<input value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} placeholder="Ex.: benefício individual, reembolso ou bonificação" /></label></div><div className="onboarding-actions"><button type="button" className="button button-ghost" onClick={() => setCreating(false)}>Cancelar</button><button type="submit" className="button button-primary" disabled={saving}>{saving ? "Salvando…" : "Criar crédito"}</button></div></form></div>}<div className="metrics"><div className="metric-card"><div className="metric-top"><span>Créditos em {monthLabel(selectedMonth)}</span><span className="metric-icon"><ArrowUpRight size={15} /></span></div><div className="metric-value">{visibleCredits.length}</div><div className="metric-foot">Lançamentos de entrada</div></div><div className="metric-card"><div className="metric-top"><span>Total creditado</span><span className="metric-icon">R$</span></div><div className="metric-value">{brl(total)}</div><div className="metric-foot">Valores confirmados</div></div></div><div className="panel"><div className="panel-heading"><div><h2>Créditos de {monthLabel(selectedMonth)}</h2><p>Ao desmarcar um pagamento, o crédito correspondente é removido.</p></div></div>{visibleCredits.length ? <div className="table-wrap"><table><thead><tr><th>Descrição</th><th>Beneficiário</th><th>Competência</th><th>Data</th><th>Origem</th><th>Valor</th></tr></thead><tbody>{visibleCredits.map((credit) => { const person = beneficiaries.find((item) => item.user_id === credit.beneficiary_user_id || item.contact_id === credit.beneficiary_contact_id); return <tr key={credit.id}><td><strong>{credit.description}</strong>{credit.source_payment_id && <small>Pagamento confirmado</small>}{credit.source_sale_id && <small>Venda confirmada</small>}</td><td>{person?.full_name ?? (credit.origin === "individual_benefit" ? "Beneficiário individual" : "—")}</td><td>{credit.competence ? new Date(`${credit.competence}T12:00:00`).toLocaleDateString("pt-BR") : "—"}</td><td>{credit.revenue_date ? new Date(`${credit.revenue_date}T12:00:00`).toLocaleDateString("pt-BR") : "—"}</td><td>{credit.origin === "lease_payment" ? "Aluguel" : credit.origin === "property_sale" ? "Venda de imóvel" : credit.origin === "individual_benefit" ? "Benefício individual" : credit.origin || "Manual"}</td><td className="positive"><strong>{brl(Number(credit.value || 0))}</strong></td></tr>; })}</tbody></table></div> : <div className="empty-state"><CircleDollarSign size={28} /><h3>Nenhum crédito registrado</h3><p>Confirme um pagamento na aba Aluguéis ou crie um crédito individual para começar.</p></div>}</div></div>;
}

