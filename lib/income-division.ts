import type { ExpenseRecord } from "@/types/domain";

export type IncomeDivisionMember = {
  memberId: string;
  userId: string | null;
  contactId: string | null;
  name: string;
  ownershipPercentage?: number;
};

export type IncomeDivisionMemberSummary = IncomeDivisionMember & {
  ref: string;
  personalExpenses: number;
  holdingExpenses: number;
  totalExpenses: number;
  targetAmount: number;
  netAmount: number;
};

export type IncomeDivisionCalculation = {
  month: string;
  targetAmount: number;
  holdingTotal: number;
  expenseTotal: number;
  applicableExpenses: number;
  members: IncomeDivisionMemberSummary[];
};

export function memberReference(member: Pick<IncomeDivisionMember, "memberId" | "userId" | "contactId">) {
  return member.userId ? `user:${member.userId}` : member.contactId ? `contact:${member.contactId}` : member.memberId;
}

function sourceDate(expense: ExpenseRecord) {
  return String(expense.competence ?? expense.expense_date ?? "").slice(0, 10);
}

/** Fixed and recurring expenses continue from their start month; one-time
 * expenses belong only to the competence month selected by the manager. */
export function expenseAppliesToMonth(expense: ExpenseRecord, month: string) {
  if (!/^\d{4}-\d{2}$/.test(month)) return false;
  const date = sourceDate(expense);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  if (expense.expense_kind === "one_time") return date.startsWith(month);
  return date <= `${month}-31`;
}

function fallbackAssignments(expense: ExpenseRecord) {
  if (expense.responsibilities?.length) return expense.responsibilities;
  if (expense.responsible_user_id) return [{ user_id: expense.responsible_user_id, share_percentage: 100 }];
  if (expense.responsible_contact_id) return [{ contact_id: expense.responsible_contact_id, share_percentage: 100 }];
  return [];
}

function assignmentMatches(member: IncomeDivisionMember, assignment: { user_id?: string; contact_id?: string }) {
  return Boolean((member.userId && assignment.user_id === member.userId) || (member.contactId && assignment.contact_id === member.contactId));
}

export function calculateIncomeDivision(expenses: ExpenseRecord[], sourceMembers: IncomeDivisionMember[], month: string, targetAmount: number): IncomeDivisionCalculation {
  const members = sourceMembers.filter((member) => Boolean(member.userId || member.contactId || member.memberId));
  const ownershipTotal = members.reduce((total, member) => total + Number(member.ownershipPercentage || 0), 0);
  const equalWeight = members.length ? 1 / members.length : 0;
  const memberWeight = (member: IncomeDivisionMember) => ownershipTotal > 0 ? Number(member.ownershipPercentage || 0) / ownershipTotal : equalWeight;
  const personalTotals = new Map<string, number>(members.map((member) => [memberReference(member), 0]));
  const applicable = expenses.filter((expense) => expenseAppliesToMonth(expense, month));
  let holdingTotal = 0;
  let expenseTotal = 0;

  for (const expense of applicable) {
    const value = Number(expense.value || 0);
    if (!Number.isFinite(value) || value <= 0) continue;
    expenseTotal += value;
    const assignments = fallbackAssignments(expense);
    if (!assignments.length) {
      holdingTotal += value;
      continue;
    }
    for (const member of members) {
      const share = assignments.filter((assignment) => assignmentMatches(member, assignment)).reduce((total, assignment) => total + value * Number(assignment.share_percentage || 0) / 100, 0);
      if (share > 0) personalTotals.set(memberReference(member), (personalTotals.get(memberReference(member)) ?? 0) + share);
    }
  }

  const summaries = members.map((member) => {
    const ref = memberReference(member);
    const personalExpenses = personalTotals.get(ref) ?? 0;
    const holdingExpenses = holdingTotal * memberWeight(member);
    const totalExpenses = personalExpenses + holdingExpenses;
    return { ...member, ref, personalExpenses, holdingExpenses, totalExpenses, targetAmount, netAmount: targetAmount - totalExpenses };
  });
  return { month, targetAmount, holdingTotal, expenseTotal, applicableExpenses: applicable.length, members: summaries };
}
