"use client";

import Link from "next/link";
import { Building2, CalendarDays, Check, CheckCircle2, ChevronLeft, ChevronRight, Clock3, MapPin, Tag, UserRound, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import { buildingPath } from "@/lib/building-path";
import { brl } from "@/lib/format";
import { currentMonthKey, monthLabel, shiftMonth } from "@/lib/month";
import { captureDeviceLocation } from "@/lib/geolocation";
import { formatVisitAddress, reverseGeocodeLocation } from "@/lib/reverse-geocode";
import type { Building, PropertyUnit } from "@/types/domain";

function isRented(unit: PropertyUnit) { return unit.status === "alugado" || unit.status === "venda_alugado" || Boolean(unit.lease); }
function isForSale(building: Building) { return building.status === "venda" || (building.unitsData ?? []).some((unit) => unit.status === "venda" || unit.status === "venda_alugado"); }

export function EmployeeDashboard({ buildings, organizationId, userName, refresh }: { buildings: Building[]; organizationId: string; userName: string; refresh: () => Promise<void> }) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(currentMonthKey);
  const [paidLeaseIds, setPaidLeaseIds] = useState<Set<string>>(new Set());
  const [recentVisits, setRecentVisits] = useState<Array<{ id: string; building_id: string; unit_id?: string | null; visited_at: string; latitude?: number | null; longitude?: number | null; street?: string | null; neighborhood?: string | null; postal_code?: string | null }>>([]);
  useEffect(() => {
    const supabase = createSupabaseBrowserClient(); if (!supabase) return;
    supabase.from("property_visits").select("id, building_id, unit_id, visited_at, latitude, longitude, street, neighborhood, postal_code").eq("organization_id", organizationId).order("visited_at", { ascending: false }).limit(6).then(({ data }) => setRecentVisits((data ?? []) as typeof recentVisits));
  }, [organizationId]);
  useEffect(() => {
    const supabase = createSupabaseBrowserClient(); if (!supabase) return;
    supabase.from("lease_payments").select("lease_id, status, received_amount, expected_amount").eq("organization_id", organizationId).eq("competence", `${selectedMonth}-01`).then(({ data }) => setPaidLeaseIds(new Set((data ?? []).filter((row) => row.status === "paid" || Number(row.received_amount ?? 0) >= Number(row.expected_amount ?? 0)).map((row) => String(row.lease_id)))));
  }, [organizationId, selectedMonth]);
  const active = buildings.filter((building) => building.status !== "vendido");
  const units = active.flatMap((building) => (building.unitsData ?? []).map((unit) => ({ building, unit })));
  const rented = units.filter(({ unit }) => isRented(unit));
  const available = units.filter(({ unit }) => !isRented(unit) && unit.status !== "venda" && unit.status !== "vendido");
  const forSale = units.filter(({ building, unit }) => isForSale(building) && (unit.status === "venda" || unit.status === "venda_alugado"));
  const openPayments = rented.filter(({ unit }) => !unit.lease?.id || !paidLeaseIds.has(unit.lease.id));
  async function togglePayment(unit: PropertyUnit, paid: boolean) {
    if (!unit.lease?.id) return;
    const supabase = createSupabaseBrowserClient(); if (!supabase) return;
    setBusy(`payment:${unit.id}`); setMessage("");
    const now = new Date();
    const result = await supabase.rpc("toggle_lease_payment", { target_org: organizationId, target_lease: unit.lease.id, target_competence: `${selectedMonth}-01`, mark_paid: paid });
    setMessage(result.error ? (result.error.message === "payment_already_exists" ? `Este aluguel já foi confirmado para ${monthLabel(selectedMonth)}.` : `Não foi possível atualizar o pagamento${result.error.message ? `: ${result.error.message}` : "."}`) : (paid ? `Pagamento de ${monthLabel(selectedMonth)} confirmado em ${now.toLocaleDateString("pt-BR")}. Crédito criado.` : `Pagamento de ${monthLabel(selectedMonth)} desmarcado em ${now.toLocaleDateString("pt-BR")}. Crédito desfeito.`));
    if (!result.error) { setPaidLeaseIds((current) => { const next = new Set(current); if (paid) next.add(unit.lease!.id); else next.delete(unit.lease!.id); return next; }); await refresh(); }
    setBusy(null);
  }
  async function markVisited(building: Building) {
    if (!building.dbId) return;
    const supabase = createSupabaseBrowserClient(); if (!supabase) return;
    setBusy(`visit:${building.id}`); setMessage("");
    const location = await captureDeviceLocation();
    const address = location ? await reverseGeocodeLocation(location) : null;
    const result = await supabase.rpc("record_property_visit", { target_org: organizationId, target_building: building.dbId, target_unit: null, visit_latitude: location?.latitude ?? null, visit_longitude: location?.longitude ?? null, visit_street: address?.street ?? null, visit_neighborhood: address?.neighborhood ?? null, visit_postal_code: address?.postalCode ?? null, visit_notes: "Visita registrada no painel operacional" });
    const addressLabel = address ? formatVisitAddress(address) : "";
    setMessage(result.error ? "Não foi possível registrar a visita." : `Visita de ${building.name} registrada${addressLabel ? ` · ${addressLabel}.` : location ? " com localização; endereço não identificado." : ". Localização não disponível neste dispositivo."}`);
    if (!result.error) {
      const visits = await supabase.from("property_visits").select("id, building_id, unit_id, visited_at, latitude, longitude, street, neighborhood, postal_code").eq("organization_id", organizationId).order("visited_at", { ascending: false }).limit(6);
      setRecentVisits((visits.data ?? []) as typeof recentVisits);
    }
    setBusy(null);
  }
  return <div className="content"><div className="page-heading"><div><div className="eyebrow"><Building2 size={13} /> Painel operacional</div><h1>Olá, {userName}!</h1><p className="subtitle">Acompanhe ocupação, pagamentos e visitas dos imóveis sob sua responsabilidade.</p></div><div className="page-heading-actions"><div className="month-navigator"><button type="button" className="icon-btn" onClick={() => setSelectedMonth((value) => shiftMonth(value, -1))} aria-label="Mês anterior"><ChevronLeft size={16} /></button><CalendarDays size={15} /><strong>{monthLabel(selectedMonth)}</strong><button type="button" className="icon-btn" onClick={() => setSelectedMonth((value) => shiftMonth(value, 1))} aria-label="Próximo mês"><ChevronRight size={16} /></button></div><span className="tag">Funcionária</span></div></div>
    {message && <p className={message.startsWith("Não") ? "form-error" : "form-success"}><CheckCircle2 size={13} /> {message}</p>}
    <section className="metrics"><Metric label="Imóveis ocupados" value={String(rented.length)} icon={<UserRound size={15} />} /><Metric label="Imóveis disponíveis" value={String(available.length)} icon={<Building2 size={15} />} /><Metric label="À venda" value={String(forSale.length)} icon={<Tag size={15} />} /><Metric label="Pagamentos pendentes" value={String(openPayments.length)} icon={<Clock3 size={15} />} /></section>
    <section className="dashboard-grid"><div className="panel"><div className="panel-heading"><div><h2>Pagamentos de {monthLabel(selectedMonth)}</h2><p>Confirme cada aluguel uma única vez por competência. A data da confirmação fica registrada.</p></div><Check size={17} color="#80e2b0" /></div>{rented.length ? <div className="employee-payment-list">{rented.map(({ building, unit }) => { const paid = Boolean(unit.lease?.id && paidLeaseIds.has(unit.lease.id)); return <div className="payment-line" key={unit.id}><span><strong>{building.name} · {unit.code}</strong><small>{unit.tenantName ?? unit.lease?.tenantName ?? "Inquilino não informado"}</small></span><strong className={`payment-value ${paid ? "payment-value-paid" : "payment-value-pending"}`}>{brl(unit.rent)}</strong><button type="button" className={paid ? "button button-ghost button-small" : "button button-primary button-small"} disabled={busy === `payment:${unit.id}`} onClick={() => void togglePayment(unit, !paid)}>{paid ? <><Check size={13} /> Pago · desfazer</> : <><X size={13} /> Marcar pago</>}</button></div>; })}</div> : <div className="empty-state"><p>Nenhum contrato ativo encontrado.</p></div>}</div><div className="panel"><div className="panel-heading"><div><h2>Visitas aos imóveis</h2><p>Registre presença com data, hora e endereço aproximado.</p></div><MapPin size={17} color="#80e2b0" /></div>{active.length ? <div className="employee-visit-list">{active.map((building) => <div className="payment-line" key={building.id}><span><strong>{building.name}</strong><small>{building.city}{building.state ? ` · ${building.state}` : ""}</small></span><button type="button" className="button button-ghost button-small" disabled={busy === `visit:${building.id}`} onClick={() => void markVisited(building)}><MapPin size={13} /> {busy === `visit:${building.id}` ? "Registrando…" : "Visitado"}</button></div>)}</div> : <div className="empty-state"><p>Nenhum imóvel cadastrado.</p></div>}{recentVisits.length > 0 && <div className="activity-list" style={{ marginTop: 16 }}>{recentVisits.map((visit) => { const building = buildings.find((item) => item.dbId === visit.building_id); const unit = building?.unitsData?.find((item) => item.id === visit.unit_id); const address = formatVisitAddress({ street: visit.street ?? undefined, neighborhood: visit.neighborhood ?? undefined, postalCode: visit.postal_code ?? undefined }); return <div className="activity-item" key={visit.id}><strong>{building?.name ?? "Imóvel"}{unit ? ` · ${unit.code}` : ""}</strong><small>{new Date(visit.visited_at).toLocaleString("pt-BR")} · {address || (visit.latitude != null && visit.longitude != null ? "endereço não identificado" : "localização não disponível")}</small></div>; })}</div>}</div></section>
    <section className="panel section-gap"><div className="panel-heading"><div><h2>Imóveis para acompanhamento</h2><p>Abra um imóvel para atualizar aluguel, situação, inquilino, fotos e contratos.</p></div></div><div className="building-list">{active.map((building) => <Link href={buildingPath(building)} className="building-row" key={building.id}><div className="building-thumb"><Building2 size={19} /></div><div className="building-info"><strong>{building.name}</strong><small>{building.city}{building.state ? ` · ${building.state}` : ""}</small><div style={{ display: "flex", gap: 7, marginTop: 8, flexWrap: "wrap" }}><span className="tag">{(building.unitsData ?? []).filter(isRented).length} ocupadas</span><span className="tag">{(building.unitsData ?? []).filter((unit) => !isRented(unit)).length} livres</span>{isForSale(building) && <span className="tag sale-tag">À venda</span>}</div></div></Link>)}</div></section>
  </div>;
}
function Metric({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) { return <div className="metric-card"><div className="metric-top"><span>{label}</span><span className="metric-icon">{icon}</span></div><div className="metric-value">{value}</div><div className="metric-foot">Acompanhamento operacional</div></div>; }

