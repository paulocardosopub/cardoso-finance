"use client";

import Link from "next/link";
import { ArrowRight, LockKeyhole, Mail, Sparkles } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient, hasSupabaseEnv } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const [submitted, setSubmitted] = useState(false);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [error, setError] = useState("");
  const isSignup = mode === "signup";
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    const form = new FormData(event.currentTarget); const email = String(form.get("email")); const password = String(form.get("password"));
    if (!hasSupabaseEnv) { setSubmitted(true); return; }
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;
    const result = isSignup ? await supabase.auth.signUp({ email, password, options: { data: { full_name: String(form.get("name") ?? "") } } }) : await supabase.auth.signInWithPassword({ email, password });
    if (result.error) { setError(result.error.message); return; }
    if (isSignup) { setSubmitted(true); return; }
    router.push("/"); router.refresh();
  }
  return <main className="auth-page"><div className="auth-glow" /><div className="auth-brand"><div className="brand-mark">C</div><div className="brand-name">Cardoso <span>Finance</span></div></div><div className="auth-card"><div className="eyebrow"><Sparkles size={13} /> Login Supabase</div><h1>{isSignup ? "Crie seu acesso." : "Acesse sua conta."}</h1><p className="subtitle">{isSignup ? "Crie uma conta para administrar seus dados." : "O login definitivo substituirá a senha provisória."}</p>{submitted ? <div className="auth-success"><div className="success-mark">✓</div><h2>{isSignup && hasSupabaseEnv ? "Confirme seu email" : "Solicitação registrada"}</h2><p>{isSignup && hasSupabaseEnv ? "Enviamos um link de confirmação para o seu email." : "O cadastro será ativado quando a autenticação for liberada."}</p><Link href="/" className="button button-primary">Voltar ao app <ArrowRight size={14} /></Link></div> : <form onSubmit={submit}>{isSignup && <label>Nome completo<input name="name" placeholder="Seu nome" required /><Mail size={15} /></label>}<label>Email<input name="email" type="email" placeholder="voce@empresa.com" required /><Mail size={15} /></label><label>Senha<input name="password" type="password" placeholder="Mínimo de 6 caracteres" minLength={6} required /><LockKeyhole size={15} /></label>{error && <p className="form-error">{error}</p>}{!isSignup && <div className="form-row"><label className="check"><input type="checkbox" /> Lembrar de mim</label><a href="#recovery">Esqueci minha senha</a></div>}<button className="button button-primary" type="submit" style={{ width: "100%", marginTop: 20 }}>{isSignup ? "Criar conta" : "Entrar"} <ArrowRight size={15} /></button></form>}<div className="auth-divider"><span>ou</span></div><p className="auth-foot">{isSignup ? "Já tem uma conta?" : "Ainda não tem uma conta?"} <button className="text-button" onClick={() => { setMode(isSignup ? "signin" : "signup"); setError(""); }}>{isSignup ? "Entrar" : "Criar conta"}</button></p></div><p className="auth-legal">Ambiente protegido · Dados isolados por organização.</p></main>;
}
