export function currentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Rental records start in August 2026. Historical months before that
 * competence must not show expected or received rent amounts.
 */
export const RENTAL_START_MONTH = "2026-08";

export function isRentalMonthAvailable(month: string) {
  return month >= RENTAL_START_MONTH;
}

/**
 * Returns whether a lease contributes to a given rental competence month.
 * Dates are kept as ISO calendar dates so the comparison is not affected by
 * the browser's timezone (a common source of one-day shifts in Brazil).
 */
export function leaseActiveInMonth(lease: { startDate?: string | null; endDate?: string | null } | null | undefined, month: string) {
  if (!lease || !/^\d{4}-\d{2}$/.test(month)) return false;
  const monthStart = `${month}-01`;
  const nextMonthStart = `${shiftMonth(month, 1)}-01`;
  const startDate = lease.startDate ? String(lease.startDate).slice(0, 10) : null;
  const endDate = lease.endDate ? String(lease.endDate).slice(0, 10) : null;
  if (startDate && startDate >= nextMonthStart) return false;
  if (endDate && endDate < monthStart) return false;
  return true;
}

export function monthLabel(month: string) {
  const date = new Date(`${month}-01T12:00:00`);
  return date.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

export function shiftMonth(month: string, offset: number) {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(year, monthNumber - 1 + offset, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

