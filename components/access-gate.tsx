"use client";

import { FormEvent, useEffect, useState } from "react";
import { Eye, EyeOff, LockKeyhole, ShieldCheck } from "lucide-react";

const ACCESS_PASSWORD = "17011941";
const ACCESS_KEY = "cardoso-finance-access";

export function AccessGate({ children }: { children: React.ReactNode }) {
  const [unlocked, setUnlocked] = useState(false);
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setUnlocked(window.sessionStorage.getItem(ACCESS_KEY) === "ok");
    setReady(true);
  }, []);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password === ACCESS_PASSWORD) {
      window.sessionStorage.setItem(ACCESS_KEY, "ok");
      setUnlocked(true);
      setError("");
      return;
    }
    setError("Senha incorreta. Confira os números e tente novamente.");
  }

  if (!ready) return <div className="auth-page" aria-busy="true" />;
  if (unlocked) return <>{children}</>;

  return <main className="auth-page access-gate-page">
    <div className="auth-glow" />
    <div className="auth-brand"><div className="brand-mark">C</div><div className="brand-name">Cardoso <span>Finance</span></div></div>
    <section className="auth-card access-gate-card">
      <div className="eyebrow"><LockKeyhole size={13} /> Acesso provisório</div>
      <h1>Entrar no Cardoso Finance</h1>
      <p className="subtitle">Use a senha temporária enquanto o login de usuários é finalizado.</p>
      <form onSubmit={handleSubmit}>
        <label>Senha de acesso
          <input autoFocus type={showPassword ? "text" : "password"} inputMode="numeric" autoComplete="current-password" value={password} onChange={(event) => { setPassword(event.target.value); setError(""); }} placeholder="Digite a senha" />
          <button type="button" className="password-toggle" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}>{showPassword ? <EyeOff size={15} /> : <Eye size={15} />}</button>
        </label>
        {error && <p className="form-error">{error}</p>}
        <button type="submit" className="button button-primary access-submit"><LockKeyhole size={15} /> Entrar</button>
      </form>
      <div className="access-note"><ShieldCheck size={14} /><span>Proteção temporária para a fase de implantação. O login definitivo substituirá esta tela.</span></div>
    </section>
    <p className="auth-legal">Cardoso Finance · Wealth OS</p>
  </main>;
}
