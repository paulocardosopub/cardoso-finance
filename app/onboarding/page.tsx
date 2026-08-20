"use client";

import Link from "next/link";
import { ArrowRight, Building2, Check, CircleUserRound, Home, Loader2, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import { syncInitialPortfolio } from "@/lib/portfolio-sync";

export default function OnboardingPage() {
  const router = useRouter();
  const [choice, setChoice] = useState("holding");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [hasSession, setHasSession] = useState(false);
  useEffect(() => { createSupabaseBrowserClient()?.auth.getSession().then(({ data }) => setHasSession(Boolean(data.session))); }, []);
  async function createOrganization() {
    setError(""); const supabase = createSupabaseBrowserClient();
    if (!supabase || !hasSession) { setError("Entre na sua conta antes de criar uma organização."); return; }
    if (choice === "invite") { setError("O aceite de convite será habilitado quando houver um convite pendente."); return; }
    setLoading(true);
    const { data: organizationId, error: organizationError } = await supabase.rpc("create_organization", { org_name: choice === "personal" ? "Meu patrimônio" : "Minha organização", org_type: choice === "personal" ? "personal" : "company", org_description: "Dados imobiliários importados da planilha", org_currency: "BRL" });
    if (organizationError) { setError(organizationError.message); setLoading(false); return; }
    try { await syncInitialPortfolio(organizationId); router.push("/"); } catch (syncError) { setError(syncError instanceof Error ? syncError.message : "Não foi possível importar os imóveis."); setLoading(false); }
  }
  return <main className="auth-page onboarding"><div className="auth-brand"><div className="brand-mark">C</div><div className="brand-name">Cardoso <span>Finance</span></div></div><div className="onboarding-card"><div className="stepper"><span className="done"><Check size={12} /></span><i /><span className="current">2</span><i /><span>3</span></div><div className="eyebrow">Primeira organização</div><h1>Como deseja começar?</h1><p className="subtitle">Sua escolha cria a organização e importa os 62 imóveis válidos da planilha, sem o registro 04.1.</p><div className="choice-grid"><Choice icon={<Home size={19} />} title="Meu patrimônio" text="Crie uma organização pessoal para sua carteira." value="personal" selected={choice === "personal"} onClick={setChoice} /><Choice icon={<Building2 size={19} />} title="Criar empresa ou holding" text="Crie uma organização empresarial para administrar imóveis." value="holding" selected={choice === "holding"} onClick={setChoice} /><Choice icon={<CircleUserRound size={19} />} title="Entrar em uma organização" text="Aceite um convite recebido de uma organização existente." value="invite" selected={choice === "invite"} onClick={setChoice} /></div>{error && <p className="form-error" style={{ marginTop: 18 }}>{error}</p>}<div className="onboarding-actions"><Link href="/login" className="button button-ghost">Voltar</Link><button className="button button-primary" onClick={createOrganization} disabled={loading}>{loading ? <><Loader2 size={15} className="spin" /> Importando...</> : <>Criar e importar <ArrowRight size={15} /></>}</button></div></div><div className="auth-trust"><ShieldCheck size={15} /> RLS mantém cada organização isolada.</div></main>;
}
function Choice({ icon, title, text, value, selected, onClick }: { icon: React.ReactNode; title: string; text: string; value: string; selected: boolean; onClick: (value: string) => void }) { return <button className={`choice ${selected ? "selected" : ""}`} onClick={() => onClick(value)}><span className="choice-icon">{icon}</span><span><strong>{title}</strong><small>{text}</small></span>{selected && <span className="choice-check"><Check size={12} /></span>}</button>; }
