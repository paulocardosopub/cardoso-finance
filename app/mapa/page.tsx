"use client";

import { ExternalLink, LocateFixed, MapPinned, Save } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PropertyMap, type PropertyMapPin } from "@/components/property-map";
import { usePortfolio } from "@/components/portfolio-provider";
import { createSupabaseBrowserClient } from "@/lib/supabase";

type LocationForm = { address: string; city: string; state: string; postalCode: string; latitude: string; longitude: string };
const emptyLocation: LocationForm = { address: "", city: "", state: "", postalCode: "", latitude: "", longitude: "" };

function formFromBuilding(building: { address?: string; city: string; state: string; postalCode?: string; latitude?: number; longitude?: number }): LocationForm {
  return { address: building.address ?? "", city: building.city ?? "", state: building.state ?? "", postalCode: building.postalCode ?? "", latitude: building.latitude == null ? "" : String(building.latitude), longitude: building.longitude == null ? "" : String(building.longitude) };
}

function mapsUrl(latitude: number, longitude: number) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${latitude},${longitude}`)}`;
}

export default function MapaPage() {
  const { buildings, loading, organizationId, role, refresh } = usePortfolio();
  const [selectedId, setSelectedId] = useState("");
  const [form, setForm] = useState<LocationForm>(emptyLocation);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const selectedBuilding = buildings.find((building) => building.id === selectedId || building.dbId === selectedId) ?? buildings[0];
  const savedPins = useMemo<PropertyMapPin[]>(() => buildings.filter((building) => Number.isFinite(building.latitude) && Number.isFinite(building.longitude)).map((building) => ({ id: building.id, name: building.name, latitude: Number(building.latitude), longitude: Number(building.longitude), status: building.status, city: `${building.city}${building.state ? `, ${building.state}` : ""}`, address: building.address, googleMapsUrl: mapsUrl(Number(building.latitude), Number(building.longitude)) })), [buildings]);
  const pins = useMemo<PropertyMapPin[]>(() => {
    const previewLatitude = Number(form.latitude.replace(",", "."));
    const previewLongitude = Number(form.longitude.replace(",", "."));
    const hasSavedPin = selectedBuilding && savedPins.some((pin) => pin.id === selectedBuilding.id);
    if (selectedBuilding && Number.isFinite(previewLatitude) && Number.isFinite(previewLongitude)) {
      if (hasSavedPin) return savedPins.map((pin) => pin.id === selectedBuilding.id ? { ...pin, latitude: previewLatitude, longitude: previewLongitude, googleMapsUrl: mapsUrl(previewLatitude, previewLongitude) } : pin);
      return [...savedPins, { id: selectedBuilding.id, name: `${selectedBuilding.name} (novo pin)`, latitude: previewLatitude, longitude: previewLongitude, status: selectedBuilding.status, city: `${form.city}${form.state ? `, ${form.state}` : ""}`, address: form.address, googleMapsUrl: mapsUrl(previewLatitude, previewLongitude) }];
    }
    return savedPins;
  }, [form.address, form.city, form.latitude, form.longitude, form.state, savedPins, selectedBuilding]);

  useEffect(() => {
    if (!selectedBuilding) { setSelectedId(""); setForm(emptyLocation); return; }
    setSelectedId(selectedBuilding.id);
    setForm(formFromBuilding(selectedBuilding));
  }, [selectedBuilding]);

  function update(field: keyof LocationForm, value: string) { setForm((current) => ({ ...current, [field]: value })); }

  async function locateAddress() {
    const query = [form.address, form.city, form.state, form.postalCode, "Brasil"].filter(Boolean).join(", ");
    if (!query || busy) return;
    setBusy(true); setMessage("");
    try {
      const postalCode = form.postalCode.replace(/\D/g, "");
      let resolvedAddress = form.address;
      let resolvedCity = form.city;
      let resolvedState = form.state;
      let preciseCoordinates: { latitude: number; longitude: number } | undefined;
      if (postalCode.length === 8) {
        let coordinateData: { address?: string; district?: string; city?: string; state?: string; lat?: string; lng?: string } = {};
        try {
          const coordinateCep = await fetch(`https://cep.awesomeapi.com.br/json/${postalCode}`, { headers: { Accept: "application/json" } });
          if (coordinateCep.ok) coordinateData = await coordinateCep.json() as typeof coordinateData;
        } catch { /* ViaCEP abaixo continua como fallback. */ }
        if (coordinateData.address || coordinateData.city) {
          resolvedAddress = [coordinateData.address, coordinateData.district].filter(Boolean).join(" - ") || resolvedAddress;
          resolvedCity = coordinateData.city || resolvedCity;
          resolvedState = coordinateData.state || resolvedState;
          const latitude = Number(coordinateData.lat);
          const longitude = Number(coordinateData.lng);
          if (Number.isFinite(latitude) && Number.isFinite(longitude)) preciseCoordinates = { latitude, longitude };
        }
        const viaCep = preciseCoordinates ? null : await fetch(`https://viacep.com.br/ws/${postalCode}/json/`, { headers: { Accept: "application/json" } });
        const cepData = viaCep ? await viaCep.json() as { erro?: boolean; logradouro?: string; bairro?: string; localidade?: string; uf?: string } : undefined;
        if (cepData && !cepData.erro) {
          resolvedAddress = [cepData.logradouro, cepData.bairro].filter(Boolean).join(" - ") || resolvedAddress;
          resolvedCity = cepData.localidade || resolvedCity;
          resolvedState = cepData.uf || resolvedState;
        }
        if (resolvedAddress !== form.address || resolvedCity !== form.city || resolvedState !== form.state) {
          setForm((current) => ({ ...current, address: resolvedAddress, city: resolvedCity, state: resolvedState, postalCode: `${postalCode.slice(0, 5)}-${postalCode.slice(5)}` }));
        }
      }
      if (preciseCoordinates) {
        setForm((current) => ({ ...current, address: resolvedAddress, city: resolvedCity, state: resolvedState, postalCode: `${postalCode.slice(0, 5)}-${postalCode.slice(5)}`, latitude: String(preciseCoordinates?.latitude), longitude: String(preciseCoordinates?.longitude) }));
        setMessage(`Área localizada para o CEP ${postalCode.slice(0, 5)}-${postalCode.slice(5)}. Arraste o pin até o imóvel e salve.`);
        return;
      }
      const addressBase = resolvedAddress.split(" - ")[0].trim();
      const geocodeQueries = [
        [addressBase, resolvedCity, resolvedState, "Brasil"].filter(Boolean).join(", "),
        [addressBase, "Brasil"].filter(Boolean).join(", "),
        postalCode ? `${postalCode}, Brasil` : "",
      ].filter(Boolean);
      let feature: { geometry?: { coordinates?: [number, number] }; properties?: { name?: string; city?: string; state?: string } } | undefined;
      for (const geocodeQuery of geocodeQueries) {
        const photonUrl = `https://photon.komoot.io/api/?limit=1&q=${encodeURIComponent(geocodeQuery)}`;
        const photonResponse = await fetch(photonUrl, { headers: { Accept: "application/json" } });
        const photon = await photonResponse.json() as { features?: Array<{ geometry?: { coordinates?: [number, number] }; properties?: { name?: string; city?: string; state?: string } }> };
        if (photon.features?.[0]) { feature = photon.features[0]; break; }
      }
      const coordinates = feature?.geometry?.coordinates;
      const first = coordinates && Number.isFinite(coordinates[0]) && Number.isFinite(coordinates[1]) ? { lat: String(coordinates[1]), lon: String(coordinates[0]), display_name: [feature?.properties?.name, feature?.properties?.city, feature?.properties?.state].filter(Boolean).join(", ") } : undefined;
      if (!first?.lat || !first.lon) { setMessage("Endereço não localizado. Complete rua, cidade e estado e tente novamente."); return; }
      setForm((current) => ({ ...current, latitude: first.lat ?? "", longitude: first.lon ?? "" }));
      setMessage(`Localização encontrada${first.display_name ? `: ${first.display_name}` : "."} Clique em salvar para gravar no prédio.`);
    } catch (error) {
      setMessage(`Não foi possível localizar o endereço: ${error instanceof Error ? error.message : "serviço indisponível"}.`);
    } finally { setBusy(false); }
  }

  async function saveLocation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!organizationId || !selectedBuilding?.dbId || role === "viewer") { setMessage("Seu perfil não pode editar a localização."); return; }
    const latitude = Number(form.latitude.replace(",", "."));
    const longitude = Number(form.longitude.replace(",", "."));
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) { setMessage("Informe uma latitude e longitude válidas ou use Localizar endereço."); return; }
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;
    setBusy(true); setMessage("");
    const result = await supabase.from("buildings").update({ address: form.address.trim(), city: form.city.trim(), state: form.state.trim(), postal_code: form.postalCode.trim() || null, latitude, longitude }).eq("id", selectedBuilding.dbId).eq("organization_id", organizationId);
    if (result.error) setMessage(result.error.message);
    else { setMessage("Endereço e localização salvos."); await refresh(); }
    setBusy(false);
  }

  const movePin = useCallback((id: string, latitude: number, longitude: number) => {
    setSelectedId(id);
    setForm((current) => ({ ...current, latitude: latitude.toFixed(6), longitude: longitude.toFixed(6) }));
    setMessage("Pin reposicionado. Clique em Salvar pin para gravar a nova localização.");
  }, []);

  if (loading) return <div className="content"><div className="empty-state"><p>Carregando mapa...</p></div></div>;
  if (!organizationId) return <div className="content"><div className="empty-state"><h3>Nenhuma organização selecionada</h3><p>Entre em uma holding para visualizar os imóveis no mapa.</p></div></div>;

  const selectedLatitude = Number(form.latitude.replace(",", "."));
  const selectedLongitude = Number(form.longitude.replace(",", "."));
  const selectedPin = Number.isFinite(selectedLatitude) && Number.isFinite(selectedLongitude) ? mapsUrl(selectedLatitude, selectedLongitude) : "";
  return <div className="content"><div className="page-heading"><div><div className="eyebrow"><MapPinned size={13} /> Localização da carteira</div><h1>Mapa</h1><p className="subtitle">Visualize os prédios com localização cadastrada e marque novos endereços.</p></div></div>
    {message && <p className={message.startsWith("Não") || message.startsWith("Informe") || message.startsWith("Seu") ? "form-error" : "form-success"}>{message}</p>}
    <div className="map-layout"><section className="panel map-panel"><div className="panel-heading"><div><h2>Imóveis no mapa</h2><p>{pins.length} de {buildings.length} prédios com localização · arraste qualquer pin para ajustar</p></div><MapPinned size={17} color="#80e2b0" /></div><PropertyMap pins={pins} onSelect={setSelectedId} onMove={movePin} />{pins.length === 0 && <div className="map-empty"><LocateFixed size={20} /><span>Nenhum imóvel tem coordenadas ainda. Selecione um prédio ao lado e use “Localizar endereço”.</span></div>}</section>
      <form className="panel map-location-form" onSubmit={saveLocation}><div className="panel-heading"><div><h2>Localizar prédio</h2><p>Selecione um imóvel, encontre o endereço e salve o pin.</p></div><LocateFixed size={17} color="#80e2b0" /></div><label>Prédio<select value={selectedBuilding?.id ?? ""} onChange={(event) => setSelectedId(event.target.value)}>{buildings.map((building) => <option value={building.id} key={building.id}>{building.name} · {building.status}</option>)}</select></label><label>Endereço<input value={form.address} onChange={(event) => update("address", event.target.value)} placeholder="Rua, número, complemento" /></label><div className="form-grid"><label>Cidade<input value={form.city} onChange={(event) => update("city", event.target.value)} /></label><label>Estado<input value={form.state} onChange={(event) => update("state", event.target.value)} maxLength={2} /></label></div><label>CEP<input value={form.postalCode} onChange={(event) => update("postalCode", event.target.value)} placeholder="00000-000" /></label><button type="button" className="button button-ghost full-width" onClick={() => void locateAddress()} disabled={busy}><LocateFixed size={14} /> {busy ? "Localizando…" : "Localizar endereço"}</button><div className="form-grid"><label>Latitude<input value={form.latitude} onChange={(event) => update("latitude", event.target.value)} placeholder="-15.7939" /></label><label>Longitude<input value={form.longitude} onChange={(event) => update("longitude", event.target.value)} placeholder="-47.8828" /></label></div><div className="onboarding-actions"><span className="muted">A localização é salva somente nesta holding.</span><button type="submit" className="button button-primary" disabled={busy || role === "viewer"}><Save size={14} /> Salvar pin</button></div>{selectedPin && <a className="map-google-link" href={selectedPin} target="_blank" rel="noreferrer"><ExternalLink size={13} /> Abrir no Google Maps</a>}</form></div>
    <p className="map-attribution-note">O mapa usa OpenStreetMap, sem necessidade de chave ou cobrança. Cada pin também possui acesso direto ao Google Maps para rotas e detalhes.</p>
  </div>;
}
