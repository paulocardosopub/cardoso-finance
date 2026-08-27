"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowUpRight, Bell, Building2, Check, ChevronDown, CircleDollarSign, FileText, History, Home, Landmark, LayoutDashboard, LogOut, MapPinned, Menu, Receipt, Settings2, Users, WalletCards, X } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import { usePortfolio } from "@/components/portfolio-provider";
import { employeeRouteAllowed, memberRouteAllowed, roleLabels } from "@/lib/member-access";

const primaryNav = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/patrimonio", label: "Patrimônio", icon: Landmark },
  { href: "/imoveis", label: "Imóveis", icon: Building2 },
  { href: "/financeiro", label: "Financeiro", icon: WalletCards },
  { href: "/despesas", label: "Despesas", icon: Receipt },
  { href: "/alugueis", label: "Aluguéis", icon: CircleDollarSign },
  { href: "/creditos", label: "Créditos", icon: ArrowUpRight },
  { href: "/mapa", label: "Mapa", icon: MapPinned },
];
const managementNav = [
  { href: "/organizacao", label: "Organização", icon: Users },
  { href: "/documentos", label: "Documentos", icon: FileText },
  { href: "/configuracoes", label: "Configurações", icon: Settings2 },
];
const memberNav = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/imoveis", label: "Imóveis", icon: Building2 },
  { href: "/patrimonio", label: "Patrimônio", icon: Landmark },
  { href: "/despesas", label: "Despesas", icon: Receipt },
  { href: "/creditos", label: "Créditos", icon: ArrowUpRight },
  { href: "/mapa", label: "Mapas", icon: MapPinned },
  { href: "/documentos", label: "Documentos", icon: FileText },
  { href: "/configuracoes", label: "Configurações", icon: Settings2 },
];
const employeeNav = [
  { href: "/", label: "Painel operacional", icon: LayoutDashboard },
  { href: "/imoveis", label: "Imóveis", icon: Building2 },
  { href: "/historico-pagamentos", label: "Histórico de pagamentos", icon: History },
  { href: "/mapa", label: "Mapa e visitas", icon: MapPinned },
  { href: "/despesas-variaveis", label: "Despesas variáveis", icon: Receipt },
  { href: "/configuracoes", label: "Configurações", icon: Settings2 },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [holdingsOpen, setHoldingsOpen] = useState(false);
  const [holdingMessage, setHoldingMessage] = useState("");
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const { organizationId, organizationName, userName, userInitials, userAvatarUrl, holdings, pendingInvitations, role, viewAs, viewAsMemberId, previewMembers, setViewAs, setViewAsMember, notifications, loading, switchOrganization, setPrimaryOrganization, acceptInvitation, declineInvitation, refresh } = usePortfolio();
  const route = pathname.replace(/\/+$/, "");
  const isPublic = route.endsWith("/login") || route.endsWith("/onboarding");
  const canPreviewRoles = !loading && holdings.some((holding) => holding.id === organizationId && (holding.role === "owner" || holding.role === "admin" || holding.role === "manager"));
  // Keep preview navigation restricted even if a refresh briefly retains the
  // previous management role while the provider resolves the current view.
  const menuRole = loading ? "viewer" : canPreviewRoles && viewAs !== "actual" ? viewAs : role;
  useEffect(() => { setHydrated(true); }, []);
  useEffect(() => {
    if (isPublic) return;
    const key = `cardoso-scroll:${pathname}`;
    const restore = () => {
      if (loading) return;
      const saved = Number(window.sessionStorage.getItem(key));
      if (Number.isFinite(saved) && saved > 0) window.scrollTo({ top: saved, behavior: "auto" });
    };
    const scheduleRestore = () => {
      if (loading) return;
      window.requestAnimationFrame(() => window.requestAnimationFrame(restore));
      window.setTimeout(restore, 180);
    };
    const save = () => {
      // Do not overwrite a saved list position with the temporary zero scroll
      // produced while the provider is refreshing after a payment.
      if (!loading || window.scrollY > 0) window.sessionStorage.setItem(key, String(window.scrollY));
    };
    const onVisibility = () => { if (document.visibilityState === "visible") scheduleRestore(); else save(); };
    const onPageShow = () => scheduleRestore();
    window.history.scrollRestoration = "manual";
    window.addEventListener("scroll", save, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pageshow", onPageShow);
    scheduleRestore();
    return () => { save(); window.removeEventListener("scroll", save); document.removeEventListener("visibilitychange", onVisibility); window.removeEventListener("pageshow", onPageShow); };
  }, [isPublic, loading, pathname]);
  useEffect(() => {
    if (isPublic) return;
    const onTouchStart = (event: TouchEvent) => {
      if (window.innerWidth > 760 || event.touches.length !== 1) return;
      const touch = event.touches[0];
      if (touch.clientX <= 28 || (open && touch.clientX <= 300)) touchStart.current = { x: touch.clientX, y: touch.clientY };
    };
    const onTouchEnd = (event: TouchEvent) => {
      const start = touchStart.current;
      touchStart.current = null;
      if (!start || window.innerWidth > 760 || event.changedTouches.length !== 1) return;
      const touch = event.changedTouches[0];
      const deltaX = touch.clientX - start.x;
      const deltaY = touch.clientY - start.y;
      if (Math.abs(deltaX) < 60 || Math.abs(deltaX) < Math.abs(deltaY) * 1.35) return;
      if (!open && start.x <= 28 && deltaX > 0) setOpen(true);
      if (open && start.x <= 300 && deltaX < 0) setOpen(false);
    };
    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => { document.removeEventListener("touchstart", onTouchStart); document.removeEventListener("touchend", onTouchEnd); };
  }, [isPublic, open]);
  useEffect(() => {
    if (!isPublic && !loading && organizationId && role === "viewer" && !memberRouteAllowed(pathname)) router.replace("/");
    if (!isPublic && !loading && organizationId && role === "employee" && !employeeRouteAllowed(pathname)) router.replace("/");
  }, [isPublic, loading, organizationId, pathname, role, router]);
  if (isPublic) return <>{children}</>;
  // Never render the previous role's navigation or data while the session,
  // holding, or view-as mode is being resolved. This prevents a management
  // menu from flashing during refresh for members and employees.
  if (!hydrated || loading) return <main className="auth-page" aria-busy="true"><div className="empty-state"><p>Carregando sua área segura…</p></div></main>;
  if (!loading && organizationId && ((role === "viewer" && !memberRouteAllowed(pathname)) || (role === "employee" && !employeeRouteAllowed(pathname)))) return <main className="auth-page" aria-busy="true" />;

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
          {menuRole !== "viewer" && pendingInvitations.length > 0 && <div className="holding-invites"><div className="holding-menu-title">Convites pendentes</div>{pendingInvitations.map((invitation) => <div className="holding-invite" key={invitation.id}><div><strong>{invitation.organizationName}</strong><small>Convite como {roleLabels[invitation.role]}</small></div><div className="holding-invite-actions"><button type="button" className="invite-accept" onClick={() => void acceptHoldingInvitation(invitation.id)} aria-label={`Aceitar convite de ${invitation.organizationName}`}><Check size={13} /></button><button type="button" className="invite-decline" onClick={() => void declineHoldingInvitation(invitation.id)} aria-label={`Recusar convite de ${invitation.organizationName}`}><X size={13} /></button></div></div>)}</div>}
          <div className="holding-menu-title">Suas holdings</div>
          {holdings.map((holding) => <div role="menuitem" key={holding.id} className={holding.id === organizationId ? "holding-option active" : "holding-option"}><button type="button" className="holding-select" onClick={() => { switchOrganization(holding.id); setHoldingsOpen(false); }}><span>{holding.name}</span><small>{roleLabels[holding.role]}</small></button>{menuRole !== "viewer" && <span role="radio" aria-checked={holding.isPrimary} tabIndex={0} className={holding.isPrimary ? "holding-primary-dot active" : "holding-primary-dot"} onClick={(event) => { event.stopPropagation(); void makePrimaryHolding(holding.id); }} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); void makePrimaryHolding(holding.id); } }} title={holding.isPrimary ? "Holding principal" : "Definir como principal"} />}</div>)}
          {menuRole !== "viewer" && <Link href="/organizacao" className="holding-action" onClick={() => setHoldingsOpen(false)}><Building2 size={14} /> Adicionar holding</Link>}
          {menuRole !== "viewer" && <button type="button" className="holding-action holding-leave" onClick={() => void leaveHolding()} disabled={menuRole === "owner"}><LogOut size={14} /> {menuRole === "owner" ? "Proprietário da holding" : "Sair desta holding"}</button>}
          {holdingMessage && <p className="holding-message">{holdingMessage}</p>}
        </div>}
      </div>
      <div className="nav-label">{menuRole === "viewer" ? "Consulta" : menuRole === "employee" ? "Operação" : "Visão geral"}</div>
      <nav className="nav">{(menuRole === "viewer" ? memberNav : menuRole === "employee" ? employeeNav : primaryNav).map(({ href, label, icon: Icon }) => <Link key={href} href={href} onClick={() => setOpen(false)} className={pathname === href || (href !== "/" && pathname.startsWith(href)) ? "nav-link active" : "nav-link"}><Icon size={16} strokeWidth={1.8} />{label}</Link>)}</nav>
      {menuRole !== "viewer" && menuRole !== "employee" && <><div className="nav-label" style={{ marginTop: 25 }}>Gestão</div><nav className="nav">{managementNav.map(({ href, label, icon: Icon }) => <Link key={href} href={href} onClick={() => setOpen(false)} className={pathname.startsWith(href) ? "nav-link active" : "nav-link"}><Icon size={16} strokeWidth={1.8} />{label}</Link>)}</nav></>}
      <div className="sidebar-bottom"><div className="profile-mini"><div className="avatar">{userAvatarUrl ? <img src={userAvatarUrl} alt={`Foto de ${userName}`} /> : userInitials}</div><div><strong>{userName}</strong><small>{roleLabels[menuRole]}</small></div><button className="icon-btn" onClick={signOut} aria-label="Sair"><LogOut size={14} /></button></div></div>
    </aside>
    <main className="main"><header className="topbar"><button className="icon-btn mobile-menu" onClick={() => setOpen(true)} aria-label="Abrir menu"><Menu size={20} /></button><div className="breadcrumb"><Home size={13} /><span>/</span><strong>{pathname === "/" ? menuRole === "employee" ? "Painel operacional" : "Visão geral" : pathname.slice(1).replaceAll("-", " ")}</strong></div><div className="top-actions">{canPreviewRoles && <div className="view-as-control"><label><span>Visualizar como</span><select value={viewAs} onChange={(event) => setViewAs(event.target.value as "actual" | "viewer" | "employee")} aria-label="Visualizar como"><option value="actual">Gestor</option><option value="viewer">Membro</option><option value="employee">Funcionária</option></select></label>{viewAs === "viewer" && <select value={viewAsMemberId ?? ""} onChange={(event) => setViewAsMember(event.target.value || null)} aria-label="Membro visualizado"><option value="" disabled>Selecionar membro</option>{previewMembers.map((member) => { const ref = member.userId ? `user:${member.userId}` : member.contactId ? `contact:${member.contactId}` : member.memberId; return <option value={ref} key={member.memberId}>{member.name}{member.isPlaceholder ? " · sem acesso" : ""}</option>; })}</select>}</div>}{menuRole !== "viewer" && menuRole !== "employee" && <button className={notifications.length ? "icon-btn notification-dot" : "icon-btn"} aria-label="Notificações"><Bell size={17} /></button>}<div className="avatar" style={{ width: 27, height: 27, fontSize: 10 }}>{userAvatarUrl ? <img src={userAvatarUrl} alt={`Foto de ${userName}`} /> : userInitials}</div></div></header>{children}</main>
  </div>;
}
