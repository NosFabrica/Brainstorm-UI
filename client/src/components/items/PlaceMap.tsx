/**
 * The place on a map, drawn by Leaflet on Esri's light gray canvas — a
 * muted, keyless basemap with its labels laid over — with Brainstorm's own
 * pin: the page's picture, since no place in the list has a photo yet. Leaflet and its stylesheet load only on a place's
 * page (a dynamic import), never in the app's first bundle. The map doesn't
 * take the wheel: scrolling the page past it keeps scrolling; zoom with the
 * buttons or a pinch. The container is a stacking context of its own
 * (`isolate z-0`): Leaflet's panes and controls carry z-indexes in the
 * hundreds, and without that they'd rise over the app's header and menus.
 * It stays in the page: no link out to a bigger map;
 * the Directions action is the way to a maps app.
 */
import { useEffect, useRef, useState } from "react";

const PIN = `<svg xmlns="http://www.w3.org/2000/svg" width="34" height="42" viewBox="0 0 34 42"><path d="M17 41c-1 0-15-16-15-24a15 15 0 1 1 30 0c0 8-14 24-15 24Z" fill="#7237ff" stroke="#fff" stroke-width="2"/><circle cx="17" cy="17" r="5.5" fill="#fff"/></svg>`;

export function PlaceMap({
  lat,
  lon,
  name,
  compact = false,
}: {
  lat: number;
  lon: number;
  name: string;
  /** A tile under the actions, when a photo is the hero; else the hero itself. */
  compact?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let map: import("leaflet").Map | null = null;
    (async () => {
      try {
        const [L] = await Promise.all([import("leaflet"), import("leaflet/dist/leaflet.css")]);
        if (cancelled || !host.current) return;
        map = L.map(host.current, {
          center: [lat, lon],
          zoom: 15,
          maxZoom: 16,
          scrollWheelZoom: false,
          attributionControl: true,
          zoomControl: true,
        });
        map.attributionControl.setPrefix(false);
        const esri = "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas";
        L.tileLayer(`${esri}/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}`, {
          maxZoom: 16,
          attribution:
            'Tiles &copy; <a href="https://www.esri.com/" target="_blank" rel="noopener">Esri</a> &mdash; Esri, HERE, Garmin, OpenStreetMap contributors',
        }).addTo(map);
        L.tileLayer(`${esri}/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}`, { maxZoom: 16 }).addTo(map);
        L.marker([lat, lon], {
          icon: L.divIcon({ html: PIN, className: "", iconSize: [34, 42], iconAnchor: [17, 41] }),
          title: name,
          keyboard: false,
        }).addTo(map);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [lat, lon, name]);

  return (
    <div className="space-y-1.5" data-testid="place-map">
      <div
        ref={host}
        className={`${compact ? "aspect-[16/6] sm:aspect-[16/5]" : "aspect-[16/9] sm:aspect-[16/7]"} relative isolate z-0 w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-800 [&_.leaflet-control-attribution]:text-[10px] [&_.leaflet-control-attribution]:text-slate-500`}
        role="img"
        aria-label={`Map showing ${name}`}
      >
        {failed && (
          <p className="flex h-full items-center justify-center text-sm text-slate-500">The map couldn&rsquo;t load.</p>
        )}
      </div>
    </div>
  );
}
