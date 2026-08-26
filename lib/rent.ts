import type { Building, PropertyUnit } from "@/types/domain";

/** Monthly rent represented by a unit row. Quantity counts physical units but
 * does not multiply the rent: grouped rows already store the total contract. */
export function unitMonthlyRent(unit: Pick<PropertyUnit, "rent" | "quantity">): number {
  const rent = Number(unit.rent || 0);
  return rent > 0 ? rent : 0;
}

export function unitsMonthlyRent(units: PropertyUnit[] | undefined): number {
  return (units ?? []).reduce((total, unit) => total + unitMonthlyRent(unit), 0);
}

export function buildingMonthlyRent(building: Pick<Building, "unitsData" | "revenue">): number {
  return building.unitsData ? unitsMonthlyRent(building.unitsData) : Number(building.revenue || 0);
}

export function buildingsMonthlyRent(buildings: Array<Pick<Building, "unitsData" | "revenue">>): number {
  return buildings.reduce((total, building) => total + buildingMonthlyRent(building), 0);
}
