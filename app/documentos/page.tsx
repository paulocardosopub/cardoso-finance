"use client";

import { Download, FileText, FolderOpen, Plus, Search, Trash2, Upload } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePortfolio } from "@/components/portfolio-provider";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import { listAuthorizedDocuments, type AuthorizedDocument } from "@/lib/member-access";

type VisibleDocument = AuthorizedDocument & { signedUrl?: string };

function fileSize(bytes?: number | null) {
  if (!bytes) return "Tamanho não informado";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}

export default function DocumentosPage() {
  const { organizationId, role, memberVisibility } = usePortfolio();
  const [documents, setDocuments] = useState<VisibleDocument[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const isMember = role === "viewer";

  const loadDocuments = useCallback(async () => {
    if (!organizationId || (isMember && !memberVisibility.showDocuments)) { setDocuments([]); setLoading(false); return; }
    const supabase = createSupabaseBrowserClient();
    if (!supabase) { setLoading(false); return; }
    setLoading(true);
    const result = await listAuthorizedDocuments(supabase, organizationId, role, memberVisibility);
    if (result.error) { setMessage("Não foi possível carregar os documentos disponíveis."); setDocuments([]); setLoading(false); return; }
    const rows = (result.data ?? []).filter((document) => document.category !== "photo");
    const withLinks = await Promise.all(rows.map(async (document) => ({ ...document, signedUrl: (await supabase.storage.from("organization-documents").createSignedUrl(document.storage_path, 3600, { download: document.name })).data?.signedUrl })));
    setDocuments(withLinks);
    setLoading(false);
  }, [isMember, memberVisibility, organizationId, role]);

  useEffect(() => { void loadDocuments(); }, [loadDocuments]);

  async function upload(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    if (!organizationId || isMember || !files.length) return;
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;
    setLoading(true); setMessage("");
    const user = (await supabase.auth.getUser()).data.user;
    let uploaded = 0;
    for (const file of files) {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
      const path = `${organizationId}/general/${crypto.randomUUID()}-${safeName}`;
      const stored = await supabase.storage.from("organization-documents").upload(path, file, { upsert: false, contentType: file.type || undefined });
      if (stored.error) { setMessage(stored.error.message); continue; }
      const created = await supabase.from("documents").insert({ organization_id: organizationId, name: file.name, category: "general", storage_path: path, mime_type: file.type || null, size_bytes: file.size, uploaded_by: user?.id });
      if (created.error) setMessage(created.error.message); else uploaded += 1;
    }
    if (uploaded) setMessage(`${uploaded} documento${uploaded > 1 ? "s" : ""} enviado${uploaded > 1 ? "s" : ""}.`);
    event.currentTarget.value = "";
    await loadDocuments();
  }

  async function remove(document: VisibleDocument) {
    if (!organizationId || (role !== "owner" && role !== "admin") || !window.confirm(`Excluir “${document.name}”?`)) return;
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;
    const storageResult = await supabase.storage.from("organization-documents").remove([document.storage_path]);
    if (storageResult.error) { setMessage(storageResult.error.message); return; }
    const result = await supabase.from("documents").delete().eq("id", document.id).eq("organization_id", organizationId);
    if (result.error) setMessage(result.error.message); else { setMessage("Documento excluído."); await loadDocuments(); }
  }

  const visible = useMemo(() => documents.filter((document) => document.name.toLowerCase().includes(query.trim().toLowerCase())), [documents, query]);
  if (isMember && !memberVisibility.showDocuments) return <div className="content"><div className="page-heading"><div><div className="eyebrow"><FileText size={13} /> Cofre documental</div><h1>Documentos</h1><p className="subtitle">Os documentos não foram compartilhados para membros desta holding.</p></div></div><div className="empty-state"><FolderOpen size={30} /><h3>Nenhum documento disponível</h3><p>Se precisar de acesso, fale com um administrador.</p></div></div>;

  return <div className="content"><div className="page-heading"><div><div className="eyebrow"><FileText size={13} /> Cofre documental</div><h1>Documentos</h1><p className="subtitle">{isMember ? "Consulte e baixe os arquivos autorizados pela administração." : "Contratos, matrículas e comprovantes com acesso controlado."}</p></div>{!isMember && <><input ref={inputRef} type="file" multiple hidden onChange={(event) => void upload(event)} /><button className="button button-primary" onClick={() => inputRef.current?.click()}><Plus size={15} /> Enviar documento</button></>}</div>
    {message && <p className={message.includes("excluído") || message.includes("enviado") ? "form-success" : "form-error"}>{message}</p>}
    <div className="panel"><div className="panel-heading"><div><h2>Arquivos da organização</h2><p>Storage privado · {documents.length} arquivo{documents.length === 1 ? "" : "s"} disponível{documents.length === 1 ? "" : "is"}</p></div><label className="search-inline"><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar documento" /></label></div>
      {loading ? <div className="empty-state"><p>Carregando documentos...</p></div> : visible.length ? <div className="document-list">{visible.map((document) => <div className="document-item" key={document.id}><span className="document-link"><FileText size={17} /><span><strong>{document.name}</strong><small>{fileSize(document.size_bytes)}{document.created_at ? ` · ${new Date(document.created_at).toLocaleDateString("pt-BR")}` : ""}</small></span></span><div className="document-actions">{document.signedUrl && <a href={document.signedUrl} className="button button-ghost button-small" download={document.name}><Download size={13} /> Baixar</a>}{!isMember && (role === "owner" || role === "admin") && <button className="icon-btn danger-btn" onClick={() => void remove(document)} aria-label={`Excluir ${document.name}`}><Trash2 size={14} /></button>}</div></div>)}</div> : <div className="empty-state"><FolderOpen size={30} /><h3>Nenhum documento disponível</h3><p>{isMember ? "Os documentos autorizados aparecerão aqui." : "Envie o primeiro arquivo para esta organização."}</p>{!isMember && <button className="button button-primary" onClick={() => inputRef.current?.click()}><Upload size={14} /> Adicionar primeiro documento</button>}</div>}
    </div></div>;
}
