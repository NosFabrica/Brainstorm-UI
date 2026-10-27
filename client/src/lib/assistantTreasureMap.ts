/**
 * Your Assistant's Treasure Map, read: the Assistant's own kind 10040, naming
 * itself for the duties it publishes now (a self-Map, nous-clawds4/tapestry
 * protocols/drafts/treasure-maps.md § 9.2), and whether its self-entries are
 * what the server says they should be. Pure.
 *
 * A self-entry is `[<Treasure Map key>, <the Assistant>, <relay>]`: the
 * Assistant publishes at that relay, and keeps up to date, what the key wins.
 * Ported from Tapestry's reader (src/lib/self-map/index.js `readSelfEntries`,
 * `sameSelfEntries`) and its page's rules
 * (ui/src/pages/assistant/assistantTreasureMapCopy.js), so the two apps read
 * one Map the same way.
 *
 * Only the server knows what is live, decides what to list and signs it
 * (docs/assistant/TREASURE-MAP-ASK.md); this compares the two, as lib/dutyMenu
 * does for the Duty Menu.
 */
import { menuKey, menuRelay } from "@/lib/dutyMenu";

export const SELF_MAP_KIND = 10040;

const HEX64 = /^[0-9a-f]{64}$/i;
/** Reserved Concept spellings that name nothing in a Map (§§ 4.5–4.6), beside `39998:` and `39999:`. */
const NAMELESS_KEYS = ["39999:dlist-header", "39999:duty-menu"];

type Ev = { kind: number; pubkey?: string; tags: string[][] };

export interface SelfEntry {
  /** The key in its one spelling: `39998:dlist-header` is `39998`. */
  key: string;
  /** The relay in its one spelling; `""` claims nothing (§ 9.2 "Its relay"). */
  relay: string;
}

/** What the server says of one part of a duty (`GET /user/assistantTreasureMap`'s `duties`). */
export type DutyStatus = "live" | "offered" | "not-offered" | "elsewhere";

export interface DutyLine {
  key: string;
  status: DutyStatus;
  /** Where the offer publishes it; null when it isn't offered here. */
  relay: string | null;
  /** Why an offered part isn't live. */
  reason: string | null;
  /** `upkeep-stopped`'s last publish, in seconds. */
  lastLandedAt: number | null;
  /** The self-entries that should list this part: empty unless it's live. */
  entries: SelfEntry[];
}

/** `GET /user/assistantTreasureMap`'s answer, read. */
export interface TreasureMapCheck {
  assistant: string;
  /** The remembered choice: list the live duties, or none. */
  on: boolean;
  duties: DutyLine[];
  shouldSay: SelfEntry[];
  /** Where a version is sent, and where to look for one. */
  relays: string[];
}

/** Up to date; not published yet (nothing listed); or out of date. */
export type SelfMapStatus = "current" | "missing" | "out-of-date";

/** A duties line as the page shows it: `live` splits by whether the published version lists it. */
export type LineState = "active" | "live-unlisted" | "offered" | "not-offered" | "elsewhere";

const STATUSES: readonly DutyStatus[] = ["live", "offered", "not-offered", "elsewhere"];

/** A self-entry's relay: `""` when missing or empty, else its one spelling, else the string as written. */
function entryRelay(value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") return "";
  return menuRelay(value) ?? value.trim();
}

/** A key a Map can hold, in its one spelling; null when it names nothing. */
function entryKey(value: unknown): string | null {
  const key = menuKey(value);
  return key === null || NAMELESS_KEYS.includes(key) ? null : key;
}

/** `[key, relay]` pairs from the server, in their one spelling; the first per key wins. */
function pairs(value: unknown): SelfEntry[] {
  const out: SelfEntry[] = [];
  for (const p of Array.isArray(value) ? value : []) {
    if (!Array.isArray(p)) continue;
    const key = entryKey(p[0]);
    if (key === null || out.some((e) => e.key === key)) continue;
    out.push({ key, relay: entryRelay(p[1]) });
  }
  return out;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);

/**
 * `GET /user/assistantTreasureMap`'s answer when it is one: a 64-hex
 * `assistant`, a boolean `on`, and `duties` and `shouldSay` arrays. Anything
 * else is null. A server without the route still answers 200 here, because
 * `GET /user/{pubkey}` takes the path for a pubkey, so the shape is the test
 * (as lib/dutyMenu `parseDutyMenuOffer`).
 */
