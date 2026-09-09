import type { ReactNode } from "react";
import { Check, Copy, Globe, MoreHorizontal, Smartphone } from "lucide-react";
import amethystLogoImg from "@/assets/amethyst-logo.png";
import nostriaIconImg from "@/assets/nostria-icon.png";
import dittoLogoImg from "@/assets/ditto-logo.png";
import primalLogoImg from "@/assets/primal-logo.png";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCopied } from "@/hooks/useCopied";
import { appLinksFor, type AppLinkId, type OpenEntity } from "@/lib/openInApp";

export type CopyItem = {
  id: string;
  label: string;
  value: string;
  /** What the key is for, under the label — "why would they want this?" */
  hint?: string;
};

/** The ⋯ trigger — the chrome the profile's menu always had, so it sits beside Follow unchanged. */
export const MENU_TRIGGER_CLASS =
  "inline-flex h-9 w-9 md:h-8 md:w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-800 dark:hover:text-slate-200 transition-colors";

// No asset for nostr.band — it falls back to a globe.
const LOGO: Partial<Record<Exclude<AppLinkId, "default">, string>> = {
  amethyst: amethystLogoImg,
  ditto: dittoLogoImg,
  nostria: nostriaIconImg,
  primal: primalLogoImg,
};

/** One copy row: its own 1.5 s "Copied" so two rows never share a check. */
function CopyMenuItem({ item }: { item: CopyItem }) {
  const { copied, copy } = useCopied();
  return (
    <DropdownMenuItem
      className={`gap-2 ${item.hint ? "items-start" : ""}`}
      // The menu stays open: the row itself says it worked.
      onSelect={(e) => {
        e.preventDefault();
        void copy(item.value);
      }}
      data-testid={`menu-copy-${item.id}`}
    >
      {copied ? <Check className={`h-4 w-4 text-emerald-500 ${item.hint ? "mt-0.5" : ""}`} /> : <Copy className={`h-4 w-4 ${item.hint ? "mt-0.5" : ""}`} />}
      <span className="min-w-0">
        <span className="block">{copied ? "Copied" : item.label}</span>
        {item.hint && (
          <span className="block text-[11px] leading-snug text-slate-400 dark:text-slate-500" data-testid={`menu-copy-${item.id}-hint`}>
            {item.hint}
          </span>
        )}
      </span>
    </DropdownMenuItem>
  );
}

/**
 * The ⋯ menu on a public page — profile, note, article. It holds the
 * power-user things so the page stays clean: `leading` (Mute, Report),
 * then copies of the keys, then "Open in" another Nostr client (the offers
 * follow the platform and the kind — lib/openInApp; the section is absent
 * when no client renders the thing), then `trailing` (Advanced view).
 * Team, 2026-09-08: "power users will appreciate this; normies can safely
 * ignore it."
 */
export function EntityMenu({
  entity,
  copies,
  leading,
  trailing,
  triggerTestId = "entity-menu",
  triggerClassName = MENU_TRIGGER_CLASS,
  align = "end",
  ua,
}: {
  entity: OpenEntity;
  copies: CopyItem[];
  leading?: ReactNode;
  trailing?: ReactNode;
  triggerTestId?: string;
  triggerClassName?: string;
  align?: "start" | "center" | "end";
  /** The user agent to judge the platform by — a test seam; the browser's by default. */
  ua?: string;
}) {
  const links = appLinksFor(entity, ua);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className={triggerClassName} aria-label="More actions" data-testid={triggerTestId}>
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      {/* The clipboard's legacy path focuses a hidden textarea; Radix would
          read that as focus leaving and close the menu mid-copy. */}
      <DropdownMenuContent align={align} className="w-56" onFocusOutside={(e) => e.preventDefault()}>
        {leading && (
          <>
            {leading}
            <DropdownMenuSeparator />
          </>
        )}
        {copies.map((item) => (
          <CopyMenuItem key={item.id} item={item} />
        ))}
        {/* Only clients that render this kind — none for a list or a
            listing today (lib/openInApp), and then no heading over nothing. */}
        {links.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-[10px] font-bold tracking-[0.15em] uppercase text-slate-400 dark:text-slate-500">Open in</DropdownMenuLabel>
            {links.map((link) => (
              <DropdownMenuItem key={link.id} asChild className="gap-2">
                <a href={link.href} {...(link.external ? { target: "_blank", rel: "noopener" } : {})} data-testid={`open-${link.id}`}>
                  {link.id === "default" ? (
                    <Smartphone className="h-4 w-4" />
                  ) : LOGO[link.id] ? (
                    <img src={LOGO[link.id]} alt="" className="h-4 w-4 rounded object-contain" />
                  ) : (
                    <Globe className="h-4 w-4" />
                  )}
                  {link.label}
                </a>
              </DropdownMenuItem>
            ))}
          </>
        )}
        {trailing && (
          <>
            <DropdownMenuSeparator />
            {trailing}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
