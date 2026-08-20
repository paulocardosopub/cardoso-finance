import { createSupabaseBrowserClient } from "@/lib/supabase";
import { initialBuildings, initialProperties } from "@/lib/initial-property-data";

function dbUnitStatus(status: string) {
  if (status === "Alugado") return "rented";
  if (status === "À venda") return "for_sale";
  return "vacant";
}

/** Persiste a planilha inicial uma única vez após a organização ser criada. */
export async function syncInitialPortfolio(organizationId: string) {
  const supabase = createSupabaseBrowserClient();
  if (!supabase) throw new Error("Supabase não configurado");
  const { data: authData } = await supabase.auth.getUser();
  if (authData.user?.email?.toLowerCase() !== "paulocardosopub@gmail.com") return { created: false, buildings: 0, units: 0 };
  const { data: existing } = await supabase.from("assets").select("id").eq("organization_id", organizationId).eq("source_key", "casa-lago-sul").maybeSingle();
  if (existing) return { created: false, buildings: 0, units: 0 };

  let unitCount = 0;
  for (const building of initialBuildings) {
    const rows = initialProperties.filter((property) => property.buildingId === building.id);
    const first = rows[0];
    const { data: asset, error: assetError } = await supabase.from("assets").insert({ organization_id: organizationId, name: building.name, type: "property", current_value: building.value, acquisition_value: null, status: "active", source_key: building.id }).select("id").single();
    if (assetError) throw assetError;
    const { data: dbBuilding, error: buildingError } = await supabase.from("buildings").insert({ asset_id: asset.id, organization_id: organizationId, address: first.label, city: building.city, state: building.state === "—" ? "" : building.state, total_units: building.units, current_value: building.value, acquisition_value: null, status: building.status === "venda" ? "for_sale" : "active", source_key: building.id, notes: "Importado de dados imoveis.xlsx · patrimônio baseado somente em AVALIAÇÃO" }).select("id").single();
    if (buildingError) throw buildingError;
    const units = rows.map((row) => ({ building_id: dbBuilding.id, organization_id: organizationId, code: row.unitCode, unit_type: row.unitType, estimated_value: row.appraisal, potential_rent: row.rent ?? 0, status: dbUnitStatus(row.status), notes: row.notes ?? "", source_key: row.id, quantity: row.unitCount ?? 1 }));
    const { error: unitsError } = await supabase.from("property_units").insert(units);
    if (unitsError) throw unitsError;
    unitCount += units.length;
  }
  return { created: true, buildings: initialBuildings.length, units: unitCount };
}
