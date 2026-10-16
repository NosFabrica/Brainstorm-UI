import { useState } from "react";
import { ExternalLink, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { osmEmbedUrl, osmPageUrl, type GeohashCell } from "@/lib/geohash";

/**
 * Where an event is, on OpenStreetMap's embedded map, from its NIP-52 `g`.
 * Only on request, as on a list item's page: until the reader asks, the page
 * contacts no map server. A spot gets a pin; a coarse geohash is framed as the
 * area it is (lib/geohash).
 */
export function EventMap({ cell, title }: { cell: GeohashCell & { geohash: string }; title: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-4 space-y-1.5" data-geohash={cell.geohash}>
      {open ? (
        <>
          <iframe
            src={osmEmbedUrl(cell)}
            title={`Map: ${title}`}
            loading="lazy"
            referrerPolicy="no-referrer"
            sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
            className="h-64 w-full rounded-xl border border-border"
            data-testid="event-map"
          />
          <a
            href={osmPageUrl(cell)}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-brand-link dark:text-slate-400"
          >
            Open in OpenStreetMap <ExternalLink className="h-3 w-3" />
          </a>
        </>
      ) : (
        <Button variant="outline" size="sm" onClick={() => setOpen(true)} data-testid="event-map-show">
          <MapPin /> Show on map
          <span className="text-xs font-normal text-slate-400">· openstreetmap.org</span>
        </Button>
      )}
    </div>
  );
}
