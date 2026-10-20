/**
 * Several places on one map, each a pin — a search's places at a glance.
 * Loaded on demand like the place page's map (PlaceMap), with the same tiles.
 * A pin with a label wears it (its row's number beside the map); the one
 * the reader points at in the list is lit, and a tapped pin says which.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Maximize2, Minus, Plus } from "lucide-react";

/** What a map shows, edge to edge: the area a search of it asks for. */
export interface MapView {
  south: number;
  west: number;
  north: number;
  east: number;
}

export interface MapPin {
  lat: number;
  lon: number;
  name: string;
  /** What the pin wears: its row's number in the list beside the map. */
  label?: string;
  /** An event's pin wears the event's own face, not a place's. */
  kind?: "place" | "event";
  /** An event's id: what a tapped event pin says (onEvent). */
  id?: string;
  /** A second line for its tooltip: an event's when. */
  note?: string;
}

/**
 * A tooltip's words as text, never markup: names and titles come from anyone's
 * lists and events, and Leaflet would read a string as HTML.
 */
function tooltipOf(p: MapPin): HTMLElement {
  const el = document.createElement("span");
  const name = document.createElement("strong");
  name.textContent = p.name;
  el.append(name);
  if (p.note) {
    el.append(document.createElement("br"));
    el.append(document.createTextNode(p.note));
  }
  return el;
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
  onEvent,
  controls = false,
  onOpen,
  onMoved,
  view = null,
}: {
  pins: MapPin[];
  className?: string;
  /** The label of the pin to light: the row pointed at beside the map. */
  highlight?: string | null;
  /** A numbered pin tapped. */
  onPin?: (label: string) => void;
  /** An event's pin tapped, by the event's id. */
  onEvent?: (id: string) => void;
  /**
   * A map to work: + and − (on a mouse's screen; touch pinches), Show all to
   * frame the places again, and the wheel zooms — the Places page's map.
   */
  controls?: boolean;
  /** A still map, a glance: tapped, it opens where the map can be worked (the Top page's preview). */
  onOpen?: () => void;
  /** The reader moved the map — dragged, zoomed, pinched — to show this; never the map framing itself. */
  onMoved?: (view: MapView) => void;
  /** An area to show instead of framing the pins: the one a search of the map's area asked for. */
  view?: MapView | null;
}) {
  const onMovedRef = useRef(onMoved);
  onMovedRef.current = onMoved;
  // Set by the reader's own gestures and spent by the move they make, so the map's framing of
  // itself (a filter's new places, Show all) never reads as the reader moving it.
  const readerMoving = useRef(false);
  const byReader = () => {
    readerMoving.current = true;
  };
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const home = useRef<import("leaflet").LatLngBounds | null>(null);
  const host = useRef<HTMLDivElement>(null);
  const markers = useRef(new Map<string, import("leaflet").Marker>());
  const lib = useRef<typeof import("leaflet") | null>(null);
  const onPinRef = useRef(onPin);
  onPinRef.current = onPin;
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;
  const highlightRef = useRef(highlight);
  highlightRef.current = highlight;
  const layer = useRef<import("leaflet").LayerGroup | null>(null);
  // What the view was last framed on: refit when the places change (a filter), not when a
  // town's events arrive after them, so a map the reader has moved stays where they left it.
  const framedOn = useRef<string | null>(null);
  const pendingFrame = useRef<(() => void) | null>(null);
  const [ready, setReady] = useState(false);
  const key = pins.map((p) => `${p.lat},${p.lon},${p.label ?? ""},${p.id ?? ""}`).join("|");
  const placesKey = pins
    .filter((p) => p.kind !== "event")
    .map((p) => `${p.lat},${p.lon}`)
    .join("|");

  // The map itself, made once: its tiles and its controls. Pins come and go on a layer over it.
  useEffect(() => {
    let map: import("leaflet").Map | null = null;
    let cancelled = false;
    void (async () => {
      try {
        const [L] = await Promise.all([import("leaflet"), import("leaflet/dist/leaflet.css")]);
        if (cancelled || !host.current) return;
        lib.current = L;
        const still = !!onOpen;
        map = L.map(host.current, {
          attributionControl: true,
          zoomControl: false,
          // World to street: the tiles stop at 16, and past it the map would be blank.
          minZoom: 3,
          maxZoom: 16,
          scrollWheelZoom: controls,
          wheelPxPerZoomLevel: 90,
          dragging: !still,
          touchZoom: !still,
          doubleClickZoom: !still,
          boxZoom: !still,
          keyboard: !still,
        });
        mapRef.current = map;
        map.attributionControl.setPrefix(false);
        const esri = "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas";
        L.tileLayer(`${esri}/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}`, {
          maxZoom: 16,
          // A wider ring of tiles kept around the view, and none fetched mid-zoom: smoother panning.
          keepBuffer: 4,
          updateWhenZooming: false,
          attribution: "Tiles &copy; Esri &mdash; Esri, HERE, Garmin, OpenStreetMap contributors",
        }).addTo(map);
        layer.current = L.layerGroup().addTo(map);
        map.on("dragstart", byReader);
        map.on("moveend", () => {
          if (!readerMoving.current || !map) return;
          readerMoving.current = false;
          const b = map.getBounds();
          onMovedRef.current?.({ south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() });
        });
        const el = host.current;
        el.addEventListener("wheel", byReader, { passive: true });
        el.addEventListener("dblclick", byReader);
        el.addEventListener("touchstart", (e) => e.touches.length > 1 && byReader(), { passive: true });
        setReady(true);
      } catch {
        /* no map: the list stands on its own */
      }
    })();
    // A box that changes size (a layout switch, a phone turned) keeps its map whole, no reload.
    const resized =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => {
            map?.invalidateSize();
            if (map && map.getSize().x > 0) pendingFrame.current?.();
          })
        : null;
    if (host.current) resized?.observe(host.current);
    return () => {
      cancelled = true;
      resized?.disconnect();
      map?.remove();
      mapRef.current = null;
      layer.current = null;
      framedOn.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // The pins, put on afresh when they change; the map under them stays.
  useEffect(() => {
    const L = lib.current;
    const map = mapRef.current;
    const group = layer.current;
    if (!ready || !L || !map || !group) return;
    group.clearLayers();
    markers.current.clear();
    // A name on hover is a mouse's; a tap opens the pin's card, and a tooltip would cover it.
    const hover = !window.matchMedia?.("(pointer: coarse)").matches;
    for (const p of pins) {
      if (p.kind === "event") {
        const id = p.id;
        const marker = L.marker([p.lat, p.lon], {
          icon: L.divIcon({ html: EVENT_PIN, className: "cursor-pointer", iconSize: [14, 14], iconAnchor: [7, 7] }),
          keyboard: false,
          zIndexOffset: -100,
        });
        if (id) marker.on("click", () => onEventRef.current?.(id));
        (hover ? marker.bindTooltip(tooltipOf(p)) : marker).addTo(group);
      } else if (p.label) {
        const label = p.label;
        const lit = label === highlightRef.current;
        const size = lit ? 28 : 22;
        const marker = L.marker([p.lat, p.lon], {
          icon: L.divIcon({
            html: pinHtml(label, lit),
            className: "",
            iconSize: [size, size],
            iconAnchor: [size / 2, size / 2],
          }),
          keyboard: false,
          zIndexOffset: lit ? 1000 : 0,
        });
        marker.on("click", () => onPinRef.current?.(label));
        (hover ? marker.bindTooltip(tooltipOf(p)) : marker).addTo(group);
        markers.current.set(label, marker);
      } else {
        L.circleMarker([p.lat, p.lon], {
          radius: 6,
          color: "#fff",
          weight: 2,
          fillColor: "#7237FF",
          fillOpacity: 1,
        })
          .bindTooltip(tooltipOf(p))
          .addTo(group);
      }
    }
    const frameKey = view ? `view:${view.south},${view.west},${view.north},${view.east}` : placesKey;
    if (framedOn.current === frameKey || (!view && pins.length === 0)) return;
    // Framed on the places: a town's events further out show when the reader pans.
    const places = pins.filter((p) => p.kind !== "event");
    const framed = places.length > 0 ? places : pins;
    if (framed.length > 0) home.current = L.latLngBounds(framed.map((p) => [p.lat, p.lon] as [number, number]));
    // The first framing jumps; a change of places glides there. An area searched is shown as it was.
    const frame = () => {
      pendingFrame.current = null;
      readerMoving.current = false;
      const animate = framedOn.current !== null;
      if (view)
        map.fitBounds(
          [
            [view.south, view.west],
            [view.north, view.east],
          ],
          { animate },
        );
      else if (home.current) map.fitBounds(home.current, { padding: [24, 24], maxZoom: 14, animate });
      framedOn.current = frameKey;
    };
    // A box with no size yet (hidden, or not laid out) can't be framed: it frames once it has one.
    if (map.getSize().x === 0) pendingFrame.current = frame;
    else frame();
  }, [key, ready, view?.south, view?.west, view?.north, view?.east]); // eslint-disable-line react-hooks/exhaustive-deps

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

  return (
    <div
      hidden={pins.length === 0 && !view}
      className={`relative isolate z-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-800 [&_.leaflet-control-attribution]:text-[9px] dark:[&_.leaflet-tile-pane]:[filter:invert(1)_hue-rotate(180deg)_brightness(0.82)_contrast(0.9)] ${className}`}
      data-testid="places-map"
    >
      {onOpen && (
        // The whole still map is one way in; nothing under it moves.
        <button
          type="button"
          onClick={onOpen}
          aria-label="Open the map"
          className="absolute inset-0 z-[500] cursor-pointer rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-primary"
        />
      )}
      {controls && (
        <div className="absolute right-3 top-1/2 z-[500] flex -translate-y-1/2 flex-col gap-2">
          {/* Touch pinches: + and − only where there's a mouse. */}
          <div className="flex flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-md dark:border-slate-700 dark:bg-slate-900 [@media(pointer:coarse)]:hidden">
            <MapButton
              label="Zoom in"
              onClick={() => {
                byReader();
                mapRef.current?.zoomIn();
              }}
            >
              <Plus className="h-4 w-4" aria-hidden />
            </MapButton>
            <span className="h-px bg-slate-200 dark:bg-slate-700" />
            <MapButton
              label="Zoom out"
              onClick={() => {
                byReader();
                mapRef.current?.zoomOut();
              }}
            >
              <Minus className="h-4 w-4" aria-hidden />
            </MapButton>
          </div>
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-md dark:border-slate-700 dark:bg-slate-900">
            <MapButton
              label="Show all places"
              onClick={() => {
                readerMoving.current = false;
                if (home.current)
                  mapRef.current?.flyToBounds(home.current, { padding: [24, 24], maxZoom: 14, duration: 0.6 });
              }}
            >
              <Maximize2 className="h-4 w-4" aria-hidden />
            </MapButton>
          </div>
        </div>
      )}
      <div
        ref={host}
        className="h-full w-full"
        role="img"
        aria-label={`Map of ${pins.filter((p) => p.kind !== "event").length || pins.length} places`}
      />
    </div>
  );
}

function MapButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex h-9 w-9 items-center justify-center text-slate-700 transition-colors hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
    >
      {children}
    </button>
  );
}
