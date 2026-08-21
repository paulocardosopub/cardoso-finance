import type { Building } from "@/types/domain";

export function buildingPath(building: Pick<Building, "id" | "dbId" | "sourceKey">) {
  if (building.sourceKey) return `/imoveis/${encodeURIComponent(building.sourceKey)}`;
  return `/imoveis/novo?building=${encodeURIComponent(building.dbId ?? building.id)}`;
}
