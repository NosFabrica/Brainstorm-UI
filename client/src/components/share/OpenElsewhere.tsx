import { AppLinkIcon } from "@/components/share/AppLinkIcon";
import { appLinksFor, type OpenEntity } from "@/lib/openInApp";

// The house secondary pill (AppHero's Website / Source links).
const PILL =
  "inline-flex items-center justify-center gap-1.5 rounded-full border border-slate-200 dark:border-slate-700 px-3.5 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:border-brand-accent/40 transition-colors sm:py-1.5";

/**
 * "Try it in another client" — the not-found state's handoff. Brainstorm
 * could not load the thing from its relays, so it offers the clients that
 * render this kind (lib/openInApp — the ⋯ menu's list), each opening the
 * SAME entity. Before this the article page opened Nostria's homepage on a
 * desktop (Benjamin, 2026-09-09: "this should be fixed"). Nothing renders
 * when no client is offered — an honest dead end beats a wrong door.
 */
export function OpenElsewhere({ entity, ua, className = "" }: { entity: OpenEntity; ua?: string; className?: string }) {
  const links = appLinksFor(entity, ua);
  if (!links.length) return null;
  return (
    <div className={className} data-testid="open-elsewhere">
      <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Try it in another client</p>
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        {links.map((link) => (
          <a
            key={link.id}
            href={link.href}
            {...(link.external ? { target: "_blank", rel: "noopener" } : {})}
            className={PILL}
            data-testid={`open-elsewhere-${link.id}`}
          >
            <AppLinkIcon id={link.id} />
            {link.label}
          </a>
        ))}
      </div>
    </div>
  );
}
