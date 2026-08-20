"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Building2, ChevronDown, FileText, Home, Landmark, LayoutDashboard, LogOut, Menu, Settings2, Users, WalletCards, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import { usePortfolio } from "@/components/portfolio-provider";

const primaryNav = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/patrimonio", label: "Patrimônio", icon: Landmark },
  { href: "/imoveis", label: "Imóveis", icon: Building2 },
  { href: "/financeiro", label: "Financeiro", icon: WalletCards },
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
  const { organizationName, notifications } = usePortfolio();
  const isPublic = pathname === "/login" || pathname === "/onboarding";
  if (isPublic) return <>{children}</>;
  async function signOut() {
    const supabase = createSupabaseBrowserClient();
    await supabase?.auth.signOut();
    router.push("/login");
  }
  return <div className="app-shell">
    <aside className={`sidebar ${open ? "open" : ""}`}>
      <div className="brand"><div className="brand-mark">C</div><div className="brand-name">Cardoso <span>Finance</span></div><button className="icon-btn mobile-menu" onClick={() => setOpen(false)} aria-label="Fechar menu"><X size={17} /></button></div>
      <div className="org-switcher"><div className="org-icon"><Building2 size={14} /></div><div className="org-meta"><strong>{organizationName}</strong><small>Dados sincronizados</small></div><ChevronDown size={14} color="#8490a5" /></div>
      <div className="nav-label">Visão geral</div>
      <nav className="nav">{primaryNav.map(({ href, label, icon: Icon }) => <Link key={href} href={href} onClick={() => setOpen(false)} className={`nav-link ${pathname === href || (href !== "/" && pathname.startsWith(href)) ? "active" : ""}`}><Icon size={16} strokeWidth={1.8} />{label}</Link>)}</nav>
      <div className="nav-label" style={{ marginTop: 25 }}>Gestão</div>
      <nav className="nav">{managementNav.map(({ href, label, icon: Icon }) => <Link key={href} href={href} onClick={() => setOpen(false)} className={`nav-link ${pathname.startsWith(href) ? "active" : ""}`}><Icon size={16} strokeWidth={1.8} />{label}</Link>)}</nav>
      <div className="sidebar-bottom"><div className="profile-mini"><div className="avatar">CF</div><div><strong>Conta autenticada</strong><small>Supabase Auth</small></div><button className="icon-btn" onClick={signOut} aria-label="Sair"><LogOut size={14} /></button></div></div>
    </aside>
    <main className="main"><header className="topbar"><button className="icon-btn mobile-menu" onClick={() => setOpen(true)} aria-label="Abrir menu"><Menu size={20} /></button><div className="breadcrumb"><Home size={13} /><span>/</span><strong>{pathname === "/" ? "Visão geral" : pathname.slice(1).replaceAll("-", " ")}</strong></div><div className="top-actions"><button className={`icon-btn ${notifications.length ? "notification-dot" : ""}`} aria-label="Notificações"><Bell size={17} /></button><div className="avatar" style={{ width: 27, height: 27, fontSize: 10 }}>CF</div></div></header>{children}</main>
  </div>;
}
