"use client";

import { ArrowRight, KeyRound, LockKeyhole, Mail, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase";

type AuthMode = "signin" | "signup" | "recovery";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>("signin");
  const [submitted, setSubmitted] = useState(false);
  const [recoverySession, setRecoverySession] = useState(false);
  const [error, setError] = useState("");
  const isSignup = mode === "signup";

  useEffect(() => {
    setRecoverySession(window.location.hash.includes("type=recovery"));
  }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const supabase = createSupabaseBrowserClient();
    if (!supabase) { setError("A conexão com o Supabase não está configurada."); return; }
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "");
    const password = String(form.get("password") ?? "");

    if (recoverySession) {
      const result = await supabase.auth.updateUser({ password });
      if (result.error) { setError(result.error.message); return; }
      setSubmitted(true);
      return;
    }
    if (mode === "recovery") {
      const result = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/cardoso-finance/login/` });
      if (result.error) { setError(result.error.message); return; }
      setSubmitted(true);
      return;
    }
    if (isSignup) {
      const result = await supabase.auth.signUp({ email, password, options: { data: { full_name: String(form.get("name") ?? "") } } });
      if (result.error) { setError(result.error.message); return; }
      if (result.data.session) router.push("/onboarding");
      else setSubmitted(true);
      return;
    }
    const result = await supabase.auth.signInWithPassword({ email, password });
    if (result.error) { setError(result.error.message); return; }
    router.push("/");
  }

  const title = recoverySession ? "Defina uma nova senha." : mode === "recovery" ? "Recupere seu acesso." : isSignup ? "Crie seu acesso." : "Acesse sua conta.";
  const subtitle = recoverySession ? "Escolha uma senha nova para sua conta." : mode === "recovery" ? "Enviaremos um link seguro para o seu email." : isSignup ? "Crie uma conta para administrar seus dados." : "Entre para acessar suas organizações e imóveis.";

  return <main className="auth-page"><div className="auth-glow" /><div className="auth-brand"><div className="brand-mark">C</div><div className="brand-name">Cardoso <span>Finance</span></div></div><div className="auth-card"><div className="eyebrow"><Sparkles size={13} /> Login Supabase</div><h1>{title}</h1><p className="subtitle">{subtitle}</p>{submitted ? <div className="auth-success"><div className="success-mark">✓</div><h2>{recoverySession ? "Senha atualizada" : mode === "recovery" ? "Email enviado" : "Cadastro recebido"}</h2><p>{recoverySession ? "Sua senha foi alterada. Entre novamente para continuar." : mode === "recovery" ? "Confira sua caixa de entrada e abra o link para continuar." : "Confirme seu email para ativar a conta e depois entre no app."}</p><button className="button button-primary" onClick={() => { setSubmitted(false); setMode("signin"); setRecoverySession(false); }}>Voltar ao login <ArrowRight size={14} /></button></div> : <form onSubmit={submit}>{isSignup && <label>Nome completo<input name="name" placeholder="Seu nome" required /><Mail size={15} /></label>}{!recoverySession && mode !== "recovery" && <label>Email<input name="email" type="email" placeholder="voce@empresa.com" required /><Mail size={15} /></label>}{mode === "recovery" && <label>Email da conta<input name="email" type="email" placeholder="voce@empresa.com" required /><Mail size={15} /></label>}{(isSignup || mode === "signin" || recoverySession) && <label>{recoverySession ? "Nova senha" : "Senha"}<input name="password" type="password" placeholder="Mínimo de 6 caracteres" minLength={6} required /><LockKeyhole size={15} /></label>}{error && <p className="form-error">{error}</p>}<button className="button button-primary" type="submit" style={{ width: "100%", marginTop: 20 }}>{recoverySession ? "Atualizar senha" : mode === "recovery" ? "Enviar link" : isSignup ? "Criar conta" : "Entrar"} <ArrowRight size={15} /></button></form>}<div className="auth-divider"><span>ou</span></div><p className="auth-foot">{mode === "signin" && !recoverySession && <><button className="text-button" onClick={() => { setMode("recovery"); setError(""); }}><KeyRound size={12} style={{ verticalAlign: "-2px" }} /> Esqueci minha senha</button><br /></>}{!recoverySession && <>{isSignup ? "Já tem uma conta?" : "Ainda não tem uma conta?"} <button className="text-button" onClick={() => { setMode(isSignup ? "signin" : "signup"); setError(""); }}>{isSignup ? "Entrar" : "Criar conta"}</button></>}</p></div><p className="auth-legal">Ambiente protegido · Dados isolados por organização.</p></main>;
}
