"use client";

import Link from "next/link";
import { ArrowLeft, Building2, Check, Edit3, MapPin, Ruler, Save, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { usePortfolio } from "@/components/portfolio-provider";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import { brl, compactBrl } from "@/lib/format";
import type { PropertyUnit, UnitStatus } from "@/types/domain";

const labels: Record<string, string> = { alugado: "Alugado", vago: "Vago", venda: "À venda", manutencao: "Manutenção", negociacao: "Negociação", vendido: "Vendido" };
const dbStatus: Record<UnitStatus, string> = { alugado: "rented", vago: "vacant", manutencao: "maintenance", negociacao: "negotiation", venda: "for_sale", vendido: "sold" };

export default function BuildingDetailClient() {
  const params = useParams<{ id: string }>();
  const { buildings, organizationId, role, refresh, loading } = usePortfolio();
  const building = buildings.find((item) => item.id === params.id);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("todos");
  const [editing, setEditing] = useState<PropertyUnit | null>(null);
  const [message, setMessage] = useState("");
  const units = useMemo(() => (building?.unitsData ?? []).filter((unit) => {
    const matches = `${unit.code} ${unit.type} ${unit.tenantName ?? ""}`.toLowerCase().includes(query.toLowerCase());
    const upcomingEnd = Boolean(unit.lease?.endDate && new Date(unit.lease.endDate).getTime() <= Date.now() + 90 * 86400000);
    const upcomingAdjustment = Boolean(unit.lease?.nextAdjustmentDate && new Date(unit.lease.nextAdjustmentDate).getTime() <= Date.now() + 60 * 86400000);
    const filterMatch = filter === "todos" || (filter === "alugados" && unit.status === "alugado") || (filter === "vagos" && unit.status === "vago") || (filter === "contratos" && upcomingEnd) || (filter === "reajustes" && upcomingAdjustment) || (filter === "venda" && unit.status === "venda");
    return matches && filterMatch;
  }), [building, filter, query]);
  if (loading) return <div className="content"><div className="empty-state"><p>Carregando unidade...</p></div></div>;
  if (!building || !organizationId) return <div className="content"><div className="empty-state"><h3>Imóvel não encontrado</h3><Link href="/imoveis" className="button button-primary">Voltar</Link></div></div>;
  const occupancy = building.units ? Math.round((building.occupied / building.units) * 100) : 0;
  async function saveUnit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing || !role || role === "viewer") { setMessage("Seu perfil não pode editar este imóvel."); return; }
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;
    const form = new FormData(event.currentTarget);
    const status = String(form.get("status")) as UnitStatus;
    const rent = Number(String(form.get("rent") ?? "0").replace(",", "."));
    const { error } = await supabase.from("property_units").update({ code: String(form.get("code")), unit_type: String(form.get("type")), potential_rent: rent, status: dbStatus[status], notes: String(form.get("notes") ?? "") }).eq("id", editing.id).eq("organization_id", organizationId);
    if (error) { setMessage(error.message); return; }
    const tenantName = String(form.get("tenant") ?? "").trim();
    const existingLease = await supabase.from("leases").select("id, current_rent, tenant_id").eq("organization_id", organizationId).eq("unit_id", editing.id).in("status", ["active", "ending", "draft"]).maybeSingle();
    if (status === "alugado" && tenantName) {
      let tenant = await supabase.from("tenants").select("id").eq("organization_id", organizationId).eq("name", tenantName).maybeSingle();
      if (!tenant.data) tenant = await supabase.from("tenants").insert({ organization_id: organizationId, name: tenantName }).select("id").single();
      if (tenant.error || !tenant.data) { setMessage(tenant.error?.message ?? "Não foi possível salvar o inquilino."); return; }
      const leasePayload = { organization_id: organizationId, unit_id: editing.id, tenant_id: tenant.data.id, start_date: String(form.get("startDate") || new Date().toISOString().slice(0, 10)), end_date: String(form.get("endDate") || "") || null, current_rent: rent, initial_rent: existingLease.data?.current_rent ?? rent, next_adjustment: String(form.get("nextAdjustment") || "") || null, adjustment_index: String(form.get("adjustmentIndex") || "") || null, adjustment_frequency: String(form.get("frequency") || "annual"), status: "active", notes: String(form.get("notes") ?? "") };
      if (existingLease.data && Number(existingLease.data.current_rent) !== rent) await supabase.from("lease_adjustments").insert({ organization_id: organizationId, lease_id: existingLease.data.id, previous_rent: Number(existingLease.data.current_rent), new_rent: rent, adjustment_date: new Date().toISOString().slice(0, 10), index_name: leasePayload.adjustment_index, notes: "Atualização rápida na unidade" });
      const leaseResult = existingLease.data ? await supabase.from("leases").update(leasePayload).eq("id", existingLease.data.id).eq("organization_id", organizationId) : await supabase.from("leases").insert(leasePayload);
      if (leaseResult.error) { setMessage(leaseResult.error.message); return; }
    } else if (existingLease.data) {
      const terminated = await supabase.from("leases").update({ status: "terminated" }).eq("id", existingLease.data.id).eq("organization_id", organizationId);
      if (terminated.error) { setMessage(terminated.error.message); return; }
    }
    await supabase.rpc("refresh_lease_notifications", { target_org: organizationId });
    setEditing(null); setMessage("Unidade atualizada."); await refresh();
  }
  return <div className="content"><Link href="/imoveis" className="breadcrumb" style={{ marginBottom: 25, display: "inline-flex" }}><ArrowLeft size={13} /> Imóveis</Link><div className="page-heading"><div><div className="eyebrow"><Building2 size={13} /> {building.status}</div><h1>{building.name}</h1><p className="subtitle"><MapPin size={12} style={{ verticalAlign: "-2px" }} /> {building.city}, {building.state} · {building.units} unidades</p></div></div><div className="panel"><div className="panel-heading"><div><h2>Resumo do ativo</h2><p>Dados sincronizados · patrimônio baseado somente em AVALIAÇÃO.</p></div></div><div className="metrics"><div className="metric-card"><div className="metric-top"><span>Valor patrimonial</span></div><div className="metric-value">{compactBrl(building.value)}</div></div><div className="metric-card"><div className="metric-top"><span>Ocupação</span></div><div className="metric-value">{occupancy}%</div></div><div className="metric-card"><div className="metric-top"><span>Receita mensal</span></div><div className="metric-value">{compactBrl(building.revenue)}</div></div></div></div><div className="panel section-gap"><div className="panel-heading"><div><h2>Unidades e contratos</h2><p>{units.length} resultados · edição rápida habilitada para gestores.</p></div><div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><input className="table-filter" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar unidade, tipo ou inquilino" /><select className="filter-select" value={filter} onChange={(event) => setFilter(event.target.value)}><option value="todos">Todos</option><option value="alugados">Alugados</option><option value="vagos">Vagos</option><option value="contratos">Contratos vencendo</option><option value="reajustes">Reajustes próximos</option><option value="venda">À venda</option></select></div></div>{message && <p className="form-success"><Check size={13} /> {message}</p>}<div className="table-wrap"><table><thead><tr><th>Unidade</th><th>Tipo</th><th>Inquilino</th><th>Status</th><th>Aluguel mensal</th><th>Início</th><th>Fim</th><th>Próximo reajuste</th><th>Ações</th></tr></thead><tbody>{units.map((unit) => <tr key={unit.id}><td><strong>{unit.code}</strong><small><Ruler size={11} /> Qtd. {unit.quantity ?? 1}</small></td><td>{unit.type}</td><td>{unit.tenantName ?? "Não cadastrado"}</td><td><span className={`status status-${unit.status === "venda" ? "vago" : unit.status}`}>{labels[unit.status]}</span></td><td><strong>{unit.rent ? brl(unit.rent) : "—"}</strong></td><td>{unit.lease?.startDate ?? "—"}</td><td>{unit.lease?.endDate ?? "—"}</td><td>{unit.lease?.nextAdjustmentDate ?? "—"}</td><td><button className="icon-btn" aria-label={`Editar ${unit.code}`} onClick={() => setEditing(unit)}><Edit3 size={14} /></button></td></tr>)}</tbody></table></div></div>{editing && <div className="modal-backdrop"><form className="edit-modal" onSubmit={saveUnit}><div className="panel-heading"><div><h2>Editar {editing.code}</h2><p>Unidade, inquilino e dados do contrato.</p></div><button type="button" className="icon-btn" onClick={() => setEditing(null)}><X size={16} /></button></div><div className="form-grid"><label>Unidade<input name="code" defaultValue={editing.code} required /></label><label>Tipo<input name="type" defaultValue={editing.type} required /></label><label>Status<select name="status" defaultValue={editing.status}>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Aluguel mensal<input name="rent" type="number" min="0" step="0.01" defaultValue={editing.rent} /></label><label>Inquilino<input name="tenant" defaultValue={editing.tenantName ?? ""} placeholder="Nome do inquilino" /></label><label>Início<input name="startDate" type="date" defaultValue={editing.lease?.startDate ?? ""} /></label><label>Fim<input name="endDate" type="date" defaultValue={editing.lease?.endDate ?? ""} /></label><label>Próximo reajuste<input name="nextAdjustment" type="date" defaultValue={editing.lease?.nextAdjustmentDate ?? ""} /></label><label>Índice<input name="adjustmentIndex" defaultValue={editing.lease?.adjustmentIndex ?? ""} placeholder="IPCA, IGP-M..." /></label><label>Frequência<select name="frequency" defaultValue={editing.lease?.adjustmentFrequency ?? "annual"}><option value="annual">Anual</option><option value="semiannual">Semestral</option><option value="monthly">Mensal</option></select></label><label className="form-grid-wide">Observações<textarea name="notes" defaultValue={editing.lease?.notes ?? ""} rows={3} /></label></div><div className="onboarding-actions"><button type="button" className="button button-ghost" onClick={() => setEditing(null)}>Cancelar</button><button type="submit" className="button button-primary"><Save size={14} /> Salvar contrato</button></div></form></div>}</div>;
}