export function parseTreasureMapCheck(json: unknown): TreasureMapCheck | null {
  const o = json as Record<string, unknown> | null;
  if (
    !o ||
    typeof o.assistant !== "string" ||
    !HEX64.test(o.assistant) ||
    typeof o.on !== "boolean" ||
    !Array.isArray(o.duties) ||
    !Array.isArray(o.shouldSay)
  ) {
    return null;
  }
  const duties: DutyLine[] = [];
  for (const d of o.duties as Record<string, unknown>[]) {
    const key = d && entryKey(d.key);
    if (!key || !STATUSES.includes(d.status as DutyStatus)) continue;
    const relay = menuRelay(d.relay);
    duties.push({
      key,
      status: d.status as DutyStatus,
      relay,
      reason: str(d.reason),
      lastLandedAt: num(d.lastLandedAt),
      entries: d.status === "live" ? pairs(d.entries) : [],
    });
  }
  const relays = (Array.isArray(o.relays) ? o.relays : []).map(menuRelay).filter((r): r is string => !!r);
  return {
    assistant: o.assistant.toLowerCase(),
    on: o.on,
    duties,
    shouldSay: pairs(o.shouldSay),
    relays: [...new Set(relays)],
  };
}

/**
 * The self-entries of a kind 10040 by `author`: the tags whose key parses and
 * whose element 2 is the author itself, in order, the first per key winning
 * (§ 9.2 "Ties"). Entries naming other keys are the author's own requests, not
 * self-entries.
 */
export function readSelfEntries(event: Ev | null | undefined, author: string | null | undefined): SelfEntry[] {
  const who = (author ?? "").toLowerCase();
  if (!event || event.kind !== SELF_MAP_KIND || !Array.isArray(event.tags) || !HEX64.test(who)) return [];
  if (event.pubkey && event.pubkey.toLowerCase() !== who) return [];
  const out: SelfEntry[] = [];
  for (const t of event.tags) {
    if (!Array.isArray(t) || typeof t[1] !== "string" || t[1].toLowerCase() !== who) continue;
    const key = entryKey(t[0]);
    if (key === null || out.some((e) => e.key === key)) continue;
    out.push({ key, relay: entryRelay(t[2]) });
  }
  return out;
}

const entryId = (e: SelfEntry) => `${e.key}|${e.relay}`;

/** Is the entry among these, by key and relay? */
export function hasEntry(entries: readonly SelfEntry[], entry: SelfEntry): boolean {
  return entries.some((e) => entryId(e) === entryId(entry));
}

/**
 * The published self-entries against what the server says they should be, as
 * sets of key and relay: current when the same (both empty too), missing when
 * none are published, out of date otherwise.
 */
export function selfMapStatus(shouldSay: readonly SelfEntry[], found: readonly SelfEntry[]): SelfMapStatus {
  const want = new Set(shouldSay.map(entryId));
  const have = new Set(found.map(entryId));
  if (want.size === have.size && [...want].every((id) => have.has(id))) return "current";
  return have.size === 0 ? "missing" : "out-of-date";
}

/** A duties line's state: a live part is active once every self-entry that should list it is published. */
export function lineState(line: DutyLine, found: readonly SelfEntry[]): LineState {
  if (line.status !== "live") return line.status;
  return line.entries.length > 0 && line.entries.every((e) => hasEntry(found, e)) ? "active" : "live-unlisted";
}

/**
 * A published self-entry that claims something it shouldn't: it names a relay,
 * and isn't one of the entries the server says are live there.
 */
export function isFalseClaim(entry: SelfEntry, shouldSay: readonly SelfEntry[]): boolean {
  return entry.relay !== "" && !hasEntry(shouldSay, entry);
}

export interface SelfMapButtons {
  turnOn: boolean;
  update: { shown: boolean; enabled: boolean };
  turnOff: boolean;
}

/**
 * Which buttons the page shows, as Tapestry's `selfMapButtons`. On: Update now
 * (enabled unless up to date) and Turn off. Off: Turn on, and Turn off too
 * while the published version still lists some of the Assistant's duties, so
 * no claim is stuck.
 */
export function selfMapButtons(on: boolean, status: SelfMapStatus | null, foundCount: number): SelfMapButtons {
  if (on) return { turnOn: false, update: { shown: true, enabled: status !== "current" }, turnOff: true };
  return { turnOn: true, update: { shown: false, enabled: false }, turnOff: foundCount > 0 };
}
