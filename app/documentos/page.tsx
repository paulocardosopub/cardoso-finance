import { FileText, FolderOpen, Plus, Search } from "lucide-react";

export default function DocumentosPage() {
  return <div className="content"><div className="page-heading"><div><div className="eyebrow"><FileText size={13} /> Cofre documental</div><h1>Documentos</h1><p className="subtitle">Contratos, matrículas e comprovantes com acesso controlado.</p></div><button className="button button-primary"><Plus size={15} /> Enviar documento</button></div><div className="panel"><div className="panel-heading"><div><h2>Arquivos da organização</h2><p>Storage privado · 0 arquivos nesta demonstração</p></div><button className="button button-ghost"><Search size={14} /> Buscar</button></div><div className="empty-state"><FolderOpen size={30} /><h3>Nenhum documento enviado</h3><p>Adicione contratos, fotos e comprovantes para manter tudo organizado.</p><button className="button button-primary"><Plus size={14} /> Adicionar primeiro documento</button></div></div></div>;
}
