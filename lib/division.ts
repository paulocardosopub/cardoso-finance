const memberColors = ["#80e2b0", "#62b6ff", "#c59cff", "#f0be4a", "#ff8fa3", "#8ed1fc", "#b8e986", "#f7b267", "#d0a2f7", "#7bdff2"];

export type DivisionMemberId = string;
export type DivisionMember = { id: DivisionMemberId; name: string; color: string };
export type DivisionAssignment = DivisionMemberId | "shared" | null;

export function createDefaultDivisionMembers(count = 4): DivisionMember[] {
  const safeCount = Math.max(1, Math.min(10, Math.round(count)));
  return Array.from({ length: safeCount }, (_, index) => ({ id: `member-${index + 1}`, name: `Membro ${index + 1}`, color: memberColors[index % memberColors.length] }));
}

export function normalizeDivisionMembers(value: unknown, fallbackCount = 4): DivisionMember[] {
  if (!Array.isArray(value)) return createDefaultDivisionMembers(fallbackCount);
  const members = value.map((item, index) => {
    const row = item && typeof item === "object" ? item as Record<string, unknown> : {};
    return {
      id: typeof row.id === "string" && row.id.trim() ? row.id : `member-${index + 1}`,
      name: typeof row.name === "string" && row.name.trim() ? row.name.trim() : `Membro ${index + 1}`,
      color: typeof row.color === "string" && row.color.trim() ? row.color : memberColors[index % memberColors.length],
    };
  }).slice(0, 10);
  return members.length ? members : createDefaultDivisionMembers(fallbackCount);
}

/** Legacy fallback used by PDF helpers and older integrations. New scenarios use their own member list. */
export const divisionMembers = createDefaultDivisionMembers(4);

export type DivisionUnit = {
  id: string;
  buildingId: string;
  buildingName: string;
  buildingValue?: number | null;
  code: string;
  type: string;
  value: number | null;
  rent: number;
  status: string;
  quantity: number;
};

export type DivisionMemberTotals = {
  id: DivisionMemberId;
  name: string;
  color: string;
  units: number;
  value: number;
  rent: number;
  share: number;
  valueDifference: number;
  rentDifference: number;
};

export type DivisionMetrics = {
  totalValue: number;
  distributedValue: number;
  pendingValue: number;
  totalRent: number;
  distributedRent: number;
  pendingUnits: number;
  distributedUnits: number;
  sharedUnits: number;
  unitsWithoutValue: number;
  memberTargetValue: number;
  memberTargetRent: number;
  members: DivisionMemberTotals[];
  propertyBalance: number | null;
  incomeBalance: number | null;
  consolidatedBalance: number | null;
};

export type DivisionSuggestionPriorities = { value: boolean; rent: boolean };

export type EqualizationTransfer = {
  fromId: DivisionMemberId;
  fromName: string;
  toId: DivisionMemberId;
  toName: string;
  amount: number;
};

function valueOf(unit: DivisionUnit) {
  return unit.value ?? 0;
}

function averageDeviation(values: number[], target: number) {
  if (target <= 0 || !values.length) return 0;
  return values.reduce((sum, value) => sum + Math.abs(value - target) / target, 0) / values.length;
}

function balanceScore(values: number[], target: number) {
  if (target <= 0) return null;
  return Math.max(0, Math.min(100, (1 - averageDeviation(values, target)) * 100));
}

