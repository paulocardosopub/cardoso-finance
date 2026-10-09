export const divisionMembers = [
  { id: "paulo", name: "Paulo", color: "#80e2b0" },
  { id: "pedro", name: "Pedro", color: "#62b6ff" },
  { id: "aurora", name: "Aurora", color: "#c59cff" },
  { id: "carlos", name: "Carlos", color: "#f0be4a" },
] as const;

export type DivisionMemberId = (typeof divisionMembers)[number]["id"];
export type DivisionAssignment = DivisionMemberId | "shared" | null;

export type DivisionUnit = {
  id: string;
  buildingId: string;
  buildingName: string;
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

function valueOf(unit: DivisionUnit) {
  return unit.value ?? 0;
}

function averageDeviation(values: number[], target: number) {
  if (target <= 0) return 0;
  return values.reduce((sum, value) => sum + Math.abs(value - target) / target, 0) / values.length;
}

function balanceScore(values: number[], target: number) {
  if (target <= 0) return null;
  return Math.max(0, Math.min(100, (1 - averageDeviation(values, target)) * 100));
}

export function calculateDivision(units: DivisionUnit[], assignments: Record<string, DivisionAssignment>): DivisionMetrics {
  const totalValue = units.reduce((sum, unit) => sum + valueOf(unit), 0);
  const totalRent = units.reduce((sum, unit) => sum + unit.rent, 0);
  const distributedValue = units.reduce((sum, unit) => sum + (assignments[unit.id] ? valueOf(unit) : 0), 0);
  const distributedRent = units.reduce((sum, unit) => sum + (assignments[unit.id] ? unit.rent : 0), 0);
  const distributedUnits = units.filter((unit) => assignments[unit.id]).reduce((sum, unit) => sum + unit.quantity, 0);
  const shared = units.filter((unit) => assignments[unit.id] === "shared");
  const sharedValue = shared.reduce((sum, unit) => sum + valueOf(unit), 0);
  const sharedRent = shared.reduce((sum, unit) => sum + unit.rent, 0);
  const memberTargetValue = totalValue / divisionMembers.length;
  const memberTargetRent = totalRent / divisionMembers.length;
  const members = divisionMembers.map((member) => {
    const individual = units.filter((unit) => assignments[unit.id] === member.id);
    const value = individual.reduce((sum, unit) => sum + valueOf(unit), 0) + sharedValue / divisionMembers.length;
    const rent = individual.reduce((sum, unit) => sum + unit.rent, 0) + sharedRent / divisionMembers.length;
    return {
      ...member,
      units: individual.reduce((sum, unit) => sum + unit.quantity, 0),
      value,
      rent,
      share: totalValue > 0 ? (value / totalValue) * 100 : 0,
      valueDifference: value - memberTargetValue,
      rentDifference: rent - memberTargetRent,
    };
  });
  const propertyBalance = balanceScore(members.map((member) => member.value), memberTargetValue);
  const incomeBalance = balanceScore(members.map((member) => member.rent), memberTargetRent);
  return {
    totalValue,
    distributedValue,
    pendingValue: Math.max(totalValue - distributedValue, 0),
    totalRent,
    distributedRent,
    pendingUnits: units.reduce((sum, unit) => sum + unit.quantity, 0) - distributedUnits,
    distributedUnits,
    sharedUnits: shared.reduce((sum, unit) => sum + unit.quantity, 0),
    unitsWithoutValue: units.filter((unit) => unit.value == null).reduce((sum, unit) => sum + unit.quantity, 0),
    memberTargetValue,
    memberTargetRent,
    members,
    propertyBalance,
    incomeBalance,
    consolidatedBalance: propertyBalance == null || incomeBalance == null ? null : (propertyBalance + incomeBalance) / 2,
  };
}

function projectedPenalty(units: DivisionUnit[], assignments: Record<string, DivisionAssignment>) {
  const metrics = calculateDivision(units, assignments);
  const valuePenalty = metrics.memberTargetValue > 0 ? averageDeviation(metrics.members.map((member) => member.value), metrics.memberTargetValue) : 0;
  const rentPenalty = metrics.memberTargetRent > 0 ? averageDeviation(metrics.members.map((member) => member.rent), metrics.memberTargetRent) : 0;
  const counts = metrics.members.map((member) => member.units);
  const averageCount = counts.reduce((sum, count) => sum + count, 0) / counts.length;
  const countPenalty = averageCount > 0 ? averageDeviation(counts, averageCount) : 0;
  return valuePenalty * 0.5 + rentPenalty * 0.4 + countPenalty * 0.1;
}

/** Greedy proposal that minimizes normalized patrimony, rent and unit-count deviations. */
export function suggestDivision(units: DivisionUnit[], current: Record<string, DivisionAssignment>, keepShared = true) {
  const next: Record<string, DivisionAssignment> = {};
  const fixed = keepShared ? units.filter((unit) => current[unit.id] === "shared") : [];
  for (const unit of units) next[unit.id] = fixed.some((fixedUnit) => fixedUnit.id === unit.id) ? "shared" : null;
  const candidates = units.filter((unit) => !fixed.some((fixedUnit) => fixedUnit.id === unit.id)).sort((left, right) => {
    const leftWeight = valueOf(left) + left.rent * 12;
    const rightWeight = valueOf(right) + right.rent * 12;
    return rightWeight - leftWeight;
  });
  for (const unit of candidates) {
    let best: DivisionMemberId = divisionMembers[0].id;
    let bestPenalty = Number.POSITIVE_INFINITY;
    for (const member of divisionMembers) {
      next[unit.id] = member.id;
      const penalty = projectedPenalty(units, next);
      if (penalty < bestPenalty) { best = member.id; bestPenalty = penalty; }
    }
    next[unit.id] = best;
  }
  return next;
}
