import type { DeviceLocation } from "@/lib/geolocation";

export type VisitAddress = { street?: string; neighborhood?: string; postalCode?: string };

type NominatimResponse = { address?: Record<string, string | undefined> };

/** Resolves a device coordinate to a nearby street, neighborhood and CEP. */
export async function reverseGeocodeLocation(location: DeviceLocation): Promise<VisitAddress | null> {
  if (!Number.isFinite(location.latitude) || !Number.isFinite(location.longitude)) return null;
  try {
    const params = new URLSearchParams({ format: "jsonv2", addressdetails: "1", zoom: "18", lat: String(location.latitude), lon: String(location.longitude) });
    const response = await fetch(`https://nominatim.openstreetmap.org/reverse?${params.toString()}`, { headers: { Accept: "application/json", "Accept-Language": "pt-BR" }, cache: "no-store" });
    if (!response.ok) return null;
    const data = await response.json() as NominatimResponse;
    const address = data.address ?? {};
    const streetName = address.road ?? address.pedestrian ?? address.footway ?? address.path;
    const street = [streetName, address.house_number].filter(Boolean).join(", ") || undefined;
    const neighborhood = address.neighbourhood ?? address.suburb ?? address.quarter ?? address.city_district;
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
