import { useState, useEffect } from "react";
import { formatRelativeAge } from "./format";

export function LiveBadge({
  updatedAt,
  boosting,
  isFetching,
}: {
  updatedAt: number;
  boosting: boolean;
  isFetching?: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const label = formatRelativeAge(updatedAt, now);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
        boosting
          ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-300"
          : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-300"
      }`}
      title={boosting ? "Refreshing more frequently after a recent trigger" : "Auto-refresh enabled"}
      data-testid="badge-live-updated"
    >
      <span className="relative flex h-1.5 w-1.5">
        <span
          className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${isFetching || boosting ? "animate-ping" : ""} ${boosting ? "bg-amber-400" : "bg-emerald-400"}`}
        />
        <span
          className={`relative inline-flex h-1.5 w-1.5 rounded-full ${boosting ? "bg-amber-500" : "bg-emerald-500"}`}
        />
      </span>
      <span className="text-[10px] font-medium normal-case tracking-normal">
        {boosting ? "Boosted • " : "Live • "}
        {label}
      </span>
    </span>
  );
}
