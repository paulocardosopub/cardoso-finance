import type { SupabaseClient } from "@supabase/supabase-js";

export async function uploadPaymentProof(
  supabase: SupabaseClient,
  organizationId: string,
  buildingId: string | null | undefined,
  unitId: string,
  competence: string,
  file: File,
) {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
  const path = `${organizationId}/payment-receipts/${unitId}/${competence}-${crypto.randomUUID()}-${safeName}`;
  const upload = await supabase.storage.from("organization-documents").upload(path, file, { upsert: false, contentType: file.type || undefined });
  if (upload.error) return { path: null, error: upload.error.message };
  const user = (await supabase.auth.getUser()).data.user;
  const inserted = await supabase.from("documents").insert({ organization_id: organizationId, building_id: buildingId || null, unit_id: unitId, name: file.name, category: "payment_receipt", storage_path: path, mime_type: file.type || null, size_bytes: file.size, uploaded_by: user?.id });
  if (inserted.error) {
    await supabase.storage.from("organization-documents").remove([path]);
    return { path: null, error: inserted.error.message };
  }
  return { path, error: null };
}
