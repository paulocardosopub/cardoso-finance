import { createSupabaseBrowserClient } from "@/lib/supabase";

/** Solicita ao banco a importação protegida da carteira Cardoso.
 * Os dados da planilha não são enviados no bundle público; a função SQL só
 * aceita o usuário Paulo e grava na organização dele.
 */
export async function syncInitialPortfolio(organizationId: string) {
  const supabase = createSupabaseBrowserClient();
  if (!supabase) throw new Error("Supabase não configurado");
  const { data: authData } = await supabase.auth.getUser();
  if (authData.user?.email?.toLowerCase() !== "paulocardosopub@gmail.com") return { created: false, buildings: 0, units: 0 };
  const { data, error } = await supabase.rpc("seed_cardoso_portfolio", { target_org: organizationId });
  if (error) throw error;
  return { created: Number(data ?? 0) > 0, buildings: 21, units: Number(data ?? 0) };
}
