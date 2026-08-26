"use client";

import { Building2, CheckCircle2, Eye, MailPlus, Plus, Save, ShieldCheck, Trash2, UserRoundPlus, Users, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { usePortfolio } from "@/components/portfolio-provider";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import { syncInitialPortfolio } from "@/lib/portfolio-sync";
import type { MemberVisibility } from "@/types/domain";

type MemberRole = "owner" | "admin" | "manager" | "employee" | "viewer";

type Member = {
  member_id: string;
  user_id: string;
  contact_id?: string | null;
  full_name: string;
  email: string;
  role: MemberRole;
  ownership_percentage: number;
  joined_at: string;
  is_placeholder?: boolean;
};

const roleLabels: Record<MemberRole, string> = {
  owner: "Proprietário",
  admin: "Administrador",
  manager: "Gestor",
  employee: "Funcionária",
  viewer: "Membro",
};

export default function OrganizationPage() {
  const { organizationId, organizationName, role, memberVisibility, refresh } = usePortfolio();
  const [members, setMembers] = useState<Member[]>([]);
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<MemberRole>("viewer");
  const [holdingName, setHoldingName] = useState("");
  const [message, setMessage] = useState("");
  const [membersLoading, setMembersLoading] = useState(false);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [roleSaving, setRoleSaving] = useState<string | null>(null);
  const [ownershipSaving, setOwnershipSaving] = useState<string | null>(null);
  const [placeholderName, setPlaceholderName] = useState("");
  const [placeholderEmail, setPlaceholderEmail] = useState("");
  const [placeholderRole, setPlaceholderRole] = useState<MemberRole>("viewer");
  const [placeholderSaving, setPlaceholderSaving] = useState(false);
  const [deletingMember, setDeletingMember] = useState<Member | null>(null);
  const [replacementId, setReplacementId] = useState("");
  const [visibility, setVisibility] = useState<MemberVisibility>(memberVisibility);
  const [visibilitySaving, setVisibilitySaving] = useState(false);

  useEffect(() => { setVisibility(memberVisibility); }, [memberVisibility]);

  const loadMembers = useCallback(async () => {
    if (!organizationId) return;
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;
    setMembersLoading(true);
    const result = await supabase.rpc("list_organization_members", { target_org: organizationId });
    if (result.error) {
      setMessage("Não foi possível carregar os membros desta holding.");
      setMembers([]);
    } else {
      setMembers((result.data ?? []) as Member[]);
    }
    setMembersLoading(false);
  }, [organizationId]);

  useEffect(() => {
    void loadMembers();
  }, [loadMembers]);

  async function updateMemberRole(member: Member, newRole: MemberRole) {
    if (!organizationId || role === "viewer" || member.role === newRole) return;
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;
    setRoleSaving(member.member_id);
    setMessage("");
    const result = await supabase.rpc("update_member_role", {
      target_org: organizationId,
      target_user: member.member_id,
      new_role: newRole,
    });
    if (result.error) {
      const code = result.error.message;
      setMessage(code === "cannot_change_own_role" ? "Você não pode alterar a própria função." : "Não foi possível atualizar esta função.");
    } else {
      setMessage("Função atualizada com sucesso.");
      await loadMembers();
      await refresh();
    }
    setRoleSaving(null);
  }

  async function updateMemberOwnership(member: Member, value: string) {
    if (!organizationId || !canManage) return;
    const percentage = Number(value.replace(",", "."));
    if (!Number.isFinite(percentage) || percentage < 0 || percentage > 100) {
      setMessage("A participação deve ficar entre 0% e 100%.");
      return;
    }
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;
    setOwnershipSaving(member.member_id);
    setMessage("");
    const result = await supabase.rpc("update_member_ownership", { target_org: organizationId, target_user: member.member_id, new_percentage: percentage });
    if (result.error) setMessage(result.error.message === "invalid_percentage" ? "A participação deve ficar entre 0% e 100%." : "Não foi possível atualizar a participação.");
    else { setMessage("Participação atualizada. O restante foi redistribuído para totalizar 100%."); await loadMembers(); await refresh(); }
    setOwnershipSaving(null);
  }

  async function createPlaceholder() {
    if (!organizationId || !canManage || !placeholderName.trim()) return;
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;
    setPlaceholderSaving(true);
    const result = await supabase.rpc("create_organization_contact", { target_org: organizationId, target_name: placeholderName.trim(), target_email: placeholderEmail.trim().toLowerCase(), target_role: placeholderRole });
    if (result.error) setMessage(result.error.message === "name_required" ? "Informe o nome do membro." : "Não foi possível criar o membro sem acesso.");
    else { setMessage("Membro criado sem acesso. A participação foi redistribuída automaticamente."); setPlaceholderName(""); setPlaceholderEmail(""); setPlaceholderRole("viewer"); await loadMembers(); await refresh(); }
    setPlaceholderSaving(false);
  }

  async function deletePlaceholder() {
    if (!organizationId || !canManage || !deletingMember?.contact_id) return;
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;
    const result = await supabase.rpc("delete_organization_contact", { target_org: organizationId, target_contact: deletingMember.contact_id, reassign_to: replacementId || null });
    if (result.error) setMessage(result.error.message === "replacement_not_found" ? "Escolha um membro válido para receber as responsabilidades." : "Não foi possível remover o membro sem acesso.");
    else { setMessage("Membro removido e participações redistribuídas."); setDeletingMember(null); setReplacementId(""); await loadMembers(); await refresh(); }
  }

  async function invite() {
    const normalizedEmail = email.trim().toLowerCase();
    if (!organizationId || !normalizedEmail || role === "viewer") return;
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;
    setInviteLoading(true);
    setMessage("");
    const result = await supabase.rpc("create_invitation", { target_org: organizationId, target_email: normalizedEmail, target_role: inviteRole });
    if (result.error) {
      setMessage(result.error.message === "not_authorized" ? "Seu perfil não pode convidar usuários." : result.error.message);
      setInviteLoading(false);
      return;
    }
    const invitation = (Array.isArray(result.data) ? result.data[0] : result.data) as { result_code?: string } | null;
    if (invitation?.result_code === "user_not_found") setMessage("Não encontramos uma conta com esse e-mail. A pessoa precisa criar o acesso primeiro.");
    else if (invitation?.result_code === "already_member") setMessage("Esse usuário já faz parte desta holding.");
    else if (invitation?.result_code === "already_pending") setMessage("Usuário encontrado. Já existe um convite pendente para esse e-mail.");
    else if (invitation?.result_code === "created") { setMessage("Usuário encontrado. Convite enviado com sucesso."); setEmail(""); setInviteRole("viewer"); }
    else setMessage("Não foi possível concluir o convite.");
    setInviteLoading(false);
  }

  async function createHolding() {
    const name = holdingName.trim();
    const supabase = createSupabaseBrowserClient();
    if (!supabase || !name) return;
    const user = (await supabase.auth.getUser()).data.user;
    const result = await supabase.rpc("create_organization", { org_name: name, org_type: "company", org_description: "Holding criada pelo usuário", org_currency: "BRL" });
    if (result.error) { setMessage(result.error.message); return; }
    if (user?.email?.toLowerCase() === "paulocardosopub@gmail.com" && name.toLowerCase() === "cardoso") await syncInitialPortfolio(result.data);
    setHoldingName("");
    setMessage(`Holding “${name}” criada.`);
    await refresh();
  }

  async function saveMemberVisibility() {
    if (!organizationId || (role !== "owner" && role !== "admin" && role !== "manager")) return;
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;
    setVisibilitySaving(true);
    const result = await supabase.rpc("update_member_visibility", { target_org: organizationId, total_assets: visibility.showTotalAssets, property_values: visibility.showPropertyValues, rental_info: visibility.showRentalInfo, property_status: visibility.showPropertyStatus, photos: visibility.showPhotos, locations: visibility.showLocations, map_visible: visibility.showMap, documents_visible: visibility.showDocuments, ownership_by_beneficiary: visibility.showOwnershipByBeneficiary });
    setMessage(result.error ? (result.error.message === "not_authorized" ? "Seu perfil não pode alterar a privacidade dos membros." : "Não foi possível salvar a privacidade dos membros.") : "Privacidade dos Membros atualizada.");
    if (!result.error) await refresh();
    setVisibilitySaving(false);
  }

  const canManage = role === "owner" || role === "admin";
  const canEditPrivacy = role === "owner" || role === "admin" || role === "manager";
  const ownershipTotal = members.reduce((total, member) => total + Number(member.ownership_percentage || 0), 0);
  const replacementOptions = members.filter((member) => member.member_id !== deletingMember?.member_id);

  return <div className="content">
    <div className="page-heading">
      <div><div className="eyebrow"><Users size={13} /> Governança</div><h1>Organização</h1><p className="subtitle">{organizationName} · membros e permissões da holding.</p></div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><input className="table-filter" value={holdingName} onChange={(event) => setHoldingName(event.target.value)} placeholder="Nome da nova holding" /><button className="button button-primary" onClick={createHolding} disabled={role === "viewer" || !holdingName.trim()}><Plus size={14} /> Criar holding</button></div>
    </div>
    {message && <p className={message.startsWith("Não") || message.startsWith("Seu perfil") || message.startsWith("Você") ? "form-error" : "form-success"}><CheckCircle2 size={13} /> {message}</p>}
    <div className="dashboard-grid">
      <div className="panel">
        <div className="panel-heading"><div><h2>Membros</h2><p>{membersLoading ? "Carregando membros…" : `${members.length} membro(s) com acesso`}</p></div><ShieldCheck size={17} color="#80e2b0" /></div>
        {members.length ? <div className="table-wrap"><table><thead><tr><th>Usuário / membro</th><th>Função</th><th>Participação</th><th>Entrada</th><th /></tr></thead><tbody>{members.map((member) => <tr key={member.member_id}><td><strong>{member.full_name || "Usuário autenticado"}</strong><span className="member-email">{member.email || "Sem e-mail · membro sem acesso"} {member.is_placeholder && <span className="tag">Sem acesso</span>}</span></td><td>{member.role === "owner" || !canManage ? <span className="tag">{roleLabels[member.role]}</span> : <select className="filter-select member-role-select" value={member.role} disabled={roleSaving === member.member_id} onChange={(event) => void updateMemberRole(member, event.target.value as MemberRole)}><option value="viewer">Membro</option><option value="employee">Funcionária</option><option value="manager">Gestor</option><option value="admin">Administrador</option></select>}</td><td>{canManage ? <div className="ownership-editor"><input className="ownership-input" type="number" min="0" max="100" step="0.01" value={member.ownership_percentage} disabled={ownershipSaving === member.member_id} onChange={(event) => void updateMemberOwnership(member, event.target.value)} /><span>%</span></div> : <span className="tag">{Number(member.ownership_percentage || 0).toFixed(2).replace(".", ",")}%</span>}</td><td className="muted">{member.joined_at ? new Date(member.joined_at).toLocaleDateString("pt-BR") : "—"}</td><td>{member.is_placeholder && canManage && <button type="button" className="icon-btn danger-btn" aria-label={`Remover ${member.full_name}`} onClick={() => { setDeletingMember(member); setReplacementId(""); }}><Trash2 size={14} /></button>}</td></tr>)}</tbody></table></div> : <div className="empty-state"><Users size={30} /><h3>Nenhum membro cadastrado</h3><p>Crie uma organização para começar.</p></div>}
        <p className={Math.abs(ownershipTotal - 100) < 0.001 ? "muted organization-note" : "form-error organization-note"}>Participação total: <strong>{ownershipTotal.toFixed(2).replace(".", ",")}%</strong>. {canManage ? "Ao alterar uma pessoa, o restante é redistribuído automaticamente para fechar 100%." : "As porcentagens definem a distribuição de receitas, responsabilidades e lucros."}</p>
      </div>
      <div className="panel"><div className="panel-heading"><div><h2>Acesso</h2><p>Convites e membros planejados</p></div><Building2 size={17} color="#80e2b0" /></div><div className="setting-row"><span>Organização ativa</span><strong>{organizationName}</strong></div><div className="setting-row"><span>Seu perfil</span><strong>{roleLabels[role as MemberRole] ?? role}</strong></div><div className="setting-row"><span>Proteção</span><strong className="positive">RLS ativo</strong></div><div className="setting-row"><span>Convidar usuário cadastrado</span><span style={{ display: "flex", gap: 6 }}><input className="table-filter" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="e-mail da conta" type="email" /><select className="filter-select" value={inviteRole} onChange={(event) => setInviteRole(event.target.value as MemberRole)}><option value="viewer">Membro</option><option value="employee">Funcionária</option></select><button className="icon-btn" onClick={() => void invite()} disabled={!canManage || inviteLoading || !email.trim()} aria-label="Enviar convite"><MailPlus size={15} /></button></span></div><p className="muted invite-help">O e-mail é verificado antes do convite. A pessoa aceita ou recusa pelo menu de holdings.</p><div className="setting-row setting-row-stack"><span><strong>Adicionar membro sem acesso</strong><small className="member-email">Cadastre sócio, responsável ou bot antes de ele criar a conta.</small></span><UserRoundPlus size={16} color="#80e2b0" /></div><div className="form-grid compact-form"><label>Nome<input value={placeholderName} onChange={(event) => setPlaceholderName(event.target.value)} placeholder="Nome do sócio" /></label><label>E-mail (opcional)<input type="email" value={placeholderEmail} onChange={(event) => setPlaceholderEmail(event.target.value)} placeholder="e-mail futuro" /></label><label>Função<select value={placeholderRole} onChange={(event) => setPlaceholderRole(event.target.value as MemberRole)}><option value="viewer">Membro</option><option value="employee">Funcionária</option><option value="manager">Gestor</option><option value="admin">Administrador</option></select></label><div className="onboarding-actions compact-actions"><span className="muted">Sem participação patrimonial</span><button type="button" className="button button-primary" onClick={() => void createPlaceholder()} disabled={!canManage || placeholderSaving || !placeholderName.trim()}>{placeholderSaving ? "Criando…" : "Criar membro"}</button></div></div></div>
    </div>
    {canEditPrivacy && <section className="panel member-visibility-panel section-gap"><div className="panel-heading"><div><h2>Privacidade dos Membros</h2><p>Defina quais janelas e informações consolidadas os Membros desta holding podem consultar.</p></div><Eye size={17} color="#80e2b0" /></div><div className="visibility-options">{([
      ["showTotalAssets", "Patrimônio total proporcional", "Exibe o patrimônio conforme a participação de cada Membro."],
      ["showPropertyValues", "Valores individuais dos imóveis", "Exibe avaliação proporcional por imóvel."],
      ["showRentalInfo", "Informações de aluguel", "Exibe a receita líquida mensal proporcional, após despesas."],
      ["showPropertyStatus", "Status dos imóveis", "Exibe ocupação e situação dos imóveis."],
      ["showPhotos", "Fotos", "Libera fotos autorizadas."],
      ["showLocations", "Localizações", "Exibe endereço, cidade e estado."],
      ["showMap", "Mapa", "Libera o mapa e os marcadores."],
      ["showDocuments", "Documentos", "Libera documentos autorizados."],
      ["showOwnershipByBeneficiary", "Participações por beneficiário", "Exibe a divisão percentual consolidada."],
    ] as Array<[keyof MemberVisibility, string, string]>).map(([key, label, description]) => <label className="visibility-option" key={key}><span><strong>{label}</strong><small>{description}</small></span><input type="checkbox" checked={visibility[key]} onChange={() => setVisibility((current) => ({ ...current, [key]: !current[key] }))} /></label>)}</div><div className="onboarding-actions"><span className="muted">As alterações afetam todos os Membros desta holding.</span><button type="button" className="button button-primary" onClick={() => void saveMemberVisibility()} disabled={visibilitySaving}><Save size={14} /> {visibilitySaving ? "Salvando…" : "Salvar privacidade"}</button></div></section>}
    {deletingMember && <div className="modal-backdrop"><section className="edit-modal"><div className="panel-heading"><div><h2>Remover membro sem acesso</h2><p>O que deseja fazer com as responsabilidades, receitas e despesas de {deletingMember.full_name}?</p></div><button type="button" className="icon-btn" onClick={() => setDeletingMember(null)} aria-label="Fechar"><X size={16} /></button></div><label className="form-grid-label">Atribuir a outro sócio<select className="filter-select full-width" value={replacementId} onChange={(event) => setReplacementId(event.target.value)}><option value="">Não atribuir · Holding</option>{replacementOptions.map((member) => <option key={member.member_id} value={member.member_id}>{member.full_name} · {Number(member.ownership_percentage || 0).toFixed(2).replace(".", ",")}%</option>)}</select></label><p className="muted organization-note">As despesas vinculadas serão transferidas para a pessoa escolhida. A participação será redistribuída entre os membros restantes.</p><div className="onboarding-actions"><button type="button" className="button button-ghost" onClick={() => setDeletingMember(null)}>Cancelar</button><button type="button" className="button button-primary" onClick={() => void deletePlaceholder()}>Confirmar remoção</button></div></section></div>}
  </div>;
}
