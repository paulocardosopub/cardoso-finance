"use client";

import { CheckCircle2, History } from "lucide-react";
import { useEffect, useState } from "react";
import { brl } from "@/lib/format";
import { createSupabaseBrowserClient } from "@/lib/supabase";

type EmployeeActivityRow = {
  id: string;
  event_type: "credit" | "debit";
  amount: number;
  description: string;
  occurred_at: string;
  actor_name: string;
};

function eventCopy(row: EmployeeActivityRow) {
  return row.event_type === "credit" ? "confirmou pagamento" : "desfez pagamento";
}

export function MemberEmployeeHistory({ organizationId }: { organizationId: string }) {
  const [rows, setRows] = useState<EmployeeActivityRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    if (!supabase || !organizationId) return;
    let active = true;
    const load = async () => {
      const result = await supabase.rpc("list_member_employee_activity", { target_org: organizationId });
      if (!active) return;
      if (!result.error) setRows((result.data ?? []) as EmployeeActivityRow[]);
      setLoading(false);
    };
    void load();
    const onFocus = () => { void load(); };
    window.addEventListener("focus", onFocus);
    return () => { active = false; window.removeEventListener("focus", onFocus); };
  }, [organizationId]);

  return <div className="member-employee-history">
    <div className="panel-heading"><div><h3><History size={15} /> Histórico da funcionária</h3><p>Pagamentos e estornos registrados pela operação.</p></div><span className="tag">{rows.length} eventos</span></div>
    {loading ? <div className="empty-state member-history-empty"><p>Carregando histórico…</p></div> : rows.length ? <div className="activity-list">{rows.map((row) => { const credit = row.event_type === "credit"; return <div className="activity-item" key={row.id}><h3>{new Date(row.occurred_at).toLocaleDateString("pt-BR")} · {row.actor_name} {eventCopy(row)}</h3><p>{row.description}</p><strong className={credit ? "positive" : "negative"}>{credit ? "+" : "−"}{brl(Number(row.amount || 0))}</strong><time>{new Date(row.occurred_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</time></div>; })}</div> : <div className="empty-state member-history-empty"><CheckCircle2 size={24} /><h3>Nenhum registro ainda</h3><p>As confirmações feitas pela funcionária aparecerão aqui.</p></div>}
  </div>;
}
