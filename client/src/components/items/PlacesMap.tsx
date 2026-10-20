/**
 * Several places on one map, each a pin — a search's places at a glance.
 * Loaded on demand like the place page's map (PlaceMap), with the same tiles.
 * A pin with a label wears it (its row's number beside the map); the one
 * the reader points at in the list is lit, and a tapped pin says which.
 */
import { useEffect, useRef } from "react";

export interface MapPin {
  lat: number;
  lon: number;
  name: string;
  /** What the pin wears: its row's number in the list beside the map. */
  label?: string;
  /** An event's pin wears the event's own face, not a place's. */
  kind?: "place" | "event";
}

/** An event's pin: a small cyan diamond, set apart from the places' numbered circles. */
const EVENT_PIN =
  '<span style="display:block;height:14px;width:14px;transform:rotate(45deg);border-radius:3px;background:#13D2E5;box-shadow:0 0 0 2px #fff,0 1px 3px rgba(0,0,0,.3)"></span>';

/** A numbered pin's face: brand purple, larger and darker when it's the one pointed at. */
const pinHtml = (label: string, lit: boolean) =>
  `<span style="display:flex;height:${lit ? 28 : 22}px;width:${lit ? 28 : 22}px;align-items:center;justify-content:center;border-radius:9999px;background:${lit ? "#4C1DB8" : "#7237FF"};color:#fff;font:700 ${lit ? 12 : 11}px/1 system-ui,sans-serif;box-shadow:0 0 0 2px #fff,0 1px 3px rgba(0,0,0,.3)">${label}</span>`;

export function PlacesMap({
  pins,
  className = "",
  highlight = null,
  onPin,
}: {
  pins: MapPin[];
  className?: string;
  /** The label of the pin to light: the row pointed at beside the map. */
  highlight?: string | null;
  /** A numbered pin tapped. */
  onPin?: (label: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const markers = useRef(new Map<string, import("leaflet").Marker>());
  const lib = useRef<typeof import("leaflet") | null>(null);
  const onPinRef = useRef(onPin);
  onPinRef.current = onPin;
  const key = pins.map((p) => `${p.lat},${p.lon},${p.label ?? ""}`).join("|");

  useEffect(() => {
    let map: import("leaflet").Map | null = null;
    let cancelled = false;
    void (async () => {
      try {
        const [L] = await Promise.all([import("leaflet"), import("leaflet/dist/leaflet.css")]);
        if (cancelled || !host.current || pins.length === 0) return;
        lib.current = L;
        markers.current.clear();
        map = L.map(host.current, { scrollWheelZoom: false, attributionControl: true, zoomControl: false });
        map.attributionControl.setPrefix(false);
        const esri = "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas";
        L.tileLayer(`${esri}/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}`, {
          maxZoom: 16,
          attribution: "Tiles &copy; Esri &mdash; Esri, HERE, Garmin, OpenStreetMap contributors",
        }).addTo(map);
        for (const p of pins) {
          if (p.kind === "event") {
            L.marker([p.lat, p.lon], {
              icon: L.divIcon({ html: EVENT_PIN, className: "", iconSize: [14, 14], iconAnchor: [7, 7] }),
              keyboard: false,
              zIndexOffset: -100,
            })
              .bindTooltip(p.name)
              .addTo(map);
          } else if (p.label) {
            const label = p.label;
            const marker = L.marker([p.lat, p.lon], {
              icon: L.divIcon({ html: pinHtml(label, false), className: "", iconSize: [22, 22], iconAnchor: [11, 11] }),
              keyboard: false,
            });
            marker.on("click", () => onPinRef.current?.(label));
            marker.bindTooltip(p.name).addTo(map);
            markers.current.set(label, marker);
          } else {
            L.circleMarker([p.lat, p.lon], {
              radius: 6,
              color: "#fff",
              weight: 2,
              fillColor: "#7237FF",
              fillOpacity: 1,
            })
              .bindTooltip(p.name)
              .addTo(map);
          }
        }
        // Framed on the places: a town's events further out show when the reader pans.
        const places = pins.filter((p) => p.kind !== "event");
        const framed = places.length > 0 ? places : pins;
        map.fitBounds(L.latLngBounds(framed.map((p) => [p.lat, p.lon] as [number, number])), {
          padding: [24, 24],
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

  // The lit pin wears the larger face and sits on top; the rest go back to theirs.
  useEffect(() => {
    const L = lib.current;
    if (!L) return;
    for (const [label, marker] of markers.current) {
      const lit = label === highlight;
      const size = lit ? 28 : 22;
      marker.setIcon(
        L.divIcon({
          html: pinHtml(label, lit),
          className: "",
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2],
        }),
      );
      marker.setZIndexOffset(lit ? 1000 : 0);
    }
  }, [highlight]);

  if (pins.length === 0) return null;
  return (
    <div
      className={`relative isolate z-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-800 [&_.leaflet-control-attribution]:text-[9px] dark:[&_.leaflet-tile-pane]:[filter:invert(1)_hue-rotate(180deg)_brightness(0.82)_contrast(0.9)] ${className}`}
      data-testid="places-map"
    >
      <div
        ref={host}
        className="h-full w-full"
        role="img"
        aria-label={`Map of ${pins.filter((p) => p.kind !== "event").length || pins.length} places`}
      />
    </div>
  );
}
