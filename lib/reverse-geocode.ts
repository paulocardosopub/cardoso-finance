import type { DeviceLocation } from "@/lib/geolocation";

export type VisitAddress = { street?: string; neighborhood?: string; postalCode?: string };

type PhotonResponse = { features?: Array<{ properties?: Record<string, string | undefined> }> };

/** Resolves a device coordinate to a nearby street, neighborhood and CEP. */
export async function reverseGeocodeLocation(location: DeviceLocation): Promise<VisitAddress | null> {
  if (!Number.isFinite(location.latitude) || !Number.isFinite(location.longitude)) return null;
  try {
    const params = new URLSearchParams({ lat: String(location.latitude), lon: String(location.longitude), lang: "pt" });
    const response = await fetch(`https://photon.komoot.io/reverse?${params.toString()}`, { headers: { Accept: "application/json" }, cache: "no-store" });
    if (!response.ok) return null;
    const data = await response.json() as PhotonResponse;
    const address = data.features?.[0]?.properties ?? {};
    const streetName = address.street ?? (address.type === "street" ? address.name : undefined);
    const street = [streetName, address.housenumber].filter(Boolean).join(", ") || undefined;
    const neighborhood = address.district ?? address.locality ?? address.city;
    const postalCode = address.postcode;
    if (!street && !neighborhood && !postalCode) return null;
    return { street, neighborhood, postalCode };
  } catch {
    return null;
  }
}

export function formatVisitAddress(address: VisitAddress): string {
  return [address.street, address.neighborhood, address.postalCode ? `CEP ${address.postalCode}` : undefined].filter(Boolean).join(" · ");
}
