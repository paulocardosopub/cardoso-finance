import type { SupabaseClient } from "@supabase/supabase-js";
import type { MemberRole, MemberVisibility } from "@/types/domain";

export const defaultMemberVisibility: MemberVisibility = {
  showTotalAssets: true,
  showPropertyValues: true,
  showRentalInfo: true,
  showPropertyStatus: true,
  showPhotos: true,
  showLocations: true,
  showMap: true,
  showDocuments: true,
  showOwnershipByBeneficiary: false,
};

export const roleLabels: Record<MemberRole, string> = {
  owner: "Proprietário",
  admin: "Administrador",
  manager: "Gestor",
  employee: "Funcionária",
  viewer: "Membro",
};

export function memberRouteAllowed(pathname: string) {
  const route = pathname.replace(/\/+$/, "") || "/";
  return route === "/" || route === "/imoveis" || route.startsWith("/imoveis/") || route === "/patrimonio" || route === "/despesas" || route === "/mapa" || route === "/documentos";
}

export function employeeRouteAllowed(pathname: string) {
  const route = pathname.replace(/\/+$/, "") || "/";
  return route === "/" || route === "/imoveis" || route.startsWith("/imoveis/") || route === "/mapa";
}

export type AuthorizedDocument = {
  id: string;
  asset_id?: string | null;
  building_id?: string | null;
  unit_id?: string | null;
  name: string;
  category: string;
  storage_path: string;
  mime_type?: string | null;
  size_bytes?: number | null;
  is_primary?: boolean | null;
  created_at?: string | null;
};

export async function listAuthorizedDocuments(supabase: SupabaseClient, organizationId: string, role: MemberRole) {
  if (role === "viewer") {
    const result = await supabase.rpc("list_member_documents", { target_org: organizationId });
    return { data: (result.data ?? []) as AuthorizedDocument[], error: result.error };
  }
  if (role === "employee") {
    const result = await supabase.rpc("list_employee_documents", { target_org: organizationId });
    return { data: (result.data ?? []) as AuthorizedDocument[], error: result.error };
  }
  const result = await supabase
    .from("documents")
    .select("id, asset_id, building_id, unit_id, name, category, storage_path, mime_type, size_bytes, is_primary, created_at")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });
  return { data: (result.data ?? []) as AuthorizedDocument[], error: result.error };
}
