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

export function PropertyMap({ pins, selectedId, onSelect }: { pins: PropertyMapPin[]; selectedId?: string; onSelect?: (id: string) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    if (mapRef.current) mapRef.current.remove();
    const initial = pins[0] ?? { latitude: -15.7939, longitude: -47.8828 };
    const map = L.map(containerRef.current, { zoomControl: true, scrollWheelZoom: true }).setView([initial.latitude, initial.longitude], pins.length ? 12 : 5);
    mapRef.current = map;
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>' }).addTo(map);
    const markers = pins.map((pin) => {
      const icon = L.divIcon({ className: "property-map-pin", html: `<span style="background:${pinColor(pin.status)}"></span>`, iconSize: [22, 22], iconAnchor: [11, 22], popupAnchor: [0, -20] });
      const marker = L.marker([pin.latitude, pin.longitude], { icon }).addTo(map);
      marker.bindPopup(`<strong>${escapeHtml(pin.name)}</strong><br/><span>${escapeHtml(pin.city || pin.address || "Localização cadastrada")}</span><br/><a href="${pin.googleMapsUrl}" target="_blank" rel="noreferrer">Abrir no Google Maps</a>`);
      marker.on("click", () => onSelect?.(pin.id));
      if (pin.id === selectedId) marker.openPopup();
      return marker;
    });
    if (pins.length > 1) map.fitBounds(L.latLngBounds(pins.map((pin) => [pin.latitude, pin.longitude] as [number, number])), { padding: [32, 32], maxZoom: 14 });
    else if (pins.length === 1) map.setView([pins[0].latitude, pins[0].longitude], 15);
    return () => { markers.forEach((marker) => marker.remove()); map.remove(); mapRef.current = null; };
  }, [onSelect, pins, selectedId]);

  return <div ref={containerRef} className="property-map" aria-label="Mapa dos imóveis" />;
}
