"use client";

import { Building2, CheckCircle2, MailPlus, Plus, ShieldCheck, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { usePortfolio } from "@/components/portfolio-provider";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import { syncInitialPortfolio } from "@/lib/portfolio-sync";

type MemberRole = "owner" | "admin" | "manager" | "viewer";

type Member = {
  user_id: string;
  full_name: string;
  email: string;
  role: MemberRole;
  ownership_percentage: number;
  joined_at: string;
};

const roleLabels: Record<MemberRole, string> = {
  owner: "Proprietário",
  admin: "Administrador",
  manager: "Gestor",
  viewer: "Leitor",
};

export default function OrganizationPage() {
  const { organizationId, organizationName, role, refresh } = usePortfolio();
  const [members, setMembers] = useState<Member[]>([]);
  const [email, setEmail] = useState("");
  const [holdingName, setHoldingName] = useState("");
  const [message, setMessage] = useState("");
  const [membersLoading, setMembersLoading] = useState(false);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [roleSaving, setRoleSaving] = useState<string | null>(null);

  async function loadMembers() {
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
  }

  useEffect(() => {
    void loadMembers();
  }, [organizationId]);

  async function updateMemberRole(member: Member, newRole: MemberRole) {
    if (!organizationId || role === "viewer" || member.role === newRole) return;
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;
    setRoleSaving(member.user_id);
    setMessage("");
    const result = await supabase.rpc("update_member_role", {
      target_org: organizationId,
      target_user: member.user_id,
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

  async function invite() {
    const normalizedEmail = email.trim().toLowerCase();
    if (!organizationId || !normalizedEmail || role === "viewer") return;
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;
    setInviteLoading(true);
    setMessage("");
    const result = await supabase.rpc("create_invitation", { target_org: organizationId, target_email: normalizedEmail, target_role: "viewer" });
    if (result.error) {
      setMessage(result.error.message === "not_authorized" ? "Seu perfil não pode convidar usuários." : result.error.message);
      setInviteLoading(false);
      return;
    }
    const invitation = (Array.isArray(result.data) ? result.data[0] : result.data) as { result_code?: string } | null;
    if (invitation?.result_code === "user_not_found") setMessage("Não encontramos uma conta com esse e-mail. A pessoa precisa criar o acesso primeiro.");
    else if (invitation?.result_code === "already_member") setMessage("Esse usuário já faz parte desta holding.");
    else if (invitation?.result_code === "already_pending") setMessage("Usuário encontrado. Já existe um convite pendente para esse e-mail.");
    else if (invitation?.result_code === "created") { setMessage("Usuário encontrado. Convite enviado com sucesso."); setEmail(""); }
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

  const canManage = role === "owner" || role === "admin";

  return <div className="content">
    <div className="page-heading">
      <div><div className="eyebrow"><Users size={13} /> Governança</div><h1>Organização</h1><p className="subtitle">{organizationName} · membros e permissões da holding.</p></div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><input className="table-filter" value={holdingName} onChange={(event) => setHoldingName(event.target.value)} placeholder="Nome da nova holding" /><button className="button button-primary" onClick={createHolding} disabled={role === "viewer" || !holdingName.trim()}><Plus size={14} /> Criar holding</button></div>
    </div>
    {message && <p className={message.startsWith("Não") || message.startsWith("Seu perfil") || message.startsWith("Você") ? "form-error" : "form-success"}><CheckCircle2 size={13} /> {message}</p>}
    <div className="dashboard-grid">
      <div className="panel">
        <div className="panel-heading"><div><h2>Membros</h2><p>{membersLoading ? "Carregando membros…" : `${members.length} membro(s) com acesso`}</p></div><ShieldCheck size={17} color="#80e2b0" /></div>
        {members.length ? <div className="table-wrap"><table><thead><tr><th>Usuário</th><th>Função</th><th>Entrada</th></tr></thead><tbody>{members.map((member) => <tr key={member.user_id}><td><strong>{member.full_name || "Usuário autenticado"}</strong><span className="member-email">{member.email}</span></td><td>{member.role === "owner" || !canManage ? <span className="tag">{roleLabels[member.role]}</span> : <select className="filter-select member-role-select" value={member.role} disabled={roleSaving === member.user_id} onChange={(event) => void updateMemberRole(member, event.target.value as MemberRole)}><option value="viewer">Leitor</option><option value="manager">Gestor</option><option value="admin">Administrador</option></select>}</td><td className="muted">{member.joined_at ? new Date(member.joined_at).toLocaleDateString("pt-BR") : "—"}</td></tr>)}</tbody></table></div> : <div className="empty-state"><Users size={30} /><h3>Nenhum membro cadastrado</h3><p>Crie uma organização para começar.</p></div>}
        <p className="muted organization-note">O proprietário não pode ser removido. Administradores podem ajustar os demais membros entre Leitor, Gestor e Administrador.</p>
      </div>
      <div className="panel"><div className="panel-heading"><div><h2>Acesso</h2><p>Convites e isolamento de dados</p></div><Building2 size={17} color="#80e2b0" /></div><div className="setting-row"><span>Organização ativa</span><strong>{organizationName}</strong></div><div className="setting-row"><span>Seu perfil</span><strong>{roleLabels[role as MemberRole] ?? role}</strong></div><div className="setting-row"><span>Proteção</span><strong className="positive">RLS ativo</strong></div><div className="setting-row"><span>Convidar por e-mail</span><span style={{ display: "flex", gap: 6 }}><input className="table-filter" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="email da conta" type="email" /><button className="icon-btn" onClick={() => void invite()} disabled={role === "viewer" || inviteLoading || !email.trim()} aria-label="Enviar convite"><MailPlus size={15} /></button></span></div><p className="muted invite-help">O e-mail é verificado antes do convite ser criado. O usuário poderá aceitar ou recusar no menu de holdings.</p></div>
    </div>
  </div>;
}
