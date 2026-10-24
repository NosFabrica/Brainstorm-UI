/**
 * Edit mode's rules for Settings › Treasure Map: which entries an assignment
 * moves, the Map it would publish, the pending changes, and the save note.
 * Pure — nothing here reads, signs or publishes.
 *
 * Ported from Tapestry's Manage your Treasure Map page
 * (ui/src/pages/treasure-map/editTreasureMap.js; its owner's book decisions
 * 8–19, ADRs treasure-map-edit/0003–0005), so an edit made in either app
 * writes the same Map:
 * - assigning a category moves its own entries' first (Preferred) tag to the
 *   new Assistant in place — key spelling and extra elements kept, backups
 *   left as they are — and adds each family entry the Map has none of;
 * - "everything" does the same for the bare `*` entry, with no relay;
 * - an override removes the category's individually assigned duties whole;
 * - the backup switch leaves each draft-grammar key its first entry;
 * - every other tag keeps its bytes and its place.
 */
import { CATEGORIES, entryOf, roleOf, type ByCategory, type MapCategory } from "@/lib/treasureMapCards";

type Tag = string[];

/** Each category's family entries, in the order an assignment adds the ones the Map has none of. */
export const FAMILY: ByCategory<string[]> = { scores: ["3038x"], lists: ["3039x"], concepts: ["39998", "39999"] };

/** The pending edit: each a lowercase hex pubkey, and the switches. Every step returns a new value. */
export interface PendingEdit {
  scores?: string;
  lists?: string;
  concepts?: string;
  everything?: string;
  override?: Partial<Record<MapCategory, true>>;
  backups?: true;
}

/** The relay an edited entry names, for an Assistant in a category. */
export type RelayFor = (pubkey: string, category: MapCategory) => string;

const PENDING_KEYS = ["scores", "lists", "concepts", "everything"] as const;
/** A draft-grammar key's kind slot: only these entries have backups. */
const GRAMMAR_SLOT = /^(\d{5}|3038x|3039x|\*)$/;

/** The Map's tags with the pending edit made. The input is never changed. */
export function editedTags(tags: readonly unknown[], pending: PendingEdit, relayFor: RelayFor): unknown[] {
  const source = Array.isArray(tags) ? tags : [];
  const out: unknown[] = source.map((tag) => (Array.isArray(tag) ? [...tag] : tag));
  const entries = source.map(entryOf);
  const want = pending && typeof pending === "object" ? pending : {};
  const moved = (i: number, pubkey: string, relay: string) => {
    const tag = source[i] as Tag;
    return [tag[0], pubkey, relay, ...tag.slice(3)];
  };

  for (const category of CATEGORIES) {
    const pubkey = want[category];
    if (!pubkey) continue;
    const seen = new Set<string>();
    entries.forEach((entry, i) => {
      if (!entry || roleOf(category, entry) !== "own" || seen.has(entry.norm)) return;
      seen.add(entry.norm);
      if (entry.pubkey !== pubkey) out[i] = moved(i, pubkey, relayFor(pubkey, category));
    });
    for (const family of FAMILY[category]) {
      if (!entries.some((entry) => entry?.norm === family)) out.push([family, pubkey, relayFor(pubkey, category)]);
    }
  }

  const everyone = want.everything;
  if (everyone) {
    const i = entries.findIndex((entry) => entry?.norm === "*");
    if (i < 0) out.push(["*", everyone, ""]);
    else if (entries[i]!.pubkey !== everyone) out[i] = moved(i, everyone, "");
  }

  // A pending card's override removes its counted duties whole: every tag of each key.
  const drop = new Set<number>();
  const override = want.override && typeof want.override === "object" ? want.override : {};
  for (const category of CATEGORIES) {
    const pubkey = want[category];
    if (!pubkey || !override[category]) continue;
    const duties = new Set(individualDuties(source, category, pubkey));
    entries.forEach((entry, i) => {
      if (entry && roleOf(category, entry) === "individual" && duties.has(entry.norm)) drop.add(i);
    });
  }
  const kept = drop.size === 0 ? out : out.filter((_, i) => !drop.has(i));
  return want.backups ? dropBackups(kept) : kept;
}

/**
 * A category's individually assigned duties an override would remove: the
 * `norm` of each individual entry with a valid tag naming an Assistant other
 * than `pubkey`, each once, in first-seen order. Never throws.
 */
