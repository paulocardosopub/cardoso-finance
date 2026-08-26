"use client";

import { CalendarDays, Check, Paperclip, X } from "lucide-react";

export type PaymentConfirmationValues = {
  paymentDate: string;
  amount: string;
  proof: File | null;
};

export function PaymentConfirmationModal({
  propertyLabel,
  month,
  values,
  busy,
  onChange,
  onCancel,
  onConfirm,
}: {
  propertyLabel: string;
  month: string;
  values: PaymentConfirmationValues;
  busy: boolean;
  onChange: (values: PaymentConfirmationValues) => void;
  onCancel: () => void;
  onConfirm: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  return <div className="modal-backdrop"><form className="edit-modal payment-confirmation-modal" onSubmit={onConfirm}>
    <div className="panel-heading"><div><h2>Confirmar pagamento</h2><p>{propertyLabel} · competência de {month}</p></div><button type="button" className="icon-btn" onClick={onCancel} aria-label="Fechar"><X size={16} /></button></div>
    <div className="form-grid">
      <label>Data do pagamento<input type="date" value={values.paymentDate} onChange={(event) => onChange({ ...values, paymentDate: event.target.value })} required /></label>
      <label>Valor confirmado<input type="number" min="0.01" step="0.01" value={values.amount} onChange={(event) => onChange({ ...values, amount: event.target.value })} required /></label>
      <label className="form-grid-wide payment-proof-field">Comprovante <span className="muted">(opcional)</span><span className="payment-proof-input"><Paperclip size={14} /><input type="file" accept="application/pdf,image/*" onChange={(event) => onChange({ ...values, proof: event.target.files?.[0] ?? null })} /><span>{values.proof?.name ?? "Anexar comprovante"}</span></span></label>
    </div>
    <p className="muted payment-confirmation-note"><CalendarDays size={14} /> O lançamento será registrado neste mês e o crédito será criado automaticamente.</p>
    <div className="onboarding-actions"><button type="button" className="button button-ghost" onClick={onCancel}>Cancelar</button><button type="submit" className="button button-primary" disabled={busy}><Check size={14} /> {busy ? "Confirmando…" : "Confirmar pagamento"}</button></div>
  </form></div>;
}
