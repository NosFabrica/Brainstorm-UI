import type { ComponentType } from "react";
import { Link } from "wouter";
import { ChefHat, FileText, GitBranch, Image as ImageIcon, Music, Radio, ShoppingBag } from "lucide-react";
import { Chip } from "@/components/ui/chip";
import { cn } from "@/lib/utils";
import { scopedSearchHref } from "@/lib/searchSyntax";
import { chipAriaLabel, type PersonContent, type PersonContentKey } from "@/lib/personContent";

/**
 * What a person publishes, as chips on their row in search — "Shop",
 * "Recipes", "Live" — each a link to the search scoped to them on that tab.
 * Google's sitelinks, for people.
 *
 * The outer span is always rendered and reserves the row's slot, so names
 * paint first and nothing jumps when the answer lands; the caller's reveal
 * rule (hover on desktop) lives on it. The inner span fades the chips in.
 * A chip is a real link (middle-click, new tab), muted until hovered; its
 * mousedown is swallowed so the search box keeps focus, and its click never
 * reaches the row, whose own click opens the profile.
 */
const ICONS: Record<PersonContentKey, ComponentType<{ className?: string }>> = {
  shop: ShoppingBag,
  articles: FileText,
  recipes: ChefHat,
  music: Music,
  media: ImageIcon,
  live: Radio,
  repos: GitBranch,
};

export function PersonContentChips({
  pubkey,
  name,
  content,
  className = "",
  onNavigate,
  linkTabIndex,
  testId = "person-content-chips",
}: {
  pubkey: string;
  name: string;
  /** Undefined while the lookup is out; an empty list when there is nothing to say. */
  content: PersonContent | undefined;
  className?: string;
  /** The surface closes its own panel or sheet. */
  onNavigate?: () => void;
  /** -1 inside listbox rows, where the input owns focus. */
  linkTabIndex?: number;
  testId?: string;
}) {
  const chips = content?.chips ?? [];
  return (
    <span className={cn("inline-flex h-5 shrink-0 items-center", className)} data-state={content ? "ready" : "pending"} data-testid={testId}>
      <span className={cn("flex items-center gap-1 transition-opacity duration-200", chips.length ? "opacity-100" : "opacity-0")}>
        {chips.map((c) => {
          const label = chipAriaLabel(name, c);
          return (
            <Link
              key={c.key}
              href={scopedSearchHref(pubkey, c.tab)}
              aria-label={label}
              title={label}
              tabIndex={linkTabIndex}
              className="rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40"
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => {
                e.stopPropagation();
                onNavigate?.();
              }}
              data-testid={`person-content-chip-${c.key}`}
            >
              <Chip
                tone="slate"
                size="sm"
                icon={ICONS[c.key]}
                className="cursor-pointer transition-colors hover:border-indigo-200 hover:bg-indigo-50 hover:text-brand-deep active:bg-indigo-100 dark:hover:border-indigo-500/25 dark:hover:bg-indigo-500/10 dark:hover:text-brand-link dark:active:bg-indigo-500/20"
              >
                {c.liveNow && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" data-testid="person-content-live-dot" aria-hidden="true" />}
                <span className="hidden sm:inline">{c.label}</span>
              </Chip>
            </Link>
          );
        })}
      </span>
    </span>
  );
}