export function individualDuties(tags: readonly unknown[], category: MapCategory, pubkey: string): string[] {
  const out: string[] = [];
  for (const tag of Array.isArray(tags) ? tags : []) {
    const entry = entryOf(tag);
    if (!entry || roleOf(category, entry) !== "individual" || entry.pubkey === pubkey || out.includes(entry.norm)) {
      continue;
    }
    out.push(entry.norm);
  }
  return out;
}

/** The tags with every draft-grammar key keeping only its first entry, however it's spelled. Order kept. */
export function dropBackups(tags: readonly unknown[]): unknown[] {
  const seen = new Set<string>();
  return (Array.isArray(tags) ? tags : []).filter((tag) => {
    const entry = entryOf(tag);
    if (!entry || !GRAMMAR_SLOT.test(entry.slot)) return true;
    if (seen.has(entry.norm)) return false;
    seen.add(entry.norm);
    return true;
  });
}

/** How many tags dropBackups would remove. */
export function backupCount(tags: readonly unknown[]): number {
  const list = Array.isArray(tags) ? tags : [];
  return list.length - dropBackups(list).length;
}

/** The edited Map as Save would sign it: the viewer's kind 10040, its content kept. No id, signature or time. */
export interface MapDraft {
  kind: 10040;
  pubkey: string;
  content: string;
  tags: unknown[];
}

type MapEvent = { tags?: unknown; content?: unknown } | null | undefined;

export function editedDraft({
  event,
  viewer,
  pending,
  relayFor,
}: {
  event: MapEvent;
  viewer: string;
  pending: PendingEdit;
  relayFor: RelayFor;
}): MapDraft {
  return {
    kind: 10040,
    pubkey: viewer,
    content: typeof event?.content === "string" ? event.content : "",
    tags: editedTags(Array.isArray(event?.tags) ? (event.tags as unknown[]) : [], pending, relayFor),
  };
}

export interface EditPlan {
  /** Each pending card's individually assigned duties (its override's count). */
  duties: ByCategory<string[]>;
  /** Backups left after the assignments and overrides. */
  backups: number;
  /** The pending edit that takes effect: without `backups` when there are none to remove. */
  pending: PendingEdit;
  draft: MapDraft;
  /** The draft differs from the published Map — or, with none, adds an entry. */
  changed: boolean;
}

/** Everything the tab shows of an edit, in one pass. */
export function planEdit({
  event,
  viewer,
  pending,
  relayFor,
}: {
  event: MapEvent;
  viewer: string;
  pending: PendingEdit;
  relayFor: RelayFor;
}): EditPlan {
  const tags = Array.isArray(event?.tags) ? (event.tags as unknown[]) : [];
  const want = pending && typeof pending === "object" ? pending : {};
  const duties: ByCategory<string[]> = { scores: [], lists: [], concepts: [] };
  for (const category of CATEGORIES) {
    const pubkey = want[category];
    if (pubkey) duties[category] = individualDuties(tags, category, pubkey);
  }
  const { backups: _backups, ...rest } = want;
  const backups = backupCount(editedTags(tags, rest, relayFor));
  const effective = backups > 0 ? want : rest;
  const draft = editedDraft({ event, viewer, pending: effective, relayFor });
  const changed = event
    ? draft.content !== (typeof event.content === "string" ? event.content : "") ||
      JSON.stringify(draft.tags) !== JSON.stringify(tags)
    : draft.tags.length > 0;
  return { duties, backups, pending: effective, draft, changed };
}

/** The All duties override switch: how many duties the cards' switches count together, and whether it reads on. */
export function overrideAllState(duties: ByCategory<string[]>, pending: PendingEdit): { count: number; on: boolean } {
  const override = pending.override ?? {};
  const withDuties = CATEGORIES.filter((category) => pending[category] && duties[category].length > 0);
  const count = withDuties.reduce((n, category) => n + duties[category].length, 0);
  return { count, on: count > 0 && withDuties.every((category) => override[category] === true) };
}

/**
 * The relay an edited entry names: for the reader's own Assistant here, the
 * relay this deployment publishes that category's insights to; for any other
 * Assistant, and for the everything entry, "".
 */
export function makeRelayFor({
  localPubkey,
  relays,
}: {
  localPubkey: string | null | undefined;
  relays: Partial<ByCategory<string>>;
}): RelayFor {
  return (pubkey, category) => (localPubkey && pubkey === localPubkey ? (relays[category] ?? "") : "");
}

