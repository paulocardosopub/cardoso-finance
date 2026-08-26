"use client";

import Link from "next/link";
import { ArrowLeft, Building2, CalendarDays, Check, CheckCircle2, ChevronLeft, ChevronRight, FileUp, Image as ImageIcon, MapPin, Paperclip, Save, Star, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import { usePortfolio } from "@/components/portfolio-provider";
import { brl } from "@/lib/format";
import { currentMonthKey, monthLabel, shiftMonth } from "@/lib/month";
import type { Building, PropertyUnit, UnitStatus } from "@/types/domain";

const labels: Record<string, string> = { alugado: "Alugado", vago: "Vago", venda: "À venda", venda_alugado: "À venda e alugado", manutencao: "Manutenção", servico: "Serviço", negociacao: "Negociação" };
const dbStatus: Record<UnitStatus, string> = { alugado: "rented", vago: "vacant", manutencao: "maintenance", servico: "service", negociacao: "negotiation", venda: "for_sale", venda_alugado: "for_sale", vendido: "sold" };
type DocumentRow = { id: string; name: string; category: string; storage_path: string; mime_type?: string; is_primary?: boolean; signedUrl?: string };
type PaymentRow = { lease_id: string; status?: string | null; received_amount?: number | null; expected_amount?: number | null; received_at?: string | null };

export function EmployeeBuildingClient({ building }: { building: Building }) {
  const { organizationId, refresh } = usePortfolio();
  const [editing, setEditing] = useState<PropertyUnit | null>(null);
  const [filesUnit, setFilesUnit] = useState<PropertyUnit | null>(null);
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [primaryPhotos, setPrimaryPhotos] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [visitTimes, setVisitTimes] = useState<Record<string, string>>({});
  const [visitTick, setVisitTick] = useState(0);
  const [quickEdit, setQuickEdit] = useState<{ unitId: string; field: "tenant" | "rent" } | null>(null);
  const [quickValue, setQuickValue] = useState("");
  const [selectedMonth, setSelectedMonth] = useState(currentMonthKey);
  const [payments, setPayments] = useState<PaymentRow[]>([]);

  useEffect(() => {
    if (!organizationId || !building.dbId) return;
    const supabase = createSupabaseBrowserClient(); if (!supabase) return;
    supabase.from("property_visits").select("unit_id, visited_at").eq("organization_id", organizationId).eq("building_id", building.dbId).order("visited_at", { ascending: false }).then(({ data }) => {
      const next: Record<string, string> = {};
      for (const row of (data ?? []) as Array<{ unit_id?: string | null; visited_at: string }>) {
        const key = row.unit_id ? String(row.unit_id) : "__building__";
        if (!next[key]) next[key] = row.visited_at;
      }
      setVisitTimes(next);
    });
  }, [building.dbId, organizationId]);

  useEffect(() => {
    if (!organizationId) return;
    const supabase = createSupabaseBrowserClient(); if (!supabase) return;
    supabase.from("lease_payments").select("lease_id, status, received_amount, expected_amount, received_at").eq("organization_id", organizationId).eq("competence", `${selectedMonth}-01`).then(({ data }) => setPayments((data ?? []) as PaymentRow[]));
  }, [organizationId, selectedMonth]);

  useEffect(() => {
    const timer = window.setInterval(() => setVisitTick((value) => value + 1), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  async function loadDocuments(unitId?: string) {
    if (!organizationId) return;
    const supabase = createSupabaseBrowserClient(); if (!supabase) return;
    const result = await supabase.rpc("list_employee_documents", { target_org: organizationId });
    if (result.error) { setMessage("Não foi possível carregar os arquivos."); return; }
    const rows = (result.data ?? []) as DocumentRow[];
    const selected = unitId ? rows.filter((row) => String((row as DocumentRow & { unit_id?: string }).unit_id) === unitId) : rows;
    const withLinks = await Promise.all(selected.map(async (row) => ({ ...row, signedUrl: (await supabase.storage.from("organization-documents").createSignedUrl(row.storage_path, 3600)).data?.signedUrl })));
    setDocuments(withLinks);
    if (!unitId) {
      const entries = await Promise.all(rows.filter((row) => row.category === "photo" && row.is_primary).map(async (row) => ({ unitId: String((row as DocumentRow & { unit_id?: string }).unit_id), url: (await supabase.storage.from("organization-documents").createSignedUrl(row.storage_path, 3600)).data?.signedUrl })));
      setPrimaryPhotos(Object.fromEntries(entries.filter((entry) => entry.unitId && entry.url).map((entry) => [entry.unitId, entry.url as string])));
    }
  }
  useEffect(() => { void loadDocuments(); }, [organizationId, building.id]);

  const units = (building.unitsData ?? []).filter((unit) => `${unit.code} ${unit.type} ${unit.tenantName ?? ""}`.toLowerCase().includes(query.toLowerCase()));
  const occupied = (building.unitsData ?? []).filter((unit) => unit.status === "alugado" || unit.status === "venda_alugado" || unit.lease).length;

  async function saveUnit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!organizationId || !editing) return;
    const form = new FormData(event.currentTarget);
    const status = String(form.get("status")) as UnitStatus;
    const rent = Number(String(form.get("rent") ?? "0").replace(",", "."));
    const supabase = createSupabaseBrowserClient(); if (!supabase) return;
    setBusy(true); setMessage("");
    const result = await supabase.rpc("update_employee_unit", { target_org: organizationId, target_unit: editing.id, unit_status: dbStatus[status] ?? "vacant", rental_value: Number.isFinite(rent) ? rent : 0, tenant_name: String(form.get("tenant") ?? "").trim(), due_day: Number(form.get("dueDay") || 10) });
    setMessage(result.error ? "Não foi possível atualizar a unidade." : "Unidade, aluguel e inquilino atualizados.");
    if (!result.error) { setEditing(null); await refresh(); }
    setBusy(false);
  }
  function startQuickEdit(unit: PropertyUnit, field: "tenant" | "rent") {
    setQuickEdit({ unitId: unit.id, field });
    setQuickValue(field === "tenant" ? (unit.tenantName ?? unit.lease?.tenantName ?? "") : String(unit.rent || ""));
  }
  function cancelQuickEdit() { setQuickEdit(null); setQuickValue(""); }
  async function saveQuickEdit(event: React.FormEvent<HTMLFormElement>, unit: PropertyUnit) {
    event.preventDefault();
    if (!organizationId || !quickEdit) return;
    const rent = quickEdit.field === "rent" ? Number(quickValue.replace(",", ".")) : Number(unit.rent || 0);
    const tenant = quickEdit.field === "tenant" ? quickValue.trim() : (unit.tenantName ?? unit.lease?.tenantName ?? "");
    if (!Number.isFinite(rent) || rent < 0) { setMessage("Informe um valor de aluguel válido."); return; }
    const supabase = createSupabaseBrowserClient(); if (!supabase) return;
    setBusy(true); setMessage("");
    const result = await supabase.rpc("update_employee_unit", { target_org: organizationId, target_unit: unit.id, unit_status: dbStatus[unit.status] ?? "vacant", rental_value: rent, tenant_name: tenant, due_day: Number(unit.lease?.dueDay ?? 10) });
    if (result.error) setMessage("Não foi possível salvar a alteração.");
    else { cancelQuickEdit(); setMessage(`${quickEdit.field === "rent" ? "Aluguel" : "Inquilino"} atualizado.`); await refresh(); }
    setBusy(false);
  }
  async function togglePayment(unit: PropertyUnit, markPaid: boolean) {
    if (!organizationId || !unit.rent) return;
    const supabase = createSupabaseBrowserClient(); if (!supabase) return;
    setBusy(true); setMessage("");
    const now = new Date();
    const competence = `${selectedMonth}-01`;
    const result = await supabase.rpc("toggle_unit_payment", { target_org: organizationId, target_unit: unit.id, target_competence: competence, mark_paid: markPaid });
    setMessage(result.error ? `Não foi possível atualizar o pagamento${result.error.message ? `: ${result.error.message}` : "."}` : (markPaid ? `Pagamento de ${monthLabel(selectedMonth)} confirmado em ${now.toLocaleDateString("pt-BR")}. Crédito criado.` : `Pagamento de ${monthLabel(selectedMonth)} desmarcado em ${now.toLocaleDateString("pt-BR")}. Crédito desfeito.`));
    if (!result.error) { setPayments((rows) => markPaid ? [...rows.filter((row) => row.lease_id !== unit.lease?.id), { lease_id: unit.lease!.id, status: "paid", received_amount: unit.rent, expected_amount: unit.rent, received_at: now.toISOString() }] : rows.filter((row) => row.lease_id !== unit.lease?.id)); await refresh(); }
    setBusy(false);
  }
  async function markVisited(unit?: PropertyUnit) {
    if (!organizationId || !building.dbId) return;
    const supabase = createSupabaseBrowserClient(); if (!supabase) return;
    setBusy(true); setMessage("");
    const position = await new Promise<GeolocationPosition | null>((resolve) => navigator.geolocation?.getCurrentPosition(resolve, () => resolve(null), { enableHighAccuracy: true, timeout: 7000 }) ?? resolve(null));
    const result = await supabase.rpc("record_property_visit", { target_org: organizationId, target_building: building.dbId, target_unit: unit?.id ?? null, visit_latitude: position?.coords.latitude ?? null, visit_longitude: position?.coords.longitude ?? null, visit_notes: unit ? `Visita registrada na unidade ${unit.code}` : "Visita registrada no imóvel" });
    if (result.error) setMessage("Não foi possível registrar a visita.");
    else {
      const key = unit?.id ?? "__building__";
      setVisitTimes((current) => ({ ...current, [key]: new Date().toISOString() }));
      setMessage(`Visita registrada${unit ? ` · ${unit.code}` : ""}. O status ficará verde por 24 horas.`);
    }
    setBusy(false);
  }
  async function openFiles(unit: PropertyUnit) {
    setFilesUnit(unit); await loadDocuments(unit.id);
  }
  async function uploadDocuments(event: React.ChangeEvent<HTMLInputElement>, category: "photo" | "contract") {
    const files = Array.from(event.target.files ?? []);
    if (!files.length || !filesUnit || !organizationId) return;
    const supabase = createSupabaseBrowserClient(); if (!supabase) return;
    setBusy(true); setMessage("");
    const user = (await supabase.auth.getUser()).data.user;
    let makePrimary = false;
    if (category === "photo") {
      const primary = await supabase.from("documents").select("id").eq("organization_id", organizationId).eq("unit_id", filesUnit.id).eq("category", "photo").eq("is_primary", true).limit(1);
      makePrimary = !primary.data?.length;
    }
    let count = 0;
    for (const file of files) {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
      const path = `${organizationId}/${filesUnit.id}/${crypto.randomUUID()}-${safeName}`;
      const upload = await supabase.storage.from("organization-documents").upload(path, file, { upsert: false, contentType: file.type || undefined });
      if (upload.error) { setMessage("Não foi possível enviar um dos arquivos."); continue; }
      const inserted = await supabase.from("documents").insert({ organization_id: organizationId, unit_id: filesUnit.id, name: file.name, category, storage_path: path, mime_type: file.type, size_bytes: file.size, uploaded_by: user?.id, is_primary: category === "photo" && makePrimary && count === 0 });
      if (!inserted.error) count += 1;
    }
    event.currentTarget.value = "";
    setMessage(count ? `${count} arquivo${count > 1 ? "s" : ""} enviado${count > 1 ? "s" : ""}.` : "Nenhum arquivo foi enviado.");
    await loadDocuments(filesUnit.id); await loadDocuments(); setBusy(false);
  }
  if (!organizationId) return null;
  const recentlyVisited = (key: string) => Boolean(visitTimes[key] && Date.now() - new Date(visitTimes[key]).getTime() < 24 * 60 * 60 * 1000 && visitTick >= 0);
  return <div className="content"><Link href="/imoveis" className="breadcrumb" style={{ marginBottom: 25, display: "inline-flex" }}><ArrowLeft size={13} /> Imóveis</Link><div className="page-heading"><div><div className="eyebrow"><Building2 size={13} /> Operação imobiliária</div><h1>{building.name}</h1><p className="subtitle"><MapPin size={12} style={{ verticalAlign: "-2px" }} /> {[building.city, building.state].filter(Boolean).join(", ")} · {building.units} unidades</p></div><div className="page-heading-actions"><div className="month-navigator"><button type="button" className="icon-btn" onClick={() => setSelectedMonth((value) => shiftMonth(value, -1))} aria-label="Mês anterior"><ChevronLeft size={16} /></button><CalendarDays size={15} /><strong>{monthLabel(selectedMonth)}</strong><button type="button" className="icon-btn" onClick={() => setSelectedMonth((value) => shiftMonth(value, 1))} aria-label="Próximo mês"><ChevronRight size={16} /></button></div><button type="button" className={recentlyVisited("__building__") ? "button button-visited" : "button button-primary"} onClick={() => void markVisited()} disabled={busy}><MapPin size={14} /> {recentlyVisited("__building__") ? "Visitado" : "Marcar Visita"}</button></div></div>{message && <p className={message.startsWith("Não") ? "form-error" : "form-success"}><CheckCircle2 size={13} /> {message}</p>}<div className="metrics"><div className="metric-card"><div className="metric-top"><span>Unidades ocupadas</span></div><div className="metric-value">{occupied}</div><div className="metric-foot">de {building.units} unidades</div></div><div className="metric-card"><div className="metric-top"><span>Unidades livres</span></div><div className="metric-value">{Math.max(0, building.units - occupied)}</div><div className="metric-foot">Para locação</div></div><div className="metric-card"><div className="metric-top"><span>Competência</span></div><div className="metric-value" style={{ fontSize: 22 }}>{monthLabel(selectedMonth)}</div><div className="metric-foot">Pagamentos exibidos neste mês</div></div></div><div className="panel"><div className="panel-heading"><div><h2>Unidades e contratos</h2><p>{units.length} unidades · pagamentos da competência de {monthLabel(selectedMonth)}.</p></div><div style={{ display: "flex", gap: 8 }}><input className="table-filter" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar unidade ou inquilino" /></div></div><div className="table-wrap"><table><thead><tr><th>Foto</th><th>Unidade</th><th>Status</th><th>Inquilino</th><th>Aluguel</th><th>Pagamento · {monthLabel(selectedMonth)}</th><th>Ações</th></tr></thead><tbody>{units.map((unit) => { const payment = unit.lease?.id ? payments.find((row) => row.lease_id === unit.lease!.id) : undefined; const paid = payment?.status === "paid" || Number(payment?.received_amount ?? 0) >= Number(payment?.expected_amount ?? unit.rent); const canPay = unit.rent > 0; return <tr key={unit.id}><td><div className="unit-photo-thumb">{primaryPhotos[unit.id] ? <img src={primaryPhotos[unit.id]} alt={`Foto ${unit.code}`} /> : <ImageIcon size={18} />}</div></td><td><strong>{unit.code}</strong><small>{unit.type}</small></td><td><span className={`status status-${unit.status === "alugado" || unit.status === "venda_alugado" ? "alugado" : unit.status}`}>{labels[unit.status]}</span></td><td>{quickEdit?.unitId === unit.id && quickEdit.field === "tenant" ? <form className="inline-edit-form" onSubmit={(event) => void saveQuickEdit(event, unit)}><input autoFocus value={quickValue} onChange={(event) => setQuickValue(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") cancelQuickEdit(); }} placeholder="Nome do inquilino" aria-label={`Inquilino ${unit.code}`} /><button type="submit" className="icon-btn positive" disabled={busy} aria-label="Salvar inquilino"><Check size={13} /></button></form> : <button type="button" className="inline-edit-value" onClick={() => startQuickEdit(unit, "tenant")} title="Clique para editar o inquilino">{unit.tenantName ?? unit.lease?.tenantName ?? "Inquilino não informado"}</button>}</td><td>{quickEdit?.unitId === unit.id && quickEdit.field === "rent" ? <form className="inline-edit-form" onSubmit={(event) => void saveQuickEdit(event, unit)}><input autoFocus type="number" min="0" step="0.01" value={quickValue} onChange={(event) => setQuickValue(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") cancelQuickEdit(); }} aria-label={`Aluguel ${unit.code}`} /><button type="submit" className="icon-btn positive" disabled={busy} aria-label="Salvar aluguel"><Check size={13} /></button></form> : <button type="button" className="inline-edit-value rent-inline-value" onClick={() => startQuickEdit(unit, "rent")} title="Clique para editar o aluguel">{unit.rent ? brl(unit.rent) : "—"}</button>}</td><td>{canPay ? <div className="payment-cell"><strong className={`payment-value ${paid ? "payment-value-paid" : "payment-value-pending"}`}>{brl(unit.rent)}</strong><small className="muted">{paid ? `Pago em ${payment?.received_at ? new Date(payment.received_at).toLocaleDateString("pt-BR") : "—"}` : `Competência ${monthLabel(selectedMonth)}`}</small><button type="button" className={paid ? "button button-ghost button-small payment-button" : "button button-primary button-small payment-button"} onClick={() => void togglePayment(unit, !paid)} disabled={busy}>{paid ? <><Check size={13} /> Desmarcar pago</> : <><Check size={13} /> Marcar pago</>}</button></div> : "—"}</td><td><button type="button" className="icon-btn" onClick={() => setEditing(unit)} aria-label={`Editar ${unit.code}`}><Save size={14} /></button><button type="button" className="icon-btn" onClick={() => void openFiles(unit)} aria-label={`Fotos e contratos de ${unit.code}`}><Paperclip size={14} /></button><button type="button" className={recentlyVisited(unit.id) ? "icon-btn visit-button visit-button-active" : "icon-btn visit-button"} onClick={() => void markVisited(unit)} disabled={busy} aria-label={`Marcar visita ${unit.code}`} title={recentlyVisited(unit.id) ? "Visitado nas últimas 24 horas" : "Marcar Visita"}>{recentlyVisited(unit.id) ? "Visitado" : <MapPin size={14} />}</button></td></tr>; })}</tbody></table></div></div>{filesUnit && <div className="modal-backdrop"><section className="edit-modal"><div className="panel-heading"><div><h2>Fotos e contratos · {filesUnit.code}</h2><p>Adicione arquivos sem excluir o histórico existente.</p></div><button type="button" className="icon-btn" onClick={() => setFilesUnit(null)} aria-label="Fechar"><X size={16} /></button></div><div className="upload-grid"><label className="upload-card"><ImageIcon size={22} /><strong>Adicionar fotos</strong><small>JPG, PNG ou WebP</small><input type="file" accept="image/*" multiple onChange={(event) => void uploadDocuments(event, "photo")} /></label><label className="upload-card"><FileUp size={22} /><strong>Adicionar contrato</strong><small>PDF ou documento</small><input type="file" accept="application/pdf,.doc,.docx,image/*" onChange={(event) => void uploadDocuments(event, "contract")} /></label></div>{documents.length ? <div className="document-list">{documents.map((doc) => <div key={doc.id} className="document-item">{doc.signedUrl ? <a href={doc.signedUrl} target="_blank" rel="noreferrer" className="document-link">{doc.category === "photo" ? <img className="document-thumb" src={doc.signedUrl} alt={doc.name} /> : <FileUp size={15} />}<span>{doc.name}</span></a> : <span className="document-link"><FileUp size={15} /><span>{doc.name}</span></span>}{doc.category === "photo" && doc.is_primary && <span className="primary-badge"><Star size={12} /> Principal</span>}</div>)}</div> : <p className="muted">Nenhum arquivo enviado.</p>}</section></div>}{editing && <div className="modal-backdrop"><form className="edit-modal" onSubmit={saveUnit}><div className="panel-heading"><div><h2>Editar {editing.code}</h2><p>Atualize status, aluguel e inquilino.</p></div><button type="button" className="icon-btn" onClick={() => setEditing(null)} aria-label="Fechar"><X size={16} /></button></div><div className="form-grid"><label>Unidade<input name="code" value={editing.code} readOnly /></label><label>Tipo<input name="type" value={editing.type} readOnly /></label><label>Status<select name="status" defaultValue={editing.status}>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Aluguel mensal<input name="rent" type="number" min="0" step="0.01" defaultValue={editing.rent} /></label><label>Inquilino<input name="tenant" defaultValue={editing.tenantName ?? editing.lease?.tenantName ?? ""} placeholder="Nome do inquilino" /></label><label>Dia de vencimento<input name="dueDay" type="number" min="1" max="31" defaultValue={editing.lease?.dueDay ?? 10} /></label></div><div className="onboarding-actions"><button type="button" className="button button-ghost" onClick={() => setEditing(null)}>Cancelar</button><button type="submit" className="button button-primary" disabled={busy}><Save size={14} /> {busy ? "Salvando…" : "Salvar alterações"}</button></div></form></div>}</div>;
}

