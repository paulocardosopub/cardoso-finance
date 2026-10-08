"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

type HistoryWindowProps = {
  title: string;
  subtitle: string;
  count: number;
  icon?: ReactNode;
  className?: string;
  children: ReactNode;
};

/** Painel de histórico aberto no desktop e compacto no mobile. */
export function HistoryWindow({ title, subtitle, count, icon, className = "", children }: HistoryWindowProps) {
  const [open, setOpen] = useState(true);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 760px)");
    const syncWithViewport = () => setOpen(!media.matches);
    syncWithViewport();
    media.addEventListener?.("change", syncWithViewport);
    return () => media.removeEventListener?.("change", syncWithViewport);
  }, []);

  return <div className={`history-window ${open ? "is-open" : "is-closed"} ${className}`.trim()}>
    <button type="button" className="history-window-toggle" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
      <span className="history-window-copy">
        {icon}
        <span>
          <strong>{title}</strong>
          <small>{subtitle}</small>
        </span>
      </span>
      <span className="history-window-meta">
        <span className="tag">{count} eventos</span>
        <ChevronDown size={16} aria-hidden="true" />
      </span>
    </button>
    <div className="history-window-body" hidden={!open}>{children}</div>
  </div>;
}
