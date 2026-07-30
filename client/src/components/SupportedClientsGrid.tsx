import { cn } from "@/lib/utils";
import { SUPPORTED_CLIENTS } from "@/config/supportedClients";

/**
 * The "get an app" tile grid — logo · name · platforms, each opening the app's
 * own download page. Shared by the /nostr page and the dashboard's client shelf
 * so the two never drift in either data or appearance.
 *
 * Purely a set of outbound links: Brainstorm can't detect which client someone
 * installed, so this deliberately carries no completion state, checkmarks or
 * task chrome that would imply otherwise.
 */
export function SupportedClientsGrid({
  testIdPrefix = "client-app",
  className,
}: {
  /** Prefix for per-tile test ids, e.g. `nostr-app-amethyst`. */
  testIdPrefix?: string;
  className?: string;
}) {
  return (
    <div className={cn("grid grid-cols-2 sm:grid-cols-4 gap-2.5", className)}>
      {SUPPORTED_CLIENTS.map((c) => (
        <a
          key={c.name}
          href={c.href}
          target="_blank"
          rel="noopener noreferrer"
          className="group flex items-center gap-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-3 hover:border-brand-accent/40 hover:shadow-sm transition-all"
          data-testid={`${testIdPrefix}-${c.name.toLowerCase()}`}
        >
          <img src={c.logo} alt="" className="h-5 w-5 shrink-0 rounded-md object-contain" />
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-slate-900 dark:text-slate-100">{c.name}</p>
            <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">{c.note}</p>
          </div>
        </a>
      ))}
    </div>
  );
}
