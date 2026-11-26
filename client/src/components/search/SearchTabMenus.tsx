/** The tab row's menus: More ▾ for the verticals past the row, and on All, its categories past the row. */
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { ListKindSearch } from "@/hooks/useListKinds";
import { byCount, type TabCounts } from "@/lib/tabCounts";
import { categoryTestId, type CategoryGroup } from "@/lib/allCategories";
import type { SearchTab } from "@/services/search";
import { MORE_GROUPS, MORE_TABS, SOON_TABS, tabClass } from "./searchTabs";

/** The More ▾ slot: names the folded vertical that is active (so the row
 *  always says where you are), otherwise "More". A plain disclosure, not a
 *  portal — it sits OUTSIDE the scrolling strip so nothing clips it. */
export function MoreTabs({
  tab,
  onChange,
  kinds = [],
  kind = null,
  onKind,
  offers = () => true,
  counts = {},
}: {
  tab: SearchTab;
  onChange: (next: SearchTab) => void;
  /** The kinds with a page of their own (hooks/useListKinds), each in its group. */
  kinds?: readonly ListKindSearch[];
  /** The kind whose page is open, if any. */
  kind?: string | null;
  onKind?: (key: string) => void;
  /** Whether the words find anything under a tab (lib/tabCounts): one known to hold nothing isn't offered. */
  offers?: (key: SearchTab) => boolean;
  /** How many results each tab holds, for the order within a group: most first. */
  counts?: TabCounts;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const activeKind = kinds.find((k) => k.key === kind);
  const active = activeKind ?? (kind ? undefined : MORE_TABS.find((t) => t.key === tab));
  // Each kind sits in its group, after the group's own tabs; a group nobody else uses comes before Lists.
  // Within a group the tabs the words find most come first; a group left with nothing goes, and its
  // heading with it.
  const groups = useMemo(() => {
    const out = MORE_GROUPS.map((g) => ({
      ...g,
      tabs: byCount(
        g.tabs.filter((t) => offers(t.key)),
        counts,
      ),
      kinds: [] as ListKindSearch[],
    }));
    for (const k of kinds) {
      const g = out.find((x) => x.title === k.group);
      if (g) g.kinds.push(k);
      else out.splice(out.length - 1, 0, { title: k.group, tabs: [], kinds: [k] });
    }
    return out.filter((g) => g.tabs.length > 0 || g.kinds.length > 0);
  }, [kinds, offers, counts]);
  // An open menu holds still: what the counts change while it is open waits for it to close, so
  // nothing moves or vanishes under the pointer.
  const [held, setHeld] = useState<typeof groups | null>(null);
  const shown = open && held ? held : groups;

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Nothing behind it for these words, and nothing behind it open: no More.
  if (shown.length === 0 && !active) return null;

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        role="tab"
        aria-selected={!!active}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          if (!open) setHeld(groups);
          setOpen(!open);
        }}
        className={tabClass(!!active) + " inline-flex items-center gap-0.5"}
        data-testid="search-tab-more"
      >
        {active ? active.label : "More"}
        <ChevronDown className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      {open && (
        <div
          role="menu"
          aria-label="More result types"
          className="absolute right-0 top-full z-20 mt-1 min-w-[9rem] rounded-xl border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-700 dark:bg-slate-900"
        >
          {shown.map((g, gi) => (
            <div
              key={g.title ?? "rest"}
              className={gi > 0 ? "mt-1 border-t border-slate-100 pt-1 dark:border-slate-800" : ""}
              role="group"
              aria-label={g.title ?? undefined}
            >
              {g.title && (
                <div
                  className="px-3 pb-0.5 pt-1.5 text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400 dark:text-slate-500"
                  data-testid={`search-tab-group-${g.title.toLowerCase().replace(/[^a-z]+/g, "-")}`}
                >
                  {g.title}
                </div>
              )}
              {g.tabs.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  role="menuitem"
                  aria-current={!kind && tab === t.key ? "true" : undefined}
                  onClick={() => {
                    setOpen(false);
                    onChange(t.key);
                  }}
                  className={
                    "flex w-full items-center rounded-lg px-3 py-1.5 text-left text-[13px] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40 " +
                    (!kind && tab === t.key
                      ? "font-semibold text-brand-deep dark:text-brand-link"
                      : "text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800")
                  }
                  data-testid={`search-tab-${t.key}`}
                >
                  {t.label}
                </button>
              ))}
              {g.kinds.map((k) => (
                <button
                  key={k.key}
                  type="button"
                  role="menuitem"
                  aria-current={kind === k.key ? "true" : undefined}
                  onClick={() => {
                    setOpen(false);
                    onKind?.(k.key);
                  }}
                  className={
                    "flex w-full items-center rounded-lg px-3 py-1.5 text-left text-[13px] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40 " +
                    (kind === k.key
                      ? "font-semibold text-brand-deep dark:text-brand-link"
                      : "text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800")
                  }
                  data-testid={`search-tab-${k.key}`}
                >
                  {k.label}
                </button>
              ))}
              {g.title === "Build" &&
                SOON_TABS.map((t) => (
                  // A muted row, not a door: the Apps launcher's "Soon" treatment.
                  <div
                    key={t.key}
                    role="menuitem"
                    aria-disabled="true"
                    title={t.title}
                    className="flex w-full cursor-default items-center justify-between rounded-lg px-3 py-1.5 text-left text-[13px] text-slate-400 dark:text-slate-500"
                    data-testid={`search-tab-${t.key}-soon`}
                  >
                    {t.label}
                    <span className="ml-3 text-[9px] font-bold uppercase tracking-[0.15em] text-slate-300 dark:text-slate-600">
                      Soon
                    </span>
                  </div>
                ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** On All, its categories past the row (hooks/useAllCategories) under MoreTabs' headings, most results first in each. */
export function MoreCategories({
  groups,
  pressed,
  onPress,
}: {
  groups: readonly CategoryGroup[];
  pressed: string | null;
  onPress: (key: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const active = groups.flatMap((g) => g.categories).find((c) => c.key === pressed);
  // An open menu holds still, as MoreTabs does: counts that land while it is open wait for it to close.
  const [held, setHeld] = useState<readonly CategoryGroup[] | null>(null);
  const shown = open && held ? held : groups;
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  if (shown.length === 0) return null;
  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        role="tab"
        aria-selected={!!active}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          if (!open) setHeld(groups);
          setOpen(!open);
        }}
        className={tabClass(!!active) + " inline-flex items-center gap-0.5"}
        title={active?.name}
        data-testid="search-tab-more"
      >
        <span className="max-w-[8rem] truncate">{active ? active.name : "More"}</span>
        <ChevronDown
          className={`h-3 w-3 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>
      {open && (
        <div
          role="menu"
          aria-label="More categories"
          className="absolute right-0 top-full z-20 mt-1 max-h-[60vh] min-w-[9rem] overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-700 dark:bg-slate-900"
        >
          {shown.map((g, gi) => (
            <div
              key={g.title}
              className={gi > 0 ? "mt-1 border-t border-slate-100 pt-1 dark:border-slate-800" : ""}
              role="group"
              aria-label={g.title}
            >
              <div
                className="px-3 pb-0.5 pt-1.5 text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400 dark:text-slate-500"
                data-testid={`search-category-group-${g.title.toLowerCase().replace(/[^a-z]+/g, "-")}`}
              >
                {g.title}
              </div>
              {g.categories.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  role="menuitem"
                  aria-current={pressed === c.key ? "true" : undefined}
                  onClick={() => {
                    setOpen(false);
                    onPress(c.key);
                  }}
                  className={
                    "flex w-full items-center whitespace-nowrap rounded-lg px-3 py-1.5 text-left text-[13px] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40 " +
                    (pressed === c.key
                      ? "font-semibold text-brand-deep dark:text-brand-link"
                      : "text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800")
                  }
                  data-testid={`search-category-${categoryTestId(c.key)}`}
                >
                  {c.name}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