// ── The pending edit's steps. Each returns a new value, and never leaves an empty override or a false flag. ──

function withOverride(pending: PendingEdit, category: MapCategory, on: boolean): PendingEdit {
  const override = { ...(pending.override ?? {}) };
  if (on) override[category] = true;
  else delete override[category];
  const next: PendingEdit = { ...pending, override };
  if (Object.keys(override).length === 0) delete next.override;
  return next;
}

const onlyBackups = (pending: PendingEdit | undefined): PendingEdit => (pending?.backups ? { backups: true } : {});

/** Pick a card's Assistant. Picking its current one undoes the card, its override and the everything entry's change. */
export function pickCategory(
  pending: PendingEdit,
  category: MapCategory,
  pubkey: string,
  current: string | null,
): PendingEdit {
  if (pubkey === current) return undoCategory(pending, category);
  return { ...pending, [category]: pubkey };
}

/** Undo one card's change: its override and the everything entry's change go with it. */
export function undoCategory(pending: PendingEdit, category: MapCategory): PendingEdit {
  const next = withOverride({ ...pending }, category, false);
  delete next[category];
  delete next.everything;
  return next;
}

/** Every card and the everything entry to one Assistant, overrides off — or, when it's already theirs, nothing pending. */
export function pickAll(pending: PendingEdit, pubkey: string, currentAll: string | null): PendingEdit {
  if (pubkey === currentAll) return onlyBackups(pending);
  return { scores: pubkey, lists: pubkey, concepts: pubkey, everything: pubkey, ...onlyBackups(pending) };
}

/** Undo every assignment and override; the backup switch stays. */
export function undoAll(pending: PendingEdit): PendingEdit {
  return onlyBackups(pending);
}

export function setOverride(pending: PendingEdit, category: MapCategory, on: boolean): PendingEdit {
  return withOverride({ ...pending }, category, on);
}

/** All duties' override: on turns on only the cards with duties to override; off turns all three off. */
export function setOverrideAll(pending: PendingEdit, on: boolean, duties: ByCategory<string[]>): PendingEdit {
  return CATEGORIES.reduce((next, category) => withOverride(next, category, on && duties[category].length > 0), {
    ...pending,
  });
}

export function setBackups(pending: PendingEdit, on: boolean): PendingEdit {
  const next = { ...pending };
  if (on) next.backups = true;
  else delete next.backups;
  return next;
}

/**
 * The save note: "No changes yet"; "All duties → {name}" when every card and
 * everything go to one Assistant; else how many changes are pending. The
 * backup switch is one change; overrides are part of their card's. Pass
 * planEdit's pending.
 */
export function saveNote(pending: PendingEdit, nameOf: (pubkey: string) => string): string {
  const set = PENDING_KEYS.filter((key) => pending[key]);
  const count = set.length + (pending.backups ? 1 : 0);
  if (count === 0) return "No changes yet";
  if (!pending.backups && set.length === PENDING_KEYS.length && set.every((key) => pending[key] === pending.scores)) {
    return `All duties → ${nameOf(pending.scores!)}`;
  }
  return `${count} unsaved ${count === 1 ? "change" : "changes"}`;
}

/** A card's current Assistant: its one Assistant when it names exactly one, else null. */
export function currentOf(assistants: readonly string[]): string | null {
  return assistants.length === 1 ? assistants[0] : null;
}

/** The Assistant all three cards name alone, else null. */
export function currentAll(assistants: ByCategory<string[]>): string | null {
  const [first, ...others] = CATEGORIES.map((category) => currentOf(assistants[category]));
  return first && others.every((pubkey) => pubkey === first) ? first : null;
}

// ── Save ──

/** Is `latest` a newer Map than `base`, the one the edit was made on? Any Map is newer than none. */
export function isNewerMap(
  latest: { id: string; created_at: number } | null | undefined,
  base: { id: string; created_at: number } | null | undefined,
): boolean {
  if (!latest) return false;
  if (!base) return true;
  return latest.id !== base.id && latest.created_at >= base.created_at;
}

/** When to stamp the new Map: now, unless the published one is as new or newer — then one second after it. */
export function stampTime(base: { created_at: number } | null | undefined, now: number): number {
  return base ? Math.max(now, base.created_at + 1) : now;
}
