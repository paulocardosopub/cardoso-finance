"use client";

import Link from "next/link";
import { ArrowRight, Building2, Check, CircleUserRound, Home, ShieldCheck } from "lucide-react";
import { useState } from "react";

export default function OnboardingPage() {
  const [choice, setChoice] = useState("holding");
  return <main className="auth-page onboarding"><div className="auth-brand"><div className="brand-mark">C</div><div className="brand-name">Cardoso <span>Finance</span></div></div><div className="onboarding-card"><div className="stepper"><span className="done"><Check size={12} /></span><i /><span className="current">2</span><i /><span>3</span></div><div className="eyebrow">Vamos começar</div><h1>Como deseja começar?</h1><p className="subtitle">Configure seu primeiro contexto patrimonial. Você poderá adicionar outros depois.</p><div className="choice-grid"><Choice icon={<Home size={19} />} title="Meu patrimônio" text="Organize seus ativos pessoais e acompanhe sua evolução." value="personal" selected={choice === "personal"} onClick={setChoice} /><Choice icon={<Building2 size={19} />} title="Criar empresa ou holding" text="Comece uma organização para administrar imóveis e participações." value="holding" selected={choice === "holding"} onClick={setChoice} /><Choice icon={<CircleUserRound size={19} />} title="Entrar em uma organização" text="Aceite um convite recebido da sua família ou empresa." value="invite" selected={choice === "invite"} onClick={setChoice} /></div><div className="onboarding-actions"><Link href="/login" className="button button-ghost">Voltar</Link><Link href="/" className="button button-primary">Continuar <ArrowRight size={15} /></Link></div></div><div className="auth-trust"><ShieldCheck size={15} /> Seus dados ficam isolados e protegidos por organização.</div></main>;
}

function Choice({ icon, title, text, value, selected, onClick }: { icon: React.ReactNode; title: string; text: string; value: string; selected: boolean; onClick: (value: string) => void }) {
  return <button className={`choice ${selected ? "selected" : ""}`} onClick={() => onClick(value)}><span className="choice-icon">{icon}</span><span><strong>{title}</strong><small>{text}</small></span>{selected && <span className="choice-check"><Check size={12} /></span>}</button>;
}
