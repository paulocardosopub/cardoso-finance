import { isRentalMonthAvailable, leaseActiveInMonth, RENTAL_START_MONTH, shiftMonth } from "@/lib/month";
import type { LeaseSummary } from "@/types/domain";

export type LeasePaymentDebtRow = {
  competence?: string | null;
  status?: string | null;
  received_amount?: number | null;
  expected_amount?: number | null;
};

function monthFromDate(value?: string | null) {
  const month = value ? String(value).slice(0, 7) : "";
  return /^\d{4}-\d{2}$/.test(month) ? month : null;
}

function paymentIsSettled(payment: LeasePaymentDebtRow | undefined) {
  if (!payment) return false;
  if (payment.status === "paid" || payment.status === "waived") return true;
  const received = Number(payment.received_amount ?? 0);
  const expected = Number(payment.expected_amount ?? 0);
  return expected > 0 && received >= expected;
}

/** Finds prior rental competences that still have no complete payment. */
export function outstandingLeaseMonths(lease: LeaseSummary | null | undefined, targetMonth: string, payments: LeasePaymentDebtRow[]) {
  if (!lease || !isRentalMonthAvailable(targetMonth)) return [];

  const target = monthFromDate(`${targetMonth}-01`);
  if (!target) return [];

  const paymentByMonth = new Map<string, LeasePaymentDebtRow>();
  for (const payment of payments) {
    const month = monthFromDate(payment.competence);
    if (month) paymentByMonth.set(month, payment);
  }

  const firstRecordedMonth = Array.from(paymentByMonth.keys()).sort()[0] ?? null;
  const leaseStartMonth = monthFromDate(lease.startDate);
  const firstMonth = leaseStartMonth
    ? (leaseStartMonth > RENTAL_START_MONTH ? leaseStartMonth : RENTAL_START_MONTH)
    : firstRecordedMonth;
  if (!firstMonth || firstMonth >= target) return [];

  const outstanding: string[] = [];
  for (let month = firstMonth; month < target; month = shiftMonth(month, 1)) {
    if (!leaseActiveInMonth(lease, month)) continue;
    if (!paymentIsSettled(paymentByMonth.get(month))) outstanding.push(month);
  }
  return outstanding;
}
