"use client";

import Link from "next/link";
import { LockKeyhole } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { createSupabaseBrowserClient } from "@/lib/supabase";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const isPublic = pathname.endsWith("/login") || pathname.endsWith("/onboarding");

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    if (!supabase) { setLoading(false); return; }
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setLoading(false); });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => listener.subscription.unsubscribe();
  }, []);

  if (isPublic) return <>{children}</>;
  if (loading) return <main className="auth-page" aria-busy="true" />;
  if (!session) return <main className="auth-page"><div className="auth-glow" /><section className="auth-card"><div className="eyebrow"><LockKeyhole size={13} /> Sessão necessária</div><h1>Entre para continuar.</h1><p className="subtitle">O Cardoso Finance agora protege os dados por usuário e organização.</p><Link href="/login" className="button button-primary" style={{ width: "100%", marginTop: 24 }}>Abrir login</Link></section></main>;
  return <>{children}</>;
}
