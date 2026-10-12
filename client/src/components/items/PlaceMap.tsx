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
  tall = false,
  fill = false,
  hero = false,
}: {
  lat: number;
  lon: number;
  name: string;
  /** A short tile (under a photo, or on a phone before "Larger map"); else the column's map. */
  compact?: boolean;
  /** The phone's expanded map. */
  tall?: boolean;
  /** From sm up, as tall as the column it sits in — the facts beside it set the height. */
  fill?: boolean;
  /** The page's hero band: wide, with the zoom buttons bottom right so a panel can sit top left. */
  hero?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let map: import("leaflet").Map | null = null;
    let cleanup: (() => void) | null = null;
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
          zoomControl: !hero,
        });
        map.attributionControl.setPrefix(false);
        if (hero) {
          L.control.zoom({ position: "bottomright" }).addTo(map);
          // The panel sits over the left of the band from sm up: keep the pin in the open right half.
          if (host.current.clientWidth >= 480)
            map.panBy([-Math.round(host.current.clientWidth * 0.22), 0], { animate: false });
        }
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
        // The page sets the container's height (the column beside it); when that settles, the tiles follow.
        if (typeof ResizeObserver !== "undefined") {
          const ro = new ResizeObserver(() => map?.invalidateSize());
          ro.observe(host.current);
          cleanup = () => ro.disconnect();
        }
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      cleanup?.();
      map?.remove();
    };
  }, [lat, lon, name, hero]);

  return (
    <div className={`space-y-1.5 ${fill ? "sm:flex sm:min-h-0 sm:flex-1 sm:flex-col" : ""}`} data-testid="place-map">
      <div
        ref={host}
        className={`${hero ? "aspect-[16/9] sm:aspect-[16/7]" : tall ? "aspect-[4/5]" : compact ? "aspect-[16/7] sm:aspect-[4/3]" : "aspect-[16/9] sm:aspect-[4/5]"} ${fill ? "sm:aspect-auto sm:h-full sm:min-h-[220px] sm:flex-1" : ""} relative isolate z-0 w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-800 [&_.leaflet-control-attribution]:text-[10px] [&_.leaflet-control-attribution]:text-slate-500`}
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
