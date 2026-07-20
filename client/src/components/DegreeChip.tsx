import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { apiClient } from "@/services/api";

/** English ordinal: 1 → "1st", 2 → "2nd", 3 → "3rd", 11 → "11th", 22 → "22nd", … */
export function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/**
 * The follows-graph "degree" chip (LinkedIn-style "2nd degree"), shown in the
 * profile stats row alongside Following / Verified Followers. Reads the shortest
 * path from the viewer (`fromPubkey`) to the profile (`toPubkey`). Hover (desktop)
 * explains it; tapping opens the full path page. Renders nothing until loaded, or
 * when viewing your own profile (from === to). Parent gates on signed-in + scored.
 */
export function DegreeChip({
  fromPubkey,
  toPubkey,
  rawId,
  variant = "muted",
}: {
  fromPubkey: string;
  toPubkey: string;
  rawId: string;
  /** "muted" matches SharePage's slate-500 stats row; "bold" matches ProfilePage's bold counts. */
  variant?: "muted" | "bold";
}) {
  const enabled = !!fromPubkey && !!toPubkey && fromPubkey !== toPubkey;
  const query = useQuery({
    queryKey: ["shortestPath", fromPubkey, toPubkey],
    queryFn: () => apiClient.getShortestPath({ from: fromPubkey, to: toPubkey }),
    enabled,
    staleTime: 5 * 60_000,
    retry: false,
  });

  const d = query.data;
  if (!enabled || !d) return null;

  const reachable = d.reachable && d.hops > 0;
  const tip = reachable
    ? d.hops === 1
      ? "You follow this person directly (1st degree). Tap to see the connection."
      : `${ordinal(d.hops)} degree — you're connected through ${d.hops - 1} ${d.hops - 1 === 1 ? "person" : "people"}. Tap to see how.`
    : "Not reachable through the people you follow.";

  const bold = variant === "bold";
  const numCls = bold ? "font-bold text-slate-900 tabular-nums" : "font-semibold text-slate-700";
  const labelCls = bold ? "text-slate-500 ml-1" : "";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          href={`/p/${rawId}/hops`}
          className="cursor-help hover:opacity-80 transition-opacity"
          data-testid="stat-hops"
        >
          {reachable ? (
            <>
              <span className={numCls}>{ordinal(d.hops)}</span>
              <span className={labelCls || undefined}> degree</span>
            </>
          ) : (
            <span className={numCls}>Not connected</span>
          )}
        </Link>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[240px] bg-white/95 backdrop-blur border border-slate-200 shadow-lg">
        <p className="text-xs leading-relaxed text-slate-600">{tip}</p>
      </TooltipContent>
    </Tooltip>
  );
}
