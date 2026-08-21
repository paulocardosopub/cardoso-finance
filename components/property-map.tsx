"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export type PropertyMapPin = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  status: string;
  city: string;
  address?: string;
  googleMapsUrl: string;
};

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ?? character);
}

function pinColor(status: string) {
  if (status === "venda") return "#ff8e8e";
  if (status === "vendido") return "#9aa5b8";
  if (status === "reforma") return "#ffd27c";
  return "#80e2b0";
}

export function PropertyMap({ pins, onSelect, onMove }: { pins: PropertyMapPin[]; onSelect?: (id: string) => void; onMove?: (id: string, latitude: number, longitude: number) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const markersRef = useRef(new Map<string, L.Marker>());
  const fittedRef = useRef(false);

  useEffect(() => {
    if (!containerRef.current) return;
    const markers = markersRef.current;
    const map = L.map(containerRef.current, { zoomControl: true, scrollWheelZoom: true }).setView([-15.7939, -47.8828], 5);
    mapRef.current = map;
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>' }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    return () => { map.remove(); mapRef.current = null; layerRef.current = null; markers.clear(); fittedRef.current = false; };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    const nextIds = new Set(pins.map((pin) => pin.id));
    markersRef.current.forEach((marker, id) => {
      if (!nextIds.has(id)) { layer.removeLayer(marker); markersRef.current.delete(id); }
    });
    pins.forEach((pin) => {
      const icon = L.divIcon({ className: "property-map-pin", html: `<span style="background:${pinColor(pin.status)}"></span>`, iconSize: [22, 22], iconAnchor: [11, 22], popupAnchor: [0, -20] });
      const popup = `<strong>${escapeHtml(pin.name)}</strong><br/><span>${escapeHtml(pin.city || pin.address || "Localização cadastrada")}</span><br/><a href="${pin.googleMapsUrl}" target="_blank" rel="noreferrer">Abrir no Google Maps</a>`;
      const existing = markersRef.current.get(pin.id);
      if (existing) {
        existing.setLatLng([pin.latitude, pin.longitude]);
        existing.setIcon(icon);
        existing.setPopupContent(popup);
        return;
      }
      const marker = L.marker([pin.latitude, pin.longitude], { icon, draggable: true }).addTo(layer);
      marker.bindPopup(popup);
      marker.on("click", () => onSelect?.(pin.id));
      marker.on("dragend", () => { const position = marker.getLatLng(); onMove?.(pin.id, position.lat, position.lng); });
      markersRef.current.set(pin.id, marker);
    });
    if (!fittedRef.current && pins.length) {
      if (pins.length > 1) map.fitBounds(L.latLngBounds(pins.map((pin) => [pin.latitude, pin.longitude] as [number, number])), { padding: [32, 32], maxZoom: 14 });
      else map.setView([pins[0].latitude, pins[0].longitude], 15);
      fittedRef.current = true;
    }
    if (!pins.length) fittedRef.current = false;
  }, [onMove, onSelect, pins]);

  return <div ref={containerRef} className="property-map" aria-label="Mapa dos imóveis" />;
}