export function calculateDivision(units: DivisionUnit[], assignments: Record<string, DivisionAssignment>, members: DivisionMember[] = divisionMembers): DivisionMetrics {
  const activeMembers = members.length ? members : createDefaultDivisionMembers(1);
  const totalValue = units.reduce((sum, unit) => sum + valueOf(unit), 0);
  const totalRent = units.reduce((sum, unit) => sum + unit.rent, 0);
  const distributedValue = units.reduce((sum, unit) => sum + (assignments[unit.id] ? valueOf(unit) : 0), 0);
  const distributedRent = units.reduce((sum, unit) => sum + (assignments[unit.id] ? unit.rent : 0), 0);
  const distributedUnits = units.filter((unit) => assignments[unit.id]).reduce((sum, unit) => sum + unit.quantity, 0);
  const shared = units.filter((unit) => assignments[unit.id] === "shared");
  const sharedValue = shared.reduce((sum, unit) => sum + valueOf(unit), 0);
  const sharedRent = shared.reduce((sum, unit) => sum + unit.rent, 0);
  const memberTargetValue = totalValue / activeMembers.length;
  const memberTargetRent = totalRent / activeMembers.length;
  const membersTotals = activeMembers.map((member) => {
    const individual = units.filter((unit) => assignments[unit.id] === member.id);
    const value = individual.reduce((sum, unit) => sum + valueOf(unit), 0) + sharedValue / activeMembers.length;
    const rent = individual.reduce((sum, unit) => sum + unit.rent, 0) + sharedRent / activeMembers.length;
    return { ...member, units: individual.reduce((sum, unit) => sum + unit.quantity, 0), value, rent, share: totalValue > 0 ? (value / totalValue) * 100 : 0, valueDifference: value - memberTargetValue, rentDifference: rent - memberTargetRent };
  });
  const propertyBalance = balanceScore(membersTotals.map((member) => member.value), memberTargetValue);
  const incomeBalance = balanceScore(membersTotals.map((member) => member.rent), memberTargetRent);
  return {
    totalValue, distributedValue, pendingValue: Math.max(totalValue - distributedValue, 0), totalRent, distributedRent,
    pendingUnits: units.reduce((sum, unit) => sum + unit.quantity, 0) - distributedUnits, distributedUnits,
    sharedUnits: shared.reduce((sum, unit) => sum + unit.quantity, 0),
    unitsWithoutValue: units.filter((unit) => unit.value == null).reduce((sum, unit) => sum + unit.quantity, 0),
    memberTargetValue, memberTargetRent, members: membersTotals, propertyBalance, incomeBalance,
    consolidatedBalance: propertyBalance == null || incomeBalance == null ? null : (propertyBalance + incomeBalance) / 2,
  };
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculateEqualization(metrics: DivisionMetrics): EqualizationTransfer[] {
  const debtors = metrics.members.map((member) => ({ member, amount: member.value - metrics.memberTargetValue })).filter(({ amount }) => amount > 0.01);
  const receivers = metrics.members.map((member) => ({ member, amount: metrics.memberTargetValue - member.value })).filter(({ amount }) => amount > 0.01);
  const transfers: EqualizationTransfer[] = [];
  let debtorIndex = 0;
  let receiverIndex = 0;
  while (debtorIndex < debtors.length && receiverIndex < receivers.length) {
    const debtor = debtors[debtorIndex];
    const receiver = receivers[receiverIndex];
    const amount = roundMoney(Math.min(debtor.amount, receiver.amount));
    if (amount > 0) transfers.push({ fromId: debtor.member.id, fromName: debtor.member.name, toId: receiver.member.id, toName: receiver.member.name, amount });
    debtor.amount -= amount;
    receiver.amount -= amount;
    if (debtor.amount <= 0.01) debtorIndex += 1;
    if (receiver.amount <= 0.01) receiverIndex += 1;
  }
  return transfers;
}

function projectedPenalty(units: DivisionUnit[], assignments: Record<string, DivisionAssignment>, priorities: DivisionSuggestionPriorities, members: DivisionMember[]) {
  const metrics = calculateDivision(units, assignments, members);
  const valuePenalty = metrics.memberTargetValue > 0 ? averageDeviation(metrics.members.map((member) => member.value), metrics.memberTargetValue) : 0;
  const rentPenalty = metrics.memberTargetRent > 0 ? averageDeviation(metrics.members.map((member) => member.rent), metrics.memberTargetRent) : 0;
  const counts = metrics.members.map((member) => member.units);
  const averageCount = counts.reduce((sum, count) => sum + count, 0) / counts.length;
  const countPenalty = averageCount > 0 ? averageDeviation(counts, averageCount) : 0;
  const valueWeight = priorities.value && priorities.rent ? 0.45 : priorities.value ? 0.8 : 0;
  const rentWeight = priorities.value && priorities.rent ? 0.45 : priorities.rent ? 0.8 : 0;
  const countWeight = priorities.value || priorities.rent ? 0.1 : 1;
  return valuePenalty * valueWeight + rentPenalty * rentWeight + countPenalty * countWeight;
}

function priorityScore(unit: DivisionUnit, units: DivisionUnit[], priorities: DivisionSuggestionPriorities) {
  const totalValue = units.reduce((sum, item) => sum + valueOf(item), 0);
  const totalRent = units.reduce((sum, item) => sum + item.rent, 0);
  const totalQuantity = units.reduce((sum, item) => sum + item.quantity, 0);
  const valueScore = totalValue > 0 ? valueOf(unit) / totalValue : 0;
  const rentScore = totalRent > 0 ? unit.rent / totalRent : 0;
  const countScore = totalQuantity > 0 ? unit.quantity / totalQuantity : 0;
  if (!priorities.value && !priorities.rent) return countScore;
  return (priorities.value ? valueScore : 0) + (priorities.rent ? rentScore : 0) + countScore * 0.1;
}

/** Greedy proposal that minimizes the selected normalized priority deviations. */
export function suggestDivision(units: DivisionUnit[], current: Record<string, DivisionAssignment>, keepShared = true, priorities: DivisionSuggestionPriorities = { value: true, rent: true }, members: DivisionMember[] = divisionMembers) {
  const activeMembers = members.length ? members : createDefaultDivisionMembers(1);
  const next: Record<string, DivisionAssignment> = {};
  const fixed = keepShared ? units.filter((unit) => current[unit.id] === "shared") : [];
  for (const unit of units) next[unit.id] = fixed.some((fixedUnit) => fixedUnit.id === unit.id) ? "shared" : null;
  const candidates = units.filter((unit) => !fixed.some((fixedUnit) => fixedUnit.id === unit.id)).sort((left, right) => priorityScore(right, units, priorities) - priorityScore(left, units, priorities));
  for (const unit of candidates) {
    let best: DivisionMemberId = activeMembers[0].id;
    let bestPenalty = Number.POSITIVE_INFINITY;
    for (const member of activeMembers) {
      next[unit.id] = member.id;
      const penalty = projectedPenalty(units, next, priorities, activeMembers);
      if (penalty < bestPenalty) { best = member.id; bestPenalty = penalty; }
    }
    next[unit.id] = best;
  }
  return next;
}
