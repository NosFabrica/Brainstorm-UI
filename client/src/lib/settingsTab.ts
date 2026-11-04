/**
 * Which Settings tab a link opens, and which tabs a reader has.
 *
 * Messages has its own tab (2026-10-05): a reader looks for message settings
 * under "Messages", not "Trust & search", so the old `?tab=trust&focus=messages`
 * links land on the new tab.
 *
 * One Assistants tab (2026-11-02) in place of three — Brainstorm Assistant,
 * Assistants & Duties, Treasure Map — with views: `yours` (the Assistant this
 * deployment hosts for the reader), `all` (every Assistant they've tagged,
 * across sites), `duties` (what each does) and `map` (the Treasure Map that
 * hands the duties out). The old tabs' links land on their views. The list
 * and duties are internal for now — admins only, as the Dictionary is — so
 * anyone else lands on `yours`. The Map is every reader's own (issue #11):
 * what they sign, never kept from them.
 */
export type AssistantView = "yours" | "all" | "duties" | "map";

export interface SettingsTabEntry<T extends string> {
  key: T;
  /** Admins only, and said so on the tab: what regular users don't see yet. */
  internal: boolean;
}

export interface AssistantViewEntry {
  key: AssistantView;
  label: string;
  internal: boolean;
}

/** Every tab, in order; `internal` ones are admins' only. */
const ALL_TABS = [
  { key: "profile", internal: false },
  { key: "trust", internal: false },
  { key: "assistants", internal: false },
  { key: "messages", internal: false },
  { key: "dictionary", internal: true },
  { key: "billing", internal: false },
] as const;

export type SettingsTabKey = (typeof ALL_TABS)[number]["key"];

const ASSISTANT_VIEWS: readonly AssistantViewEntry[] = [
  { key: "yours", label: "Yours", internal: false },
  { key: "all", label: "All", internal: true },
  { key: "duties", label: "Duties", internal: true },
  { key: "map", label: "Treasure Map", internal: false },
];

/** The tabs a reader has, in order. */
export function settingsTabsFor({ admin }: { admin: boolean }): SettingsTabEntry<SettingsTabKey>[] {
  return ALL_TABS.filter((t) => admin || !t.internal).map((t) => ({ ...t }));
}

/** The Assistants tab's views a reader has, in order. */
export function assistantViewsFor({ admin }: { admin: boolean }): AssistantViewEntry[] {
  return ASSISTANT_VIEWS.filter((v) => admin || !v.internal);
}

/** The tabs that became views of Assistants, and the view each was. */
const OLD_ASSISTANT_TABS: Record<string, AssistantView> = {
  "brainstorm-assistant": "yours",
  "treasure-map": "map",
};

const isView = (v: string | null): v is AssistantView => !!v && ASSISTANT_VIEWS.some((x) => x.key === v);

/**
 * Where a Settings link lands: its tab, and for Assistants its view. Old tabs
 * and old links keep landing where they pointed; a view the reader doesn't have
 * falls back to `yours`; an unknown tab to Profile.
 */
export function settingsTargetFor<T extends string>(
  link: { tab: string | null; view: string | null; focus: string | null },
  available: readonly T[],
  { admin }: { admin: boolean },
): { tab: T | "profile"; view: AssistantView | null } {
  const old = link.tab ? OLD_ASSISTANT_TABS[link.tab] : undefined;
  const tab = settingsTabFor(old ? "assistants" : link.tab, link.focus, available);
  if (tab !== "assistants") return { tab, view: null };
  const wanted: AssistantView = old ?? (isView(link.view) ? link.view : "yours");
  const views = assistantViewsFor({ admin });
  return { tab, view: views.some((v) => v.key === wanted) ? wanted : "yours" };
}

export function settingsTabFor<T extends string>(
  tab: string | null,
  focus: string | null,
  available: readonly T[],
): T | "profile" {
  const wanted = tab === "trust" && focus === "messages" ? "messages" : tab;
  return available.find((t) => t === wanted) ?? "profile";
}
