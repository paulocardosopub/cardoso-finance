"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bell, Building2, Check, ChevronDown, FileText, Home, Landmark, LayoutDashboard, LogOut, MapPinned, Menu, Receipt, Settings2, Users, WalletCards, X } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import { usePortfolio } from "@/components/portfolio-provider";

const primaryNav = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/patrimonio", label: "Patrimônio", icon: Landmark },
  { href: "/imoveis", label: "Imóveis", icon: Building2 },
  { href: "/financeiro", label: "Financeiro", icon: WalletCards },
  { href: "/despesas", label: "Despesas", icon: Receipt },
  { href: "/mapa", label: "Mapa", icon: MapPinned },
];
const managementNav = [
  { href: "/organizacao", label: "Organização", icon: Users },
  { href: "/documentos", label: "Documentos", icon: FileText },
  { href: "/configuracoes", label: "Configurações", icon: Settings2 },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [holdingsOpen, setHoldingsOpen] = useState(false);
  const [holdingMessage, setHoldingMessage] = useState("");
  const { organizationId, organizationName, userName, userInitials, userAvatarUrl, holdings, pendingInvitations, role, notifications, switchOrganization, setPrimaryOrganization, acceptInvitation, declineInvitation, refresh } = usePortfolio();
  const route = pathname.replace(/\/+$/, "");
  const isPublic = route.endsWith("/login") || route.endsWith("/onboarding");
  useEffect(() => {
    if (isPublic) return;
    const key = `cardoso-scroll:${pathname}`;
    const restore = () => {
      const saved = Number(window.sessionStorage.getItem(key));
      if (Number.isFinite(saved) && saved > 0) window.scrollTo({ top: saved, behavior: "auto" });
    };
    const save = () => window.sessionStorage.setItem(key, String(window.scrollY));
    const onVisibility = () => { if (document.visibilityState === "visible") window.requestAnimationFrame(restore); else save(); };
    window.history.scrollRestoration = "manual";
    window.addEventListener("scroll", save, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    window.requestAnimationFrame(restore);
    return () => { save(); window.removeEventListener("scroll", save); document.removeEventListener("visibilitychange", onVisibility); };
  }, [isPublic, pathname]);
  if (isPublic) return <>{children}</>;

  async function signOut() {
    const supabase = createSupabaseBrowserClient();
    await supabase?.auth.signOut();
    router.push("/login");
  }
  async function leaveHolding() {
    if (!organizationId || role === "owner") { setHoldingMessage("O proprietário não pode sair da holding."); return; }
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;
    const result = await supabase.rpc("leave_organization", { target_org: organizationId });
    if (result.error) { setHoldingMessage(result.error.message); return; }
    const next = holdings.find((holding) => holding.id !== organizationId);
    setHoldingsOpen(false);
    if (next) switchOrganization(next.id); else await refresh();
  }
  async function acceptHoldingInvitation(invitationId: string) {
    const result = await acceptInvitation(invitationId);
    setHoldingMessage(result.ok ? "Convite aceito. Holding adicionada à sua conta." : (result.message ?? "Não foi possível aceitar o convite."));
    if (result.ok) setHoldingsOpen(false);
  }
  async function declineHoldingInvitation(invitationId: string) {
    const result = await declineInvitation(invitationId);
    setHoldingMessage(result.ok ? "Convite recusado." : (result.message ?? "Não foi possível recusar o convite."));
  }
  async function makePrimaryHolding(holdingId: string) {
    const result = await setPrimaryOrganization(holdingId);
    setHoldingMessage(result.ok ? "Holding principal atualizada." : (result.message ?? "Não foi possível definir a holding principal."));
  }

  return <div className="app-shell">
    <aside className={open ? "sidebar open" : "sidebar"}>
      <div className="brand"><div className="brand-mark">C</div><div className="brand-name">Cardoso <span>Finance</span></div><button className="icon-btn mobile-menu" onClick={() => setOpen(false)} aria-label="Fechar menu"><X size={17} /></button></div>
      <div className="org-switcher-shell">
        <button className="org-switcher" aria-expanded={holdingsOpen} onClick={() => { setHoldingsOpen((current) => !current); setHoldingMessage(""); }}><div className="org-icon"><Building2 size={14} /></div><div className="org-meta"><strong>{organizationName}</strong><small>Dados sincronizados</small></div><ChevronDown size={14} color="#8490a5" /></button>
        {holdingsOpen && <div className="holding-menu" role="menu">
          {pendingInvitations.length > 0 && <div className="holding-invites"><div className="holding-menu-title">Convites pendentes</div>{pendingInvitations.map((invitation) => <div className="holding-invite" key={invitation.id}><div><strong>{invitation.organizationName}</strong><small>Convite como {invitation.role}</small></div><div className="holding-invite-actions"><button type="button" className="invite-accept" onClick={() => void acceptHoldingInvitation(invitation.id)} aria-label={`Aceitar convite de ${invitation.organizationName}`}><Check size={13} /></button><button type="button" className="invite-decline" onClick={() => void declineHoldingInvitation(invitation.id)} aria-label={`Recusar convite de ${invitation.organizationName}`}><X size={13} /></button></div></div>)}</div>}
          <div className="holding-menu-title">Suas holdings</div>
          {holdings.map((holding) => <div role="menuitem" key={holding.id} className={holding.id === organizationId ? "holding-option active" : "holding-option"}><button type="button" className="holding-select" onClick={() => { switchOrganization(holding.id); setHoldingsOpen(false); }}><span>{holding.name}</span><small>{holding.role}</small></button><span role="radio" aria-checked={holding.isPrimary} tabIndex={0} className={holding.isPrimary ? "holding-primary-dot active" : "holding-primary-dot"} onClick={(event) => { event.stopPropagation(); void makePrimaryHolding(holding.id); }} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); void makePrimaryHolding(holding.id); } }} title={holding.isPrimary ? "Holding principal" : "Definir como principal"} /></div>)}
          <Link href="/organizacao" className="holding-action" onClick={() => setHoldingsOpen(false)}><Building2 size={14} /> Adicionar holding</Link>
          <button type="button" className="holding-action holding-leave" onClick={() => void leaveHolding()} disabled={role === "owner"}><LogOut size={14} /> {role === "owner" ? "Proprietário da holding" : "Sair desta holding"}</button>
          {holdingMessage && <p className="holding-message">{holdingMessage}</p>}
        </div>}
      </div>
      <div className="nav-label">Visão geral</div>
      <nav className="nav">{primaryNav.map(({ href, label, icon: Icon }) => <Link key={href} href={href} onClick={() => setOpen(false)} className={pathname === href || (href !== "/" && pathname.startsWith(href)) ? "nav-link active" : "nav-link"}><Icon size={16} strokeWidth={1.8} />{label}</Link>)}</nav>
      <div className="nav-label" style={{ marginTop: 25 }}>Gestão</div>
      <nav className="nav">{managementNav.map(({ href, label, icon: Icon }) => <Link key={href} href={href} onClick={() => setOpen(false)} className={pathname.startsWith(href) ? "nav-link active" : "nav-link"}><Icon size={16} strokeWidth={1.8} />{label}</Link>)}</nav>
      <div className="sidebar-bottom"><div className="profile-mini"><div className="avatar">{userAvatarUrl ? <img src={userAvatarUrl} alt={`Foto de ${userName}`} /> : userInitials}</div><div><strong>{userName}</strong><small>Conta autenticada</small></div><button className="icon-btn" onClick={signOut} aria-label="Sair"><LogOut size={14} /></button></div></div>
    </aside>
    <main className="main"><header className="topbar"><button className="icon-btn mobile-menu" onClick={() => setOpen(true)} aria-label="Abrir menu"><Menu size={20} /></button><div className="breadcrumb"><Home size={13} /><span>/</span><strong>{pathname === "/" ? "Visão geral" : pathname.slice(1).replaceAll("-", " ")}</strong></div><div className="top-actions"><button className={notifications.length ? "icon-btn notification-dot" : "icon-btn"} aria-label="Notificações"><Bell size={17} /></button><div className="avatar" style={{ width: 27, height: 27, fontSize: 10 }}>{userAvatarUrl ? <img src={userAvatarUrl} alt={`Foto de ${userName}`} /> : userInitials}</div></div></header>{children}</main>
  </div>;
}
