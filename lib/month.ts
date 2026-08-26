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

export function monthLabel(month: string) {
  const date = new Date(`${month}-01T12:00:00`);
  return date.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

export function shiftMonth(month: string, offset: number) {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(year, monthNumber - 1 + offset, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

