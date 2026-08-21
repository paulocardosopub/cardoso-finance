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
  const pins = useMemo<PropertyMapPin[]>(() => {
    const savedPins = buildings.filter((building) => Number.isFinite(building.latitude) && Number.isFinite(building.longitude)).map((building) => ({ id: building.id, name: building.name, latitude: Number(building.latitude), longitude: Number(building.longitude), status: building.status, city: `${building.city}${building.state ? `, ${building.state}` : ""}`, address: building.address, googleMapsUrl: mapsUrl(Number(building.latitude), Number(building.longitude)) }));
    const previewLatitude = Number(form.latitude.replace(",", "."));
    const previewLongitude = Number(form.longitude.replace(",", "."));
    if (selectedBuilding && Number.isFinite(previewLatitude) && Number.isFinite(previewLongitude) && !savedPins.some((pin) => pin.id === selectedBuilding.id)) savedPins.push({ id: selectedBuilding.id, name: `${selectedBuilding.name} (novo pin)`, latitude: previewLatitude, longitude: previewLongitude, status: selectedBuilding.status, city: `${form.city}${form.state ? `, ${form.state}` : ""}`, address: form.address, googleMapsUrl: mapsUrl(previewLatitude, previewLongitude) });
    return savedPins;
  }, [buildings, form.address, form.city, form.latitude, form.longitude, form.state, selectedBuilding]);

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
      const endpoints = postalCode.length >= 5
        ? [`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&country=Brazil&postalcode=${encodeURIComponent(postalCode)}`, `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=br&q=${encodeURIComponent(query)}`]
        : [`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=br&q=${encodeURIComponent(query)}`];
      let first: { lat?: string; lon?: string; display_name?: string } | undefined;
      for (const endpoint of endpoints) {
        const response = await fetch(endpoint, { headers: { Accept: "application/json" } });
        const results = await response.json() as Array<{ lat?: string; lon?: string; display_name?: string }>;
        if (results[0]) { first = results[0]; break; }
      }
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

  const selectedPin = selectedBuilding && Number.isFinite(selectedBuilding.latitude) && Number.isFinite(selectedBuilding.longitude) ? mapsUrl(Number(selectedBuilding.latitude), Number(selectedBuilding.longitude)) : "";
  return <div className="content"><div className="page-heading"><div><div className="eyebrow"><MapPinned size={13} /> Localização da carteira</div><h1>Mapa</h1><p className="subtitle">Visualize os prédios com localização cadastrada e marque novos endereços.</p></div></div>
    {message && <p className={message.startsWith("Não") || message.startsWith("Informe") || message.startsWith("Seu") ? "form-error" : "form-success"}>{message}</p>}
    <div className="map-layout"><section className="panel map-panel"><div className="panel-heading"><div><h2>Imóveis no mapa</h2><p>{pins.length} de {buildings.length} prédios com localização · arraste qualquer pin para ajustar</p></div><MapPinned size={17} color="#80e2b0" /></div><PropertyMap pins={pins} selectedId={selectedBuilding?.id} onSelect={setSelectedId} onMove={movePin} />{pins.length === 0 && <div className="map-empty"><LocateFixed size={20} /><span>Nenhum imóvel tem coordenadas ainda. Selecione um prédio ao lado e use “Localizar endereço”.</span></div>}</section>
      <form className="panel map-location-form" onSubmit={saveLocation}><div className="panel-heading"><div><h2>Localizar prédio</h2><p>Selecione um imóvel, encontre o endereço e salve o pin.</p></div><LocateFixed size={17} color="#80e2b0" /></div><label>Prédio<select value={selectedBuilding?.id ?? ""} onChange={(event) => setSelectedId(event.target.value)}>{buildings.map((building) => <option value={building.id} key={building.id}>{building.name} · {building.status}</option>)}</select></label><label>Endereço<input value={form.address} onChange={(event) => update("address", event.target.value)} placeholder="Rua, número, complemento" /></label><div className="form-grid"><label>Cidade<input value={form.city} onChange={(event) => update("city", event.target.value)} /></label><label>Estado<input value={form.state} onChange={(event) => update("state", event.target.value)} maxLength={2} /></label></div><label>CEP<input value={form.postalCode} onChange={(event) => update("postalCode", event.target.value)} placeholder="00000-000" /></label><button type="button" className="button button-ghost full-width" onClick={() => void locateAddress()} disabled={busy}><LocateFixed size={14} /> {busy ? "Localizando…" : "Localizar endereço"}</button><div className="form-grid"><label>Latitude<input value={form.latitude} onChange={(event) => update("latitude", event.target.value)} placeholder="-15.7939" /></label><label>Longitude<input value={form.longitude} onChange={(event) => update("longitude", event.target.value)} placeholder="-47.8828" /></label></div><div className="onboarding-actions"><span className="muted">A localização é salva somente nesta holding.</span><button type="submit" className="button button-primary" disabled={busy || role === "viewer"}><Save size={14} /> Salvar pin</button></div>{selectedPin && <a className="map-google-link" href={selectedPin} target="_blank" rel="noreferrer"><ExternalLink size={13} /> Abrir no Google Maps</a>}</form></div>
    <p className="map-attribution-note">O mapa usa OpenStreetMap, sem necessidade de chave ou cobrança. Cada pin também possui acesso direto ao Google Maps para rotas e detalhes.</p>
  </div>;
}
