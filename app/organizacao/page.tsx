"use client";

import { MailPlus, ShieldCheck, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { usePortfolio } from "@/components/portfolio-provider";
import { createSupabaseBrowserClient } from "@/lib/supabase";

type Member = { user_id: string; role: string; profile?: { full_name?: string } };
export default function OrganizationPage() {
  const { organizationId, organizationName, role } = usePortfolio();
  const [members, setMembers] = useState<Member[]>([]);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => { if (!organizationId) return; const supabase = createSupabaseBrowserClient(); supabase?.from("organization_members").select("user_id, role, profiles(full_name)").eq("organization_id", organizationId).then(({ data }) => setMembers((data ?? []) as Member[])); }, [organizationId]);
  async function invite() { if (!organizationId || !email) return; const supabase = createSupabaseBrowserClient(); if (!supabase) return; const result = await supabase.from("invitations").insert({ organization_id: organizationId, email, role: "viewer", invited_by: (await supabase.auth.getUser()).data.user?.id }); setMessage(result.error?.message ?? "Convite criado. O destinatário poderá aceitar pelo link enviado."); if (!result.error) setEmail(""); }
  return <div className="content"><div className="page-heading"><div><div className="eyebrow"><Users size={13} /> Governança</div><h1>Organização</h1><p className="subtitle">{organizationName} · permissões protegidas por RLS.</p></div><div style={{ display: "flex", gap: 8 }}><input className="table-filter" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="email para convidar" /><button className="button button-primary" onClick={invite} disabled={role === "viewer"}><MailPlus size={14} /> Convidar</button></div></div>{message && <p className="form-success">{message}</p>}<div className="dashboard-grid"><div className="panel"><div className="panel-heading"><div><h2>Membros</h2><p>{members.length} membro(s) com acesso</p></div><ShieldCheck size={17} color="#80e2b0" /></div>{members.length ? <div className="table-wrap"><table><thead><tr><th>Usuário</th><th>Permissão</th></tr></thead><tbody>{members.map((member) => <tr key={member.user_id}><td>{member.profile?.full_name || "Usuário autenticado"}</td><td><span className="tag">{member.role}</span></td></tr>)}</tbody></table></div> : <div className="empty-state"><Users size={30} /><h3>Nenhum membro cadastrado</h3><p>Crie a organização no onboarding para começar.</p></div>}</div><div className="panel"><div className="panel-heading"><div><h2>Acesso</h2><p>Convites e isolamento de dados</p></div></div><div className="setting-row"><span>Organização ativa</span><strong>{organizationName}</strong></div><div className="setting-row"><span>Seu perfil</span><strong>{role}</strong></div><div className="setting-row"><span>Proteção</span><strong className="positive">RLS ativo</strong></div></div></div></div>;
}
