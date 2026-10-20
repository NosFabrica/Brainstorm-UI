/**
 * Several places on one map, each a pin — a search's places at a glance.
 * Loaded on demand like the place page's map (PlaceMap), with the same tiles.
 */
import { useEffect, useRef } from "react";

export interface MapPin {
  lat: number;
  lon: number;
  name: string;
}

export function PlacesMap({ pins, className = "" }: { pins: MapPin[]; className?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const key = pins.map((p) => `${p.lat},${p.lon}`).join("|");
  useEffect(() => {
    let map: import("leaflet").Map | null = null;
    let cancelled = false;
    void (async () => {
      try {
        const [L] = await Promise.all([import("leaflet"), import("leaflet/dist/leaflet.css")]);
        if (cancelled || !host.current || pins.length === 0) return;
        map = L.map(host.current, { scrollWheelZoom: false, attributionControl: true, zoomControl: false });
        map.attributionControl.setPrefix(false);
        const esri = "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas";
        L.tileLayer(`${esri}/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}`, {
          maxZoom: 16,
          attribution: "Tiles &copy; Esri &mdash; Esri, HERE, Garmin, OpenStreetMap contributors",
        }).addTo(map);
        for (const p of pins)
          L.circleMarker([p.lat, p.lon], { radius: 6, color: "#fff", weight: 2, fillColor: "#7237FF", fillOpacity: 1 })
            .bindTooltip(p.name)
            .addTo(map);
        map.fitBounds(L.latLngBounds(pins.map((p) => [p.lat, p.lon] as [number, number])), {
          padding: [20, 20],
          maxZoom: 14,
        });
      } catch {
        /* no map: the list stands on its own */
      }
    })();
    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  if (pins.length === 0) return null;
  return (
    <div
      className={`relative isolate z-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-800 [&_.leaflet-control-attribution]:text-[9px] dark:[&_.leaflet-tile-pane]:[filter:invert(1)_hue-rotate(180deg)_brightness(0.82)_contrast(0.9)] ${className}`}
      data-testid="places-map"
    >
      <div ref={host} className="h-full w-full" role="img" aria-label={`Map of ${pins.length} places`} />
    </div>
  );
}
