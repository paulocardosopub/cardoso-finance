import type { Building, PropertyUnit } from "@/types/domain";
import { initialBuildings, initialUnitsByBuilding } from "@/lib/initial-property-data";

export const initialBuildingsForApp: Building[] = initialBuildings;
export const initialUnitsForApp: PropertyUnit[] = initialUnitsByBuilding.get("405-cruzeiro") ?? [];
