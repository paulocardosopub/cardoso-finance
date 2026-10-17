"use client";

import { AlertTriangle, CalendarDays, Check, Paperclip, X } from "lucide-react";
import { brl } from "@/lib/format";
import { monthLabel } from "@/lib/month";

export type PaymentConfirmationValues = {
  paymentDate: string;
  amount: string;
  proof: File | null;
  note: string;
  priorDebtMonths?: string[];
  priorDebtLoading?: boolean;
};

export function PaymentConfirmationModal({
  propertyLabel,
  month,
  values,
  busy,
  message,
  priorDebtMonths = [],
  priorDebtLoading = false,
  onChange,
  onCancel,
  onConfirm,
}: {
  propertyLabel: string;
  month: string;
  values: PaymentConfirmationValues;
  busy: boolean;
  message?: string;
  priorDebtMonths?: string[];
  priorDebtLoading?: boolean;
  onChange: (values: PaymentConfirmationValues) => void;
  onCancel: () => void;
  onConfirm: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  const debtMonths = priorDebtMonths.length ? priorDebtMonths : (values.priorDebtMonths ?? []);
  const debtLoading = priorDebtLoading || Boolean(values.priorDebtLoading);
  const confirmedAmount = Number(values.amount.replace(",", "."));
  const amountLabel = Number.isFinite(confirmedAmount) && confirmedAmount > 0 ? brl(confirmedAmount) : "Informe o valor";
  const displayMonth = month.replace(/^./, (character) => character.toUpperCase());
  const debtLabel = debtMonths.length === 1 ? "o mês" : "os meses";
  const debtMonthLabels = debtMonths.map((debtMonth) => monthLabel(debtMonth).replace(/^./, (character) => character.toUpperCase())).join(", ");

  return <div className="modal-backdrop"><form className="edit-modal payment-confirmation-modal" onSubmit={onConfirm}>
    <div className="panel-heading"><div><h2>Confirmar pagamento</h2><p>{propertyLabel} · competência de {month}</p></div><button type="button" className="icon-btn" onClick={onCancel} aria-label="Fechar"><X size={16} /></button></div>
    {message && <p className={message.startsWith("Não") || message.startsWith("Erro") || message.startsWith("Este") ? "form-error" : "form-success"}>{message}</p>}
    <div className="payment-confirmation-summary"><div><span>Competência</span><strong>{displayMonth}</strong></div><div><span>Valor que será registrado</span><strong>{amountLabel}</strong></div></div>
    {debtLoading && <p className="muted payment-debt-check">Verificando pendências anteriores deste inquilino…</p>}
    {!debtLoading && debtMonths.length > 0 && <div className="payment-debt-alert" role="alert"><AlertTriangle size={18} /><div><strong>Atenção</strong><p>Você está registrando um pagamento de {displayMonth}, porém este inquilino ainda deve {debtLabel}: {debtMonthLabels}.</p></div></div>}
    <div className="form-grid">
      <label>Data do pagamento<input type="date" value={values.paymentDate} onChange={(event) => onChange({ ...values, paymentDate: event.target.value })} required /></label>
      <label>Valor confirmado <span className="muted">(pode ser maior ou menor)</span><input type="number" min="0.01" step="0.01" value={values.amount} onChange={(event) => onChange({ ...values, amount: event.target.value })} required /></label>
      <label className="form-grid-wide">Observação <span className="muted">(opcional; explique diferenças no valor mensal)</span><textarea rows={3} value={values.note} onChange={(event) => onChange({ ...values, note: event.target.value })} placeholder="Ex.: desconto negociado, multa ou pagamento parcial" /></label>
      <label className="form-grid-wide payment-proof-field">Comprovante <span className="muted">(opcional)</span><span className="payment-proof-input"><Paperclip size={14} /><input type="file" accept="application/pdf,image/*" onChange={(event) => onChange({ ...values, proof: event.target.files?.[0] ?? null })} /><span>{values.proof?.name ?? "Anexar comprovante"}</span></span></label>
    </div>
    <p className="muted payment-confirmation-note"><CalendarDays size={14} /> O lançamento será registrado neste mês e o crédito será criado automaticamente.</p>
    <div className="onboarding-actions"><button type="button" className="button button-ghost" onClick={onCancel}>Cancelar</button><button type="submit" className="button button-primary" disabled={busy || debtLoading}><Check size={14} /> {busy ? "Registrando…" : debtLoading ? "Verificando…" : "Registrar pagamento"}</button></div>
  </form></div>;
}
