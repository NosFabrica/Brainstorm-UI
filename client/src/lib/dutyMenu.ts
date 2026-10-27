/**
 * An Assistant's Duty Menu, read: what it says it offers, and whether that is
 * what the server offers for it now. Pure.
 *
 * A Duty Menu is one kind-39999 item under Nous' header (config/assistants
 * `DUTY_MENU_HEADER`), signed by the Assistant's own key, with a row per duty:
 * `["duty", <Treasure Map key>, <relay>]` (nous-clawds4/tapestry
 * protocols/drafts/duty-menus.md). Ported from Tapestry's reader
 * (src/lib/duty-menu/index.js `isDutyMenu`, `readMenuRows`), so the two apps
 * read one menu the same way.
 *
 * Only the server signs a menu and decides what it offers (docs/assistant/
 * DUTY-MENU-ASK.md); this compares the two.
 */
import { normalizeURL } from "applesauce-core/helpers/url";
import { DUTY_MENU_HEADER } from "@/config/assistants";
import { appliesTo, CATEGORIES, entryOf } from "@/lib/treasureMapCards";

export const DUTY_MENU_KIND = 39999;
export const DUTY_MENU_D = "duty-menu";

/** A `z` naming any author's concept header: such an event is not a menu (§ 6.1). */
const CONCEPT_HEADER_Z = /^39998:[0-9a-f]{64}:concept-header$/i;
/** A kind slot that parses: a kind, a family, or everything (Treasure Maps § 4.2). */
const KIND_SLOT = /^(\d{5}|\d{4}x|\*)$/;
/** A Concept kind and a colon alone name nothing (§ 5.3). */
const IGNORED_KEYS = ["39998:", "39999:"];

type Ev = { kind: number; pubkey?: string; tags: string[][] };

export interface MenuRow {
  tag: "duty" | "not-offered";
  /** The Treasure Map key in its one spelling: `39998:dlist-header` is `39998`. */
  key: string;
  /** A duty row's relay in its one spelling; null for `not-offered`. */
  relay: string | null;
}

export type MenuStatus = "missing" | "out-of-date" | "current";

/**
 * Is this event a Duty Menu by § 6.1: kind 39999, `d` = `duty-menu`, exactly
 * one `p` and it is the author, Nous' header in a `z`, and no `["z", "list"]`
 * nor a `z` naming a concept header. Other `z` tags are allowed.
 */
export function isDutyMenu(event: Ev | null | undefined, author: string | null | undefined): boolean {
  if (!event || event.kind !== DUTY_MENU_KIND || !Array.isArray(event.tags)) return false;
  const who = (author ?? "").toLowerCase();
  if (!who || (event.pubkey && event.pubkey.toLowerCase() !== who)) return false;
  if (event.tags.find((t) => t[0] === "d")?.[1] !== DUTY_MENU_D) return false;
  const ps = event.tags.filter((t) => t[0] === "p");
  if (ps.length !== 1 || ps[0][1]?.toLowerCase() !== who) return false;
  const zs = event.tags.filter((t) => t[0] === "z").map((t) => t[1]);
  if (zs.some((z) => z === "list" || (typeof z === "string" && CONCEPT_HEADER_Z.test(z)))) return false;
  return zs.includes(DUTY_MENU_HEADER);
}

/** A row's key in its one spelling, or null when a reader drops it (§ 5.3). */
export function menuKey(key: unknown): string | null {
  if (typeof key !== "string" || IGNORED_KEYS.includes(key)) return null;
  const colon = key.indexOf(":");
  if (!KIND_SLOT.test(colon < 0 ? key : key.slice(0, colon))) return null;
  const slot = colon < 0 ? key : key.slice(0, colon);
  const rest = colon < 0 ? "" : key.slice(colon + 1);
  // A Concept key keeps its `d` verbatim; the reserved `dlist-header` is the bare kind.
  if (slot === "39998" || slot === "39999") return slot === "39998" && rest === "dlist-header" ? "39998" : key;
  const segments = rest === "" ? [] : rest.split(":");
  while (segments.length && segments[segments.length - 1] === "") segments.pop();
  return [slot, ...segments].join(":");
}

/** A relay in its one spelling, or null when it isn't a ws:// or wss:// address. */
export function menuRelay(relay: unknown): string | null {
  if (typeof relay !== "string" || !/^wss?:\/\//i.test(relay.trim())) return null;
  try {
    return normalizeURL(relay.trim());
  } catch {
    return null;
  }
}

/**
 * The rows a reader keeps, in order (§§ 5.1–5.3). Dropped: a duty row with no
 * usable relay, a key that doesn't parse, `39998:` and `39999:`; after that the
 * first row per key wins, whatever its tag.
 */
export function menuRows(event: Ev | null | undefined): MenuRow[] {
  const rows: MenuRow[] = [];
  const seen = new Set<string>();
  for (const t of Array.isArray(event?.tags) ? event.tags : []) {
    if (t[0] !== "duty" && t[0] !== "not-offered") continue;
    const key = menuKey(t[1]);
    if (key === null) continue;
    const relay = t[0] === "duty" ? menuRelay(t[2]) : null;
    if (t[0] === "duty" && !relay) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ tag: t[0], key, relay });
  }
  return rows;
}

/**
 * `GET /user/assistantDutyMenu`'s answer when it is one: a 64-hex `assistant`
 * and a `rows` array. Anything else is null. A server without the route still
 * answers 200 here, because `GET /user/{pubkey}` takes the path for a pubkey
 * and answers with that "user's" relationships, so the shape is the test.
 */
export function parseDutyMenuOffer(json: unknown): { assistant: string; rows: string[][] } | null {
  const o = json as { assistant?: unknown; rows?: unknown } | null;
  if (!o || typeof o.assistant !== "string" || !/^[0-9a-f]{64}$/i.test(o.assistant) || !Array.isArray(o.rows)) {
    return null;
  }
  return { assistant: o.assistant.toLowerCase(), rows: o.rows as string[][] };
}

/** What the server offers (`GET /user/assistantDutyMenu`'s `rows`), as duty rows in their one spelling. */
export function offerRows(rows: unknown): MenuRow[] {
  const tags = (Array.isArray(rows) ? rows : [])
    .filter((r): r is unknown[] => Array.isArray(r))
    .map((r) => ["duty", r[0], r[1]] as string[]);
  return menuRows({ kind: DUTY_MENU_KIND, tags });
}

const rowId = (r: MenuRow) => `${r.tag}|${r.key}|${r.relay ?? ""}`;

/**
 * The published menu against the offer: missing (none, or not a menu), out of
 * date (any row added, dropped, or at another relay), or current. Order carries
 * no meaning.
 */
export function menuStatus(
  offer: readonly MenuRow[],
  published: Ev | null | undefined,
  author: string | null | undefined,
): MenuStatus {
  if (!isDutyMenu(published, author)) return "missing";
  const have = new Set(menuRows(published).map(rowId));
  const want = new Set(offer.map(rowId));
  return have.size === want.size && [...want].every((id) => have.has(id)) ? "current" : "out-of-date";
}

const ANY = "0".repeat(64);
const LABEL = { scores: "Scores", lists: "Lists", concepts: "Concepts" } as const;

/** A row's category as the Treasure Map reads its key: Scores, Lists, Concepts, or Everything. */
export function categoryOf(key: string): string {
  const entry = entryOf([key, ANY]);
  if (!entry) return "Other";
  if (entry.slot === "*") return "Everything";
  const category = CATEGORIES.find((c) => appliesTo(c, entry));
  return category ? LABEL[category] : "Other";
}
