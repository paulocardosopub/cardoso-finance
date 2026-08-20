"use client";

import { Check, Settings2, ShieldCheck } from "lucide-react";
import { usePortfolio } from "@/components/portfolio-provider";

export default function ConfiguracoesPage() {
  const { buildings } = usePortfolio();
  const records = buildings.reduce((sum, building) => sum + (building.sourceRows ?? building.units), 0);
  return <div className="content"><div className="page-heading"><div><div className="eyebrow"><Settings2 size={13} /> Preferências</div><h1>Configurações</h1><p className="subtitle">Origem, segurança e conexão da carteira.</p></div></div><div className="dashboard-grid"><div className="panel"><div className="panel-heading"><div><h2>Fonte dos dados</h2><p>Informações confirmadas no arquivo enviado</p></div></div><div className="setting-row"><span>Arquivo de origem</span><strong>dados imoveis.xlsx</strong></div><div className="setting-row"><span>Registros válidos</span><strong>{records} imóveis</strong></div><div className="setting-row"><span>Critério de patrimônio</span><strong>AVALIAÇÃO</strong></div><div className="setting-row"><span>Registro removido</span><strong>405 LOJA 04.1</strong></div><div className="setting-row"><span>Moeda exibida</span><strong>BRL · Real brasileiro</strong></div></div><div className="panel"><div className="panel-heading"><div><h2>Segurança</h2><p>Proteções ativas do ambiente</p></div><ShieldCheck size={17} color="#80e2b0" /></div><div className="setting-row"><span>Supabase Auth</span><strong className="positive"><Check size={13} /> Ativo</strong></div><div className="setting-row"><span>Row Level Security</span><strong className="positive"><Check size={13} /> Ativo</strong></div><div className="setting-row"><span>Despesas iniciais</span><strong>Nenhuma</strong></div></div></div></div>;
}
