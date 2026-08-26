import type { DeviceLocation } from "@/lib/geolocation";

export type VisitAddress = { street?: string; neighborhood?: string; postalCode?: string };

type PhotonResponse = { features?: Array<{ properties?: Record<string, string | undefined> }> };
type NominatimResponse = { address?: Record<string, string | undefined> };

function fromPhoton(data: PhotonResponse): VisitAddress | null {
  const address = data.features?.[0]?.properties ?? {};
  const streetName = address.street ?? (address.type === "street" ? address.name : undefined);
  const street = [streetName, address.housenumber].filter(Boolean).join(", ") || undefined;
  const neighborhood = address.district ?? address.locality ?? address.city;
  const postalCode = address.postcode;
  return street || neighborhood || postalCode ? { street, neighborhood, postalCode } : null;
}

function fromNominatim(data: NominatimResponse): VisitAddress | null {
  const address = data.address ?? {};
  const street = [address.road ?? address.pedestrian ?? address.footway, address.house_number].filter(Boolean).join(", ") || undefined;
  const neighborhood = address.neighbourhood ?? address.suburb ?? address.city_district ?? address.town ?? address.city;
  const postalCode = address.postcode;
  return street || neighborhood || postalCode ? { street, neighborhood, postalCode } : null;
}

/** Resolves a device coordinate to a nearby street, neighborhood and CEP. */
export async function reverseGeocodeLocation(location: DeviceLocation): Promise<VisitAddress | null> {
  if (!Number.isFinite(location.latitude) || !Number.isFinite(location.longitude)) return null;
  try {
    // Nominatim retorna a via e o bairro com mais consistência no Brasil.
    const nominatimParams = new URLSearchParams({ format: "jsonv2", addressdetails: "1", zoom: "18", "accept-language": "pt-BR", lat: String(location.latitude), lon: String(location.longitude) });
    const nominatim = await fetch(`https://nominatim.openstreetmap.org/reverse?${nominatimParams.toString()}`, { headers: { Accept: "application/json" }, cache: "no-store" });
    if (nominatim.ok) {
      const address = fromNominatim(await nominatim.json() as NominatimResponse);
      if (address?.street || address?.neighborhood) return address;
    }
    // Fallback para Photon quando o Nominatim estiver indisponível ou limitado.
    const photonParams = new URLSearchParams({ lat: String(location.latitude), lon: String(location.longitude) });
    const photon = await fetch(`https://photon.komoot.io/reverse?${photonParams.toString()}`, { headers: { Accept: "application/json" }, cache: "no-store" });
    return photon.ok ? fromPhoton(await photon.json() as PhotonResponse) : null;
  } catch {
    return null;
  }
}

export function formatVisitAddress(address: VisitAddress): string {
  const parts = [address.street, address.neighborhood, address.postalCode ? `CEP ${address.postalCode}` : undefined].filter(Boolean);
  return parts.length ? `Próximo a ${parts.join(" · ")}` : "";
}
