import type { Building } from "@/types/domain";

const preferredKeys = ["casa-lago-sul", "405-cruzeiro"];

export function buildingOrderRank(building: Pick<Building, "id" | "dbId" | "sourceKey" | "name">) {
  const key = `${building.id} ${building.dbId ?? ""} ${building.sourceKey ?? ""} ${building.name}`.toLowerCase();
  const index = preferredKeys.findIndex((preferred) => key.includes(preferred));
  return index === -1 ? preferredKeys.length : index;
}

export function sortBuildings<T extends Pick<Building, "id" | "dbId" | "sourceKey" | "name">>(buildings: T[]) {
  return [...buildings].sort((left, right) => buildingOrderRank(left) - buildingOrderRank(right) || left.name.localeCompare(right.name, "pt-BR"));
}

export function buildingIsForSale(building: Pick<Building, "status" | "unitsData">) {
  return building.status === "venda" || (building.unitsData ?? []).some((unit) => unit.status === "venda" || unit.status === "venda_alugado");
}

export function sortBuildingsForDisplay<T extends Pick<Building, "id" | "dbId" | "sourceKey" | "name" | "status" | "unitsData">>(buildings: T[]) {
  return [...buildings].sort((left, right) => Number(buildingIsForSale(right)) - Number(buildingIsForSale(left)) || buildingOrderRank(left) - buildingOrderRank(right) || left.name.localeCompare(right.name, "pt-BR"));
}
