"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Building2, Check, Edit3, ExternalLink, FileUp, Image as ImageIcon, MapPin, Paperclip, Plus, Ruler, Save, Star, Trash2, X } from "lucide-react";
import { usePortfolio } from "@/components/portfolio-provider";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import { brl, compactBrl } from "@/lib/format";
import type { PropertyUnit, UnitStatus } from "@/types/domain";
import { listAuthorizedDocuments } from "@/lib/member-access";

const labels: Record<string, string> = { alugado: "Alugado", vago: "Vago", venda: "À venda", venda_alugado: "À venda e alugado", manutencao: "Manutenção", servico: "Serviço", negociacao: "Negociação", vendido: "Vendido" };
const dbStatus: Record<UnitStatus, string> = { alugado: "rented", vago: "vacant", manutencao: "maintenance", servico: "service", negociacao: "negotiation", venda: "for_sale", venda_alugado: "for_sale", vendido: "sold" };
type DocumentRow = { id: string; name: string; category: string; storage_path: string; mime_type?: string; is_primary?: boolean; signedUrl?: string };

export default function BuildingDetailClient() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { buildings, organizationId, role, memberVisibility, refresh, loading } = usePortfolio();
  const routeBuildingId = params.id === "novo" ? searchParams.get("building") : params.id;
  const building = buildings.find((item) => item.id === routeBuildingId || item.dbId === routeBuildingId);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("todos");
  const [editing, setEditing] = useState<PropertyUnit | null>(null);
  const [editingBuildingDetails, setEditingBuildingDetails] = useState(false);
  const [buildingForm, setBuildingForm] = useState({ name: "", value: "", city: "", state: "", address: "", lastValuationDate: "", status: "active", notes: "" });
  const [creatingUnit, setCreatingUnit] = useState(false);
  const [filesUnit, setFilesUnit] = useState<PropertyUnit | null>(null);
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [primaryPhotos, setPrimaryPhotos] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [fileLoading, setFileLoading] = useState(false);

  const units = useMemo(() => (building?.unitsData ?? []).filter((unit) => {
    const matches = `${unit.code} ${unit.type} ${unit.tenantName ?? ""}`.toLowerCase().includes(query.toLowerCase());
    const upcomingEnd = Boolean(unit.lease?.endDate && new Date(unit.lease.endDate).getTime() <= Date.now() + 90 * 86400000);
    const upcomingAdjustment = Boolean(unit.lease?.nextAdjustmentDate && new Date(unit.lease.nextAdjustmentDate).getTime() <= Date.now() + 60 * 86400000);
    const isRented = unit.status === "alugado" || unit.status === "venda_alugado" || unit.rent > 0;
    const filterMatch = filter === "todos" || (filter === "alugados" && isRented) || (filter === "vagos" && !isRented && unit.status === "vago") || (filter === "contratos" && upcomingEnd) || (filter === "reajustes" && upcomingAdjustment) || (filter === "venda" && (unit.status === "venda" || unit.status === "venda_alugado"));
    return matches && filterMatch;
  }), [building, filter, query]);

  useEffect(() => {
    let active = true;
    async function loadPrimaryPhotos() {
      const unitIds = (building?.unitsData ?? []).map((unit) => unit.id);
      if (!organizationId || !unitIds.length) {
        if (active) setPrimaryPhotos({});
        return;
      }
      const supabase = createSupabaseBrowserClient();
      if (!supabase) return;
      if (role === "viewer" && !memberVisibility.showPhotos) { if (active) setPrimaryPhotos({}); return; }
      const result = await listAuthorizedDocuments(supabase, organizationId, role);
      if (result.error) return;
      const entries = await Promise.all((result.data ?? []).filter((row) => row.category === "photo" && row.is_primary && row.unit_id && unitIds.includes(String(row.unit_id))).map(async (row) => ({ unitId: String(row.unit_id), url: (await supabase.storage.from("organization-documents").createSignedUrl(String(row.storage_path), 3600)).data?.signedUrl })));
      if (active) setPrimaryPhotos(Object.fromEntries(entries.filter((entry): entry is { unitId: string; url: string } => Boolean(entry.url)).map((entry) => [entry.unitId, entry.url])));
    }
    void loadPrimaryPhotos();
    return () => { active = false; };
  }, [building?.unitsData, memberVisibility.showPhotos, organizationId, role]);

  if (loading) return <div className="content"><div className="empty-state"><p>Carregando unidade...</p></div></div>;
  if (!building || !organizationId) return <div className="content"><div className="empty-state"><h3>Imóvel não encontrado</h3><Link href="/imoveis" className="button button-primary">Voltar</Link></div></div>;
  const currentBuilding = building;
  const occupancy = building.units ? Math.round((building.occupied / building.units) * 100) : 0;

  async function saveBuildingDetails(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextName = buildingForm.name.trim();
    const assetId = building?.assetId;
    if (!nextName || !assetId || role === "viewer") {
      setMessage(role === "viewer" ? "Seu perfil não pode editar este imóvel." : "Informe um nome válido para o imóvel.");
      return;
    }
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;
    const value = Number(buildingForm.value.replace(",", "."));
    const assetResult = await supabase.from("assets").update({ name: nextName, current_value: Number.isFinite(value) ? value : 0, status: buildingForm.status === "sold" ? "sold" : "active" }).eq("id", assetId).eq("organization_id", organizationId);
    const buildingResult = await supabase.from("buildings").update({ city: buildingForm.city.trim(), state: buildingForm.state.trim(), address: buildingForm.address.trim(), current_value: Number.isFinite(value) ? value : 0, last_valuation_date: buildingForm.lastValuationDate || null, status: buildingForm.status, notes: buildingForm.notes.trim() }).eq("id", building.dbId).eq("organization_id", organizationId);
    if (assetResult.error || buildingResult.error) { setMessage(assetResult.error?.message ?? buildingResult.error?.message ?? "Não foi possível salvar o imóvel."); return; }
    setEditingBuildingDetails(false);
    setMessage("Dados do imóvel atualizados.");
    await refresh();
  }

  async function deleteBuilding() {
    if (!currentBuilding.dbId || !currentBuilding.assetId || role !== "owner" && role !== "admin") return;
    if (!window.confirm(`Excluir permanentemente “${currentBuilding.name}” e todas as suas unidades?`)) return;
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;
    const unitIds = (currentBuilding.unitsData ?? []).map((unit) => unit.id);
    if (unitIds.length) await supabase.from("leases").delete().eq("organization_id", organizationId).in("unit_id", unitIds);
    const buildingResult = await supabase.from("buildings").delete().eq("id", currentBuilding.dbId).eq("organization_id", organizationId);
    if (buildingResult.error) { setMessage(buildingResult.error.message); return; }
    const assetResult = await supabase.from("assets").delete().eq("id", currentBuilding.assetId).eq("organization_id", organizationId);
    if (assetResult.error) { setMessage(assetResult.error.message); return; }
    await refresh();
    router.push("/imoveis");
  }

  async function saveNewUnit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!currentBuilding.dbId || role === "viewer") return;
    const form = new FormData(event.currentTarget);
    const code = String(form.get("code") ?? "").trim();
    if (!code) return;
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;
    const result = await supabase.from("property_units").insert({ organization_id: organizationId, building_id: currentBuilding.dbId, code, unit_type: String(form.get("type") ?? "Unidade"), potential_rent: Number(String(form.get("rent") ?? "0").replace(",", ".")) || 0, status: dbStatus[String(form.get("status")) as UnitStatus] ?? "vacant" });
    if (result.error) setMessage(result.error.message);
    else { setCreatingUnit(false); setMessage("Nova unidade criada."); await refresh(); }
  }

  async function openFiles(unit: PropertyUnit) {
    const supabase = createSupabaseBrowserClient();
    if (!supabase || !organizationId) return;
    setFilesUnit(unit);
    setFileLoading(true);
    setMessage("");
    const result = await listAuthorizedDocuments(supabase, organizationId, role);
    if (result.error) setMessage(result.error.message);
    else {
      const rows = (result.data ?? []).filter((document) => String(document.unit_id) === unit.id) as DocumentRow[];
      const withLinks = await Promise.all(rows.map(async (row) => ({ ...row, signedUrl: (await supabase.storage.from("organization-documents").createSignedUrl(row.storage_path, 3600)).data?.signedUrl })));
      setDocuments(withLinks);
    }
    setFileLoading(false);
  }

  async function loadPrimaryPhotos() {
    const unitIds = (building?.unitsData ?? []).map((unit) => unit.id);
    const supabase = createSupabaseBrowserClient();
    if (!supabase || !organizationId || !unitIds.length) return;
    if (role === "viewer" && !memberVisibility.showPhotos) { setPrimaryPhotos({}); return; }
    const result = await listAuthorizedDocuments(supabase, organizationId, role);
    if (result.error) return;
    const entries = await Promise.all((result.data ?? []).filter((row) => row.category === "photo" && row.is_primary && row.unit_id && unitIds.includes(String(row.unit_id))).map(async (row) => ({ unitId: String(row.unit_id), url: (await supabase.storage.from("organization-documents").createSignedUrl(String(row.storage_path), 3600)).data?.signedUrl })));
    setPrimaryPhotos(Object.fromEntries(entries.filter((entry): entry is { unitId: string; url: string } => Boolean(entry.url)).map((entry) => [entry.unitId, entry.url])));
  }

  async function uploadDocuments(event: React.ChangeEvent<HTMLInputElement>, category: "photo" | "contract") {
    const files = Array.from(event.target.files ?? []);
    if (!files.length || !filesUnit || role === "viewer") return;
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;
    setFileLoading(true);
    setMessage("");
    const user = (await supabase.auth.getUser()).data.user;
    let makeFirstPrimary = false;
    if (category === "photo") {
      const primary = await supabase.from("documents").select("id").eq("organization_id", organizationId).eq("unit_id", filesUnit.id).eq("category", "photo").eq("is_primary", true).limit(1);
      if (primary.error) {
        setMessage(primary.error.message);
        setFileLoading(false);
        return;
      }
      makeFirstPrimary = !primary.data?.length;
    }
    let uploaded = 0;
    for (const file of files) {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
      const path = `${organizationId}/${filesUnit.id}/${crypto.randomUUID()}-${safeName}`;
      const upload = await supabase.storage.from("organization-documents").upload(path, file, { upsert: false, contentType: file.type || undefined });
      if (upload.error) {
        setMessage(upload.error.message);
        continue;
      }
      const inserted = await supabase.from("documents").insert({ organization_id: organizationId, unit_id: filesUnit.id, name: file.name, category, storage_path: path, mime_type: file.type, size_bytes: file.size, uploaded_by: user?.id, is_primary: category === "photo" && makeFirstPrimary && uploaded === 0 });
      if (inserted.error) setMessage(inserted.error.message);
      else uploaded += 1;
    }
    if (uploaded) setMessage(`${uploaded} arquivo${uploaded > 1 ? "s" : ""} enviado${uploaded > 1 ? "s" : ""} com sucesso.`);
    event.currentTarget.value = "";
    await openFiles(filesUnit);
    await loadPrimaryPhotos();
    setFileLoading(false);
  }

  async function setPrimaryPhoto(document: DocumentRow) {
    if (!filesUnit || document.category !== "photo") return;
    if (role === "viewer") {
      setMessage("Seu perfil não pode alterar a foto principal.");
      return;
    }
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;
    setFileLoading(true);
    const clear = await supabase.from("documents").update({ is_primary: false }).eq("organization_id", organizationId).eq("unit_id", filesUnit.id).eq("category", "photo");
    const selected = clear.error ? clear : await supabase.from("documents").update({ is_primary: true }).eq("id", document.id).eq("organization_id", organizationId);
    if (selected.error) setMessage(selected.error.message);
    else setMessage("Foto principal atualizada.");
    await openFiles(filesUnit);
    await loadPrimaryPhotos();
    setFileLoading(false);
  }

  async function saveUnit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing || role === "viewer") {
      setMessage("Seu perfil não pode editar este imóvel.");
      return;
    }
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;
    const form = new FormData(event.currentTarget);
    const status = String(form.get("status")) as UnitStatus;
    const rent = Number(String(form.get("rent") ?? "0").replace(",", "."));
    const updated = await supabase.from("property_units").update({ code: String(form.get("code")), unit_type: String(form.get("type")), potential_rent: rent, status: dbStatus[status], notes: String(form.get("notes") ?? "") }).eq("id", editing.id).eq("organization_id", organizationId);
    if (updated.error) {
      setMessage(updated.error.message);
      return;
    }
    const tenantName = String(form.get("tenant") ?? "").trim();
    const existingLease = await supabase.from("leases").select("id, current_rent").eq("organization_id", organizationId).eq("unit_id", editing.id).in("status", ["active", "ending", "draft"]).maybeSingle();
    if ((status === "alugado" || status === "venda_alugado") && tenantName) {
      let tenant = await supabase.from("tenants").select("id").eq("organization_id", organizationId).eq("name", tenantName).maybeSingle();
      if (!tenant.data) tenant = await supabase.from("tenants").insert({ organization_id: organizationId, name: tenantName }).select("id").single();
      if (tenant.error || !tenant.data) {
        setMessage(tenant.error?.message ?? "Não foi possível salvar o inquilino.");
        return;
      }
      const leasePayload = { organization_id: organizationId, unit_id: editing.id, tenant_id: tenant.data.id, start_date: String(form.get("startDate") || new Date().toISOString().slice(0, 10)), end_date: String(form.get("endDate") || "") || null, current_rent: rent, initial_rent: existingLease.data?.current_rent ?? rent, due_day: Math.min(31, Math.max(1, Number(form.get("dueDay") || 10))), next_adjustment: String(form.get("nextAdjustment") || "") || null, adjustment_index: String(form.get("adjustmentIndex") || "") || null, adjustment_frequency: String(form.get("frequency") || "annual"), contract_document_url: String(form.get("contractUrl") || "") || null, status: "active", notes: String(form.get("notes") ?? "") };
      if (existingLease.data && Number(existingLease.data.current_rent) !== rent) await supabase.from("lease_adjustments").insert({ organization_id: organizationId, lease_id: existingLease.data.id, previous_rent: Number(existingLease.data.current_rent), new_rent: rent, adjustment_date: new Date().toISOString().slice(0, 10), index_name: leasePayload.adjustment_index, notes: "Atualização rápida na unidade" });
      const leaseResult = existingLease.data ? await supabase.from("leases").update(leasePayload).eq("id", existingLease.data.id).eq("organization_id", organizationId) : await supabase.from("leases").insert(leasePayload);
      if (leaseResult.error) {
        setMessage(leaseResult.error.message);
        return;
      }
    } else if (existingLease.data && status !== "venda_alugado") {
      const terminated = await supabase.from("leases").update({ status: "terminated" }).eq("id", existingLease.data.id).eq("organization_id", organizationId);
      if (terminated.error) {
        setMessage(terminated.error.message);
        return;
      }
    }
    await supabase.rpc("refresh_lease_notifications", { target_org: organizationId });
    setEditing(null);
    setMessage("Unidade e contrato atualizados.");
    await refresh();
  }

  const isMember = role === "viewer";
  const showValues = !isMember || memberVisibility.showPropertyValues;
  const showRent = !isMember || memberVisibility.showRentalInfo;
  const showStatus = !isMember || memberVisibility.showPropertyStatus;
  const showLocation = !isMember || memberVisibility.showLocations;
  const canOpenFiles = !isMember || memberVisibility.showPhotos || memberVisibility.showDocuments;
  return <div className="content">
    <Link href="/imoveis" className="breadcrumb" style={{ marginBottom: 25, display: "inline-flex" }}><ArrowLeft size={13} /> Imóveis</Link>
    <div className="page-heading"><div><div className="eyebrow"><Building2 size={13} /> {showStatus ? building.status : "Imóvel"}</div><h1>{building.name}</h1><p className="subtitle">{showLocation && (building.city || building.state) && <><MapPin size={12} style={{ verticalAlign: "-2px" }} /> {[building.city, building.state].filter(Boolean).join(", ")} · </>}{building.units} unidades</p></div>{!isMember && <div className="page-heading-actions"><button className="button button-ghost" onClick={() => { setBuildingForm({ name: building.name, value: String(building.value), city: building.city, state: building.state, address: building.address ?? "", lastValuationDate: building.lastValuationDate ?? "", status: building.status === "venda" ? "for_sale" : building.status === "vendido" ? "sold" : building.status === "reforma" ? "renovation" : "active", notes: building.notes ?? "" }); setEditingBuildingDetails(true); }}><Edit3 size={14} /> Editar imóvel</button>{(role === "owner" || role === "admin") && <button className="button button-ghost danger-button" onClick={() => void deleteBuilding()}><Trash2 size={14} /> Excluir</button>}</div>}</div>
    <div className="panel"><div className="panel-heading"><div><h2>Resumo do ativo</h2><p>{isMember ? "Informações gerais compartilhadas pela administração." : "Dados sincronizados · patrimônio baseado somente em AVALIAÇÃO."}</p></div></div><div className="metrics">{showValues && <div className="metric-card"><div className="metric-top"><span>Valor patrimonial</span></div><div className="metric-value">{compactBrl(building.value)}</div></div>}{showStatus && <div className="metric-card"><div className="metric-top"><span>Ocupação</span></div><div className="metric-value">{occupancy}%</div></div>}{showRent && <div className="metric-card"><div className="metric-top"><span>{isMember ? "Sua receita mensal" : "Receita mensal"}</span></div><div className="metric-value">{compactBrl(building.revenue)}</div></div>}</div></div>
    <div className="panel section-gap"><div className="panel-heading"><div><h2>{isMember ? "Unidades" : "Unidades e contratos"}</h2><p>{units.length} resultados · {isMember ? "consulta das informações autorizadas" : "fotos, arquivos e edição rápida disponíveis"}.</p></div><div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><input className="table-filter" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={isMember ? "Buscar unidade ou tipo" : "Buscar unidade, tipo ou inquilino"} />{showStatus && <select className="filter-select" value={filter} onChange={(event) => setFilter(event.target.value)}><option value="todos">Todos</option><option value="alugados">Alugados</option><option value="vagos">Vagos</option>{!isMember && <><option value="contratos">Contratos vencendo</option><option value="reajustes">Reajustes próximos</option></>}<option value="venda">À venda</option></select>}{!isMember && <button className="button button-ghost button-small" onClick={() => setCreatingUnit(true)}><Plus size={13} /> Nova unidade</button>}</div></div>
      {message && <p className="form-success"><Check size={13} /> {message}</p>}
      <div className="table-wrap"><table><thead><tr>{memberVisibility.showPhotos || !isMember ? <th>Foto</th> : null}<th>Unidade</th><th>Tipo</th>{!isMember && <th>Inquilino</th>}{showStatus && <th>Status</th>}{showRent && <th>{isMember ? "Sua parte mensal" : "Aluguel mensal"}</th>}{!isMember && <><th>Vencimento</th><th>Último pagamento</th><th>Início</th><th>Fim</th><th>Próximo reajuste</th></>}{(canOpenFiles || !isMember) && <th>Ações</th>}</tr></thead><tbody>{units.map((unit) => { const isRented = unit.status === "alugado" || unit.status === "venda_alugado" || unit.rent > 0; const statusLabel = unit.status === "venda_alugado" || (unit.status === "venda" && isRented) ? labels.venda_alugado : labels[unit.status]; return <tr key={unit.id}>{(memberVisibility.showPhotos || !isMember) && <td><div className="unit-photo-thumb">{primaryPhotos[unit.id] ? <img src={primaryPhotos[unit.id]} alt={`Foto principal de ${unit.code}`} /> : <ImageIcon size={18} />}</div></td>}<td><strong>{unit.code}</strong><small><Ruler size={11} /> Qtd. {unit.quantity ?? 1}</small></td><td>{unit.type}</td>{!isMember && <td>{unit.tenantName ?? "Não cadastrado"}</td>}{showStatus && <td><span className={`status status-${unit.status === "venda" || unit.status === "venda_alugado" ? "vago" : unit.status}`}>{statusLabel}</span></td>}{showRent && <td><strong>{unit.rent ? brl(unit.rent) : "—"}</strong></td>}{!isMember && <><td>{unit.lease?.dueDay ? `Dia ${unit.lease.dueDay}` : "—"}</td><td>{unit.lease?.lastPaymentDate ? new Date(`${unit.lease.lastPaymentDate.slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR") : "—"}</td><td>{unit.lease?.startDate ?? "—"}</td><td>{unit.lease?.endDate ?? "—"}</td><td>{unit.lease?.nextAdjustmentDate ?? "—"}</td></>}{(canOpenFiles || !isMember) && <td>{canOpenFiles && <button className="icon-btn" aria-label={`Fotos e arquivos de ${unit.code}`} onClick={() => void openFiles(unit)}><Paperclip size={14} /></button>}{!isMember && <button className="icon-btn" aria-label={`Editar ${unit.code}`} onClick={() => setEditing(unit)}><Edit3 size={14} /></button>}</td>}</tr>; })}</tbody></table></div>
    </div>
    {filesUnit && <div className="modal-backdrop"><section className="edit-modal"><div className="panel-heading"><div><h2>Fotos e arquivos · {filesUnit.code}</h2><p>{isMember ? "Consulte os arquivos compartilhados desta unidade." : "Envie várias fotos e escolha qual será exibida como principal."}</p></div><button className="icon-btn" onClick={() => setFilesUnit(null)} aria-label="Fechar arquivos"><X size={16} /></button></div>{!isMember && <div className="upload-grid"><label className="upload-card"><ImageIcon size={22} /><strong>Enviar fotos</strong><small>Selecione uma ou várias · JPG, PNG ou WebP</small><input type="file" accept="image/*" multiple onChange={(event) => void uploadDocuments(event, "photo")} /></label><label className="upload-card"><FileUp size={22} /><strong>Enviar contrato</strong><small>PDF ou documento</small><input type="file" accept="application/pdf,.doc,.docx,image/*" onChange={(event) => void uploadDocuments(event, "contract")} /></label></div>}{fileLoading && <p className="muted">Carregando arquivos...</p>}<div className="document-list">{documents.length ? documents.map((doc) => <div key={doc.id} className="document-item">{doc.signedUrl ? <a href={doc.signedUrl} target="_blank" rel="noreferrer" className="document-link">{doc.category === "photo" ? <img className="document-thumb" src={doc.signedUrl} alt={doc.name} /> : <FileUp size={15} />}<span>{doc.name}</span></a> : <span className="document-link">{doc.category === "photo" ? <ImageIcon size={15} /> : <FileUp size={15} />}<span>{doc.name}</span></span>}<div className="document-actions">{doc.category === "photo" && (doc.is_primary ? <span className="primary-badge"><Star size={12} /> Principal</span> : !isMember && <button type="button" className="button button-ghost button-small" onClick={() => void setPrimaryPhoto(doc)}><Star size={12} /> Usar como principal</button>)}{doc.signedUrl && <a href={doc.signedUrl} target="_blank" rel="noreferrer" className="icon-btn" aria-label={`Abrir ${doc.name}`}><ExternalLink size={14} /></a>}</div></div>) : <p className="muted">Nenhum arquivo disponível.</p>}</div></section></div>}
    {!isMember && editingBuildingDetails && <div className="modal-backdrop"><form className="edit-modal" onSubmit={saveBuildingDetails}><div className="panel-heading"><div><h2>Editar imóvel</h2><p>Nome, AVALIAÇÃO, data de avaliação, localização e status.</p></div><button type="button" className="icon-btn" onClick={() => setEditingBuildingDetails(false)} aria-label="Fechar edição"><X size={16} /></button></div><div className="form-grid"><label className="form-grid-wide">Nome principal<input value={buildingForm.name} onChange={(event) => setBuildingForm((current) => ({ ...current, name: event.target.value }))} required /></label><label>AVALIAÇÃO<input type="number" min="0" step="0.01" value={buildingForm.value} onChange={(event) => setBuildingForm((current) => ({ ...current, value: event.target.value }))} required /></label><label>Data da última avaliação<input type="date" value={buildingForm.lastValuationDate} onChange={(event) => setBuildingForm((current) => ({ ...current, lastValuationDate: event.target.value }))} /></label><label>Cidade<input value={buildingForm.city} onChange={(event) => setBuildingForm((current) => ({ ...current, city: event.target.value }))} /></label><label>Estado<input value={buildingForm.state} onChange={(event) => setBuildingForm((current) => ({ ...current, state: event.target.value }))} maxLength={2} /></label><label className="form-grid-wide">Endereço<input value={buildingForm.address} onChange={(event) => setBuildingForm((current) => ({ ...current, address: event.target.value }))} /></label><label>Status<select value={buildingForm.status} onChange={(event) => setBuildingForm((current) => ({ ...current, status: event.target.value }))}><option value="active">Ativo</option><option value="renovation">Reforma</option><option value="for_sale">À venda</option><option value="sold">Vendido</option><option value="inactive">Inativo</option></select></label><label className="form-grid-wide">Observações<textarea value={buildingForm.notes} onChange={(event) => setBuildingForm((current) => ({ ...current, notes: event.target.value }))} rows={3} /></label></div><div className="onboarding-actions"><button type="button" className="button button-ghost" onClick={() => setEditingBuildingDetails(false)}>Cancelar</button><button type="submit" className="button button-primary"><Save size={14} /> Salvar imóvel</button></div></form></div>}
    {!isMember && creatingUnit && <div className="modal-backdrop"><form className="edit-modal" onSubmit={saveNewUnit}><div className="panel-heading"><div><h2>Nova unidade</h2><p>Crie uma unidade para este prédio.</p></div><button type="button" className="icon-btn" onClick={() => setCreatingUnit(false)} aria-label="Fechar"><X size={16} /></button></div><div className="form-grid"><label>Unidade<input name="code" placeholder="Sala 1.01" required /></label><label>Tipo<input name="type" defaultValue="Unidade" required /></label><label>Status<select name="status" defaultValue="vago">{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Aluguel mensal<input name="rent" type="number" min="0" step="0.01" defaultValue="0" /></label></div><div className="onboarding-actions"><button type="button" className="button button-ghost" onClick={() => setCreatingUnit(false)}>Cancelar</button><button type="submit" className="button button-primary"><Save size={14} /> Criar unidade</button></div></form></div>}
    {!isMember && editing && <div className="modal-backdrop"><form className="edit-modal" onSubmit={saveUnit}><div className="panel-heading"><div><h2>Editar {editing.code}</h2><p>Unidade, inquilino e dados do contrato.</p></div><button type="button" className="icon-btn" onClick={() => setEditing(null)}><X size={16} /></button></div><div className="form-grid"><label>Unidade<input name="code" defaultValue={editing.code} required /></label><label>Tipo<input name="type" defaultValue={editing.type} required /></label><label>Status<select name="status" defaultValue={editing.status}>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Aluguel mensal<input name="rent" type="number" min="0" step="0.01" defaultValue={editing.rent} /></label><label>Inquilino<input name="tenant" defaultValue={editing.tenantName ?? ""} placeholder="Nome do inquilino" /></label><label>Dia de vencimento<input name="dueDay" type="number" min="1" max="31" defaultValue={editing.lease?.dueDay ?? 10} /></label><label>Início<input name="startDate" type="date" defaultValue={editing.lease?.startDate ?? ""} /></label><label>Fim<input name="endDate" type="date" defaultValue={editing.lease?.endDate ?? ""} /></label><label>Próximo reajuste<input name="nextAdjustment" type="date" defaultValue={editing.lease?.nextAdjustmentDate ?? ""} /></label><label>Índice<input name="adjustmentIndex" defaultValue={editing.lease?.adjustmentIndex ?? ""} placeholder="IPCA, IGP-M..." /></label><label>Frequência<select name="frequency" defaultValue={editing.lease?.adjustmentFrequency ?? "annual"}><option value="annual">Anual</option><option value="semiannual">Semestral</option><option value="monthly">Mensal</option></select></label><label className="form-grid-wide">Link do contrato<input name="contractUrl" type="url" defaultValue={editing.lease?.contractDocumentUrl ?? ""} placeholder="https://..." /></label><label className="form-grid-wide">Observações<textarea name="notes" defaultValue={editing.lease?.notes ?? ""} rows={3} /></label></div><div className="onboarding-actions"><button type="button" className="button button-ghost" onClick={() => setEditing(null)}>Cancelar</button><button type="submit" className="button button-primary"><Save size={14} /> Salvar contrato</button></div></form></div>}
  </div>;
}
