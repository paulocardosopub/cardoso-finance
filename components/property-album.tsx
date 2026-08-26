"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight, Image as ImageIcon, Images } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import type { Building } from "@/types/domain";
import { buildingPath } from "@/lib/building-path";
import { usePortfolio } from "@/components/portfolio-provider";
import { listAuthorizedDocuments } from "@/lib/member-access";

type AlbumItem = { unitId: string; building: Building; buildingName: string; code: string; city: string; url: string; isPrimary: boolean };
type StoredPhoto = { url: string; isPrimary: boolean };

export function PropertyAlbum({ buildings, organizationId }: { buildings: Building[]; organizationId: string }) {
  const { role, memberVisibility } = usePortfolio();
  const [items, setItems] = useState<AlbumItem[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);

  const loadAlbum = useCallback(async () => {
    const unitMap = new Map((buildings.flatMap((building) => (building.unitsData ?? []).map((unit) => [unit.id, { building, buildingName: building.name, code: unit.code, city: `${building.city}, ${building.state}` }]))));
    const unitIds = [...unitMap.keys()];
    const supabase = createSupabaseBrowserClient();
    if (!supabase || !unitIds.length || (role === "viewer" && !memberVisibility.showPhotos)) {
      setItems([]);
      return;
    }
    const result = await listAuthorizedDocuments(supabase, organizationId, role, memberVisibility);
    if (result.error) return;
    const grouped = new Map<string, StoredPhoto[]>();
    for (const row of (result.data ?? []).filter((document) => document.category === "photo" && document.unit_id && unitIds.includes(String(document.unit_id)))) {
      const url = (await supabase.storage.from("organization-documents").createSignedUrl(String(row.storage_path), 3600)).data?.signedUrl;
      if (!url) continue;
      const key = String(row.unit_id);
      const photos = grouped.get(key) ?? [];
      photos.push({ url, isPrimary: Boolean(row.is_primary) });
      grouped.set(key, photos);
    }
    const nextItems = [...grouped.entries()].flatMap(([unitId, photos]) => {
      const meta = unitMap.get(unitId);
      if (!meta) return [];
      return photos.sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary)).map((photo) => ({ unitId, ...meta, url: photo.url, isPrimary: photo.isPrimary }));
    });
    setItems(nextItems);
    setActiveIndex((index) => nextItems.length ? index % nextItems.length : 0);
  }, [buildings, memberVisibility, organizationId, role]);

  useEffect(() => {
    void loadAlbum();
    const interval = window.setInterval(() => void loadAlbum(), 30000);
    return () => window.clearInterval(interval);
  }, [loadAlbum]);

  useEffect(() => {
    if (items.length < 2) return;
    const interval = window.setInterval(() => setActiveIndex((index) => (index + 1) % items.length), 5000);
    return () => window.clearInterval(interval);
  }, [items.length]);

  const visibleItems = useMemo(() => {
    if (!items.length) return { previous: null, active: null, next: null };
    const previous = items[(activeIndex - 1 + items.length) % items.length];
    const active = items[activeIndex];
    const next = items[(activeIndex + 1) % items.length];
    return { previous, active, next };
  }, [activeIndex, items]);

  function move(offset: number) {
    if (!items.length) return;
    setActiveIndex((index) => (index + offset + items.length) % items.length);
  }

  return <section className="panel property-album-panel">
    <div className="panel-heading"><div><h2><Images size={16} /> Álbum dos imóveis</h2><p>Fotos principais e imagens carregadas na tela de imóveis</p></div>{items.length > 0 && <span className="album-count">{activeIndex + 1} / {items.length}</span>}</div>
    {visibleItems.active ? <div className="property-album" aria-label="Álbum de fotos dos imóveis">
      {visibleItems.previous && <button type="button" className="album-side album-side-left" onClick={() => move(-1)} aria-label="Foto anterior"><img src={visibleItems.previous.url} alt="" /><span><ChevronLeft size={17} /></span></button>}
      <Link href={buildingPath(visibleItems.active.building)} className="album-main"><img src={visibleItems.active.url} alt={`${visibleItems.active.isPrimary ? "Foto principal" : "Foto"} de ${visibleItems.active.code}`} /><div className="album-caption"><strong>{visibleItems.active.code}{visibleItems.active.isPrimary ? " · Principal" : ""}</strong><small>{visibleItems.active.buildingName} · {visibleItems.active.city}</small></div></Link>
      {visibleItems.next && <button type="button" className="album-side album-side-right" onClick={() => move(1)} aria-label="Próxima foto"><img src={visibleItems.next.url} alt="" /><span><ChevronRight size={17} /></span></button>}
      <div className="album-dots" aria-label="Selecionar foto">{items.map((item, index) => <button type="button" key={`${item.unitId}-${index}`} className={index === activeIndex ? "active" : ""} onClick={() => setActiveIndex(index)} aria-label={`Mostrar ${item.code}`} />)}</div>
    </div> : <div className="album-empty"><ImageIcon size={24} /><p>As fotos dos imóveis aparecerão aqui assim que forem carregadas.</p></div>}
  </section>;
}
