"use client";

import { Camera, Check, Save, Settings2, ShieldCheck, UserRound, X } from "lucide-react";
import { useEffect, useState } from "react";
import { usePortfolio } from "@/components/portfolio-provider";
import { createSupabaseBrowserClient } from "@/lib/supabase";

export default function ConfiguracoesPage() {
  const { userName, userEmail, userPhone, userAvatarUrl, role, refresh } = usePortfolio();
  const [name, setName] = useState(userName);
  const [phone, setPhone] = useState(userPhone);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [removeAvatar, setRemoveAvatar] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => { setName(userName); setPhone(userPhone); }, [userName, userPhone]);

  function selectAvatar(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
    setRemoveAvatar(false);
    event.currentTarget.value = "";
  }

  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) { setMessage("Informe seu nome."); return; }
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;
    const user = (await supabase.auth.getUser()).data.user;
    if (!user) { setMessage("Sua sessão expirou. Entre novamente."); return; }
    setSaving(true);
    setMessage("");
    let avatarUrl: string | null = removeAvatar ? null : userAvatarUrl || null;
    if (avatarFile) {
      const extension = avatarFile.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${user.id}/${crypto.randomUUID()}.${extension}`;
      const upload = await supabase.storage.from("profile-avatars").upload(path, avatarFile, { upsert: false, contentType: avatarFile.type || "image/jpeg" });
      if (upload.error) { setMessage(`Não foi possível enviar a foto: ${upload.error.message}`); setSaving(false); return; }
      avatarUrl = supabase.storage.from("profile-avatars").getPublicUrl(path).data.publicUrl;
    }
    const profile = { id: user.id, full_name: name.trim(), phone: phone.trim(), avatar_url: avatarUrl };
    const result = await supabase.from("profiles").upsert(profile, { onConflict: "id" });
    if (result.error) setMessage(result.error.message);
    else {
      // Keep the auth metadata in sync as a fallback for screens that read the
      // user directly instead of joining the profiles table.
      const authUpdate = await supabase.auth.updateUser({ data: { full_name: name.trim(), phone: phone.trim() } });
      if (authUpdate.error) setMessage(`Perfil salvo, mas não foi possível sincronizar o nome de acesso: ${authUpdate.error.message}`);
      else setMessage("Perfil atualizado com sucesso.");
      setAvatarFile(null); setAvatarPreview(null); setRemoveAvatar(false); await refresh();
    }
    setSaving(false);
  }

  const displayedAvatar = avatarPreview || (!removeAvatar ? userAvatarUrl : "");
  return <div className="content"><div className="page-heading"><div><div className="eyebrow"><Settings2 size={13} /> Preferências</div><h1>Configurações</h1><p className="subtitle">Personalize seu perfil e as preferências da sua conta.</p></div></div>
    {message && <p className={message.startsWith("Não") || message.startsWith("Informe") || message.startsWith("Sua") ? "form-error" : "form-success"}><Check size={13} /> {message}</p>}
    <div className="dashboard-grid settings-grid"><form className="panel" onSubmit={saveProfile}><div className="panel-heading"><div><h2>Meu perfil</h2><p>Estas informações aparecem na sua conta e nas mensagens do dashboard.</p></div><UserRound size={17} color="#80e2b0" /></div><div className="profile-editor"><div className="profile-avatar-large">{displayedAvatar ? <img src={displayedAvatar} alt={`Foto de ${name}`} /> : <span>{name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "US"}</span>}</div><div><label className="button button-ghost profile-photo-button"><Camera size={14} /> {displayedAvatar ? "Trocar foto" : "Adicionar foto"}<input type="file" accept="image/*" onChange={selectAvatar} /></label>{displayedAvatar && <button type="button" className="text-button profile-remove" onClick={() => { setAvatarFile(null); setAvatarPreview(null); setRemoveAvatar(true); }}><X size={12} /> Remover foto</button>}<small className="muted profile-photo-help">JPG, PNG ou WebP · recorte circular automático</small></div></div><div className="form-grid settings-form"><label>Nome completo<input value={name} onChange={(event) => setName(event.target.value)} required /></label><label>E-mail<input value={userEmail} readOnly /></label><label>Telefone<input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="(00) 00000-0000" /></label></div><div className="onboarding-actions"><span className="muted">Seu e-mail é usado para acesso.</span><button type="submit" className="button button-primary" disabled={saving}>{saving ? "Salvando…" : <><Save size={14} /> Salvar perfil</>}</button></div></form>
      <div className="panel"><div className="panel-heading"><div><h2>Preferências da conta</h2><p>Configurações gerais do aplicativo.</p></div><Settings2 size={17} color="#80e2b0" /></div><div className="setting-row"><span>Moeda exibida</span><strong>BRL · Real brasileiro</strong></div><div className="setting-row"><span>Participação e lucros</span><strong>Percentuais da holding</strong></div><div className="setting-row"><span>Perfil atual</span><strong>{role === "owner" ? "Proprietário" : role === "admin" ? "Administrador" : role === "manager" ? "Gestor" : "Leitor"}</strong></div><div className="setting-row"><span>Notificações</span><strong className="positive">Ativas</strong></div><div className="settings-help"><ShieldCheck size={15} /><span>Os dados de cada holding continuam separados. Novos usuários começam com a conta vazia até entrarem em uma organização.</span></div></div>
    </div>
  </div>;
}
