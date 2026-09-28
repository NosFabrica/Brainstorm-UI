import { getSeenRelays } from "applesauce-core/helpers/relays";
import { technicalView } from "@/lib/technicalView";

// ViaRelay — which relay served this event, in the technical view only: the
// line for anyone asking "why can't others see my post". applesauce records
// the relays an event was seen on; the byline names the first, quietly, and
// hover lists them all. Nothing renders with the view off.
//
//   <ViaRelay event={hit.event} />

const host = (url: string) => url.replace(/^wss?:\/\//, "").replace(/\/+$/, "");

export function ViaRelay({ event, className }: { event: { kind: number; id: string }; className?: string }) {
  if (!technicalView()) return null;
  const seen = [...(getSeenRelays(event as Parameters<typeof getSeenRelays>[0]) ?? [])].map(host).filter(Boolean);
  if (!seen.length) return null;
  return (
    <span className={`shrink-0 font-mono text-[10px] text-slate-400 dark:text-slate-500 ${className ?? ""}`} title={seen.length > 1 ? `seen on ${seen.join(", ")}` : `seen on ${seen[0]}`} data-testid="via-relay">
      via {seen[0]}
    </span>
  );
}
