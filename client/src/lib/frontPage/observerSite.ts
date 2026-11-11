/**
 * The Observer site: a reader's front pages as one public NIP-5A nsite, a named site
 * (kind 35128, `d=observer`) holding today's paper at `/index.html`, one file per day,
 * an archive page and a machine-readable `editions.json`.
 *
 * The contract is quartz's `plans/2026-11-11-observer-site.md`, shared with Amethyst so
 * either app can print into the site and read the other's editions. This file is the
 * pure part (names, the index codec, roll-off, the archive page, the manifest); the
 * network part is `services/observerSite.ts`.
 */
import { nip19 } from "nostr-tools";
import houseCss from "./house.css?raw";

export const OBSERVER_SITE_KIND = 35128;
export const OBSERVER_D = "observer";
export const INDEX_PATH = "/index.html";
export const ARCHIVE_PATH = "/archive.html";
export const EDITIONS_PATH = "/editions.json";

/** Editions kept before the byte budget is even asked. */
export const KEEP_EDITIONS = 90;
/** The event-size budget when no write relay publishes `max_message_length`. */
export const DEFAULT_EVENT_BUDGET = 60_000;
/** What the `["EVENT", …]` frame around the event costs, taken off a relay's own limit. */
export const ENVELOPE_BYTES = 1_000;
/** The tag-count budget when no write relay publishes `max_event_tags`. */
export const DEFAULT_MAX_TAGS = 100;

/** Where canonical named-site URLs are served (the gateway Brainstorm links root sites on). */
export const NSITE_GATEWAY = "nsite.lol";

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const HEX64 = /^[0-9a-f]{64}$/;
const DATED_PATH = /^\/(\d{4}-\d{2}-\d{2})\.html$/;

/** One edition in `editions.json`. `day`, `path` and `sha256` are required. */
export interface EditionEntry {
  day: string;
  path: string;
  sha256: string;
  headline?: string;
  code?: string;
  printedAt?: number;
  posts?: number;
  quotesVerified?: number;
  model?: string;
  /** Fields another producer wrote that this one doesn't know: carried, never read. */
  [other: string]: unknown;
}

export interface EditionsIndex {
  v: 1;
  title: string;
  /** Newest first. */
  editions: EditionEntry[];
}

/** The UTC date of [at] (milliseconds), which names the edition's file. */
export function utcDay(at: number): string {
  return new Date(at).toISOString().slice(0, 10);
}

export function editionPath(day: string): string {
  return `/${day}.html`;
}

/** A `YYYY-MM-DD` that is a real calendar date (not `2026-13-45`). */
export function isRealDay(day: string): boolean {
  if (!DAY.test(day)) return false;
  const at = Date.parse(`${day}T00:00:00Z`);
  return Number.isFinite(at) && new Date(at).toISOString().slice(0, 10) === day;
}

/**
 * The newest day a real edition can carry, [now] in milliseconds: tomorrow in UTC, for a
 * clock ahead of the reader's. A later day is somebody's bad data, and it must not take
 * `/index.html` (or today's place in the roll-off) from today's paper.
 */
export function latestDay(now: number): string {
  return utcDay(now + 86_400_000);
}

export function siteTitle(name: string | null | undefined): string {
  const n = name?.trim();
  return n ? `${n}'s Observer` : "The Nostr Observer";
}

export function siteDescription(name: string | null | undefined): string {
  const n = name?.trim();
  return n ? `A daily front page from ${n}'s web of trust` : "A daily front page from a web of trust";
}

const newestFirst = (a: EditionEntry, b: EditionEntry) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0);

function validEntry(raw: unknown): raw is EditionEntry {
  if (!raw || typeof raw !== "object") return false;
  const e = raw as Record<string, unknown>;
  return (
    typeof e.day === "string" &&
    isRealDay(e.day) &&
    e.path === editionPath(e.day) &&
    typeof e.sha256 === "string" &&
    HEX64.test(e.sha256)
  );
}

/**
 * Reads `editions.json`. Null for anything that isn't version 1; entries missing a
 * required field are skipped, and fields this reader doesn't know are kept so a rewrite
 * hands them back.
 */
export function parseEditions(json: string): EditionsIndex | null {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return null;
  }
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (d.v !== 1 || !Array.isArray(d.editions)) return null;
  const seen = new Set<string>();
  const editions = d.editions.filter(validEntry).filter((e) => !seen.has(e.day) && seen.add(e.day));
  return {
    v: 1,
    title: typeof d.title === "string" ? d.title : "",
    editions: [...editions].sort(newestFirst),
  };
}

export function serializeEditions(index: EditionsIndex): string {
  return JSON.stringify({ v: 1, title: index.title, editions: [...index.editions].sort(newestFirst) }, null, 2);
}

/** When `editions.json` can't be read: the entries the dated `path` tags still name. */
export function rebuildFromPaths(tags: string[][]): EditionEntry[] {
  const out: EditionEntry[] = [];
  for (const tag of tags) {
    if (tag[0] !== "path") continue;
    const match = DATED_PATH.exec(tag[1] ?? "");
    const hash = (tag[2] ?? "").toLowerCase();
    if (match && isRealDay(match[1]) && HEX64.test(hash) && !out.some((e) => e.day === match[1])) {
      out.push({ day: match[1], path: tag[1], sha256: hash });
    }
  }
  return out.sort(newestFirst);
}

/**
 * The editions a site serves: one per dated `path` tag, described by the index's entry
 * for that day when it names the same bytes. A day the index lists but the paths don't
 * is gone (rolled off by a racing producer); a day the paths serve that the index
 * misses, or lists under another hash, still shows, with only its day and hash.
 */
export function mergeEntries(indexed: EditionEntry[], fromPaths: EditionEntry[]): EditionEntry[] {
  const byDay = new Map(indexed.map((e) => [e.day, e]));
  return fromPaths
    .map((served) => {
      const described = byDay.get(served.day);
      return described && described.sha256.toLowerCase() === served.sha256 ? described : served;
    })
    .sort(newestFirst);
}

/** [entry] in, replacing the same day; newest first. */
export function upsertEdition(entries: EditionEntry[], entry: EditionEntry): EditionEntry[] {
  return [entry, ...entries.filter((e) => e.day !== entry.day)].sort(newestFirst);
}

/** The budget: the smallest `max_message_length` the write relays publish, less the envelope. */
export function eventBudget(maxMessageLengths: (number | null | undefined)[]): number {
  const known = maxMessageLengths.filter((n): n is number => typeof n === "number" && n > ENVELOPE_BYTES);
  return known.length ? Math.min(...known) - ENVELOPE_BYTES : DEFAULT_EVENT_BUDGET;
}

export interface SiteFiles {
  /** Hashes of the regenerated archive page and index. */
  archive: string;
  editions: string;
}

export interface ManifestInput {
  entries: EditionEntry[];
  files: SiteFiles;
  servers: string[];
  title: string;
  description: string;
  aggregate: string;
  /** The newest day `/index.html` may show (`latestDay`); every day when absent. */
  maxDay?: string;
}

/**
 * The manifest's `path` tags: `/index.html` is the newest edition's bytes (up to
 * [maxDay]), then every file. Dated paths are named from the day, never from the entry.
 */
export function pathTags(entries: EditionEntry[], files: SiteFiles, maxDay?: string): string[][] {
  const sorted = [...entries].sort(newestFirst);
  const tags: string[][] = [];
  const lead = sorted.find((e) => !maxDay || e.day <= maxDay);
  if (lead) tags.push(["path", INDEX_PATH, lead.sha256]);
  for (const e of sorted) tags.push(["path", editionPath(e.day), e.sha256]);
  tags.push(["path", ARCHIVE_PATH, files.archive], ["path", EDITIONS_PATH, files.editions]);
  return tags;
}

/** The unsigned kind-35128 manifest. */
export function manifestTemplate(input: ManifestInput): { kind: number; tags: string[][]; content: string } {
  return {
    kind: OBSERVER_SITE_KIND,
    content: "",
    tags: [
      ["d", OBSERVER_D],
      ...pathTags(input.entries, input.files, input.maxDay),
      ["x", input.aggregate, "aggregate"],
      ...input.servers.map((s) => ["server", s]),
      ["title", input.title],
      ["description", input.description],
    ],
  };
}

const textBytes = (s: string) => new TextEncoder().encode(s).length;

/**
 * The size of the manifest as a signed event, without signing it: every hash, the id,
 * the pubkey and the signature have fixed lengths, so placeholders measure exactly.
 */
export function signedSize(input: Omit<ManifestInput, "aggregate">, createdAt: number): number {
  const zero = "0".repeat(64);
  const template = manifestTemplate({ ...input, aggregate: zero });
  return textBytes(
    JSON.stringify({ id: zero, pubkey: zero, created_at: createdAt, sig: "0".repeat(128), ...template }),
  );
}

/**
 * Roll-off: the newest [keep], then the oldest dropped while the signed manifest would
 * exceed [budget] bytes or [maxTags] tags. The [protect]ed day (today's edition) is never
 * dropped, and neither is the last edition left.
 */
export function rollOff(
  entries: EditionEntry[],
  {
    keep = KEEP_EDITIONS,
    budget,
    maxTags = DEFAULT_MAX_TAGS,
    servers,
    title,
    description,
    createdAt,
    protect,
    maxDay,
  }: {
    keep?: number;
    budget: number;
    maxTags?: number;
    servers: string[];
    title: string;
    description: string;
    createdAt: number;
    protect?: string;
    maxDay?: string;
  },
): EditionEntry[] {
  const sorted = [...entries].sort(newestFirst);
  const guarded = protect ? sorted.find((e) => e.day === protect) : undefined;
  let kept = sorted.filter((e) => e !== guarded).slice(0, Math.max(0, Math.max(1, keep) - (guarded ? 1 : 0)));
  if (guarded) kept = [guarded, ...kept].sort(newestFirst);
  const placeholder = { archive: "0".repeat(64), editions: "0".repeat(64) };
  const tooBig = () => {
    const input = { entries: kept, files: placeholder, servers, title, description, maxDay };
    return (
      signedSize(input, createdAt) > budget ||
      manifestTemplate({ ...input, aggregate: "0".repeat(64) }).tags.length > maxTags
    );
  };
  while (kept.length > 1 && tooBig()) {
    const oldest = [...kept].reverse().find((e) => e !== guarded);
    if (!oldest) break;
    kept = kept.filter((e) => e !== oldest);
  }
  return kept;
}

/** NIP-5A aggregate hash: sha256 over the sorted `<hash> <path>\n` lines of the path tags. */
export async function aggregateHash(tags: string[][]): Promise<string> {
  const lines = tags
    .filter((t) => t[0] === "path")
    .map(([, path, hash]) => `${hash} ${path}\n`)
    .sort()
    .join("");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(lines));
  return hex(new Uint8Array(digest));
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sha256Text(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return hex(new Uint8Array(digest));
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const archiveDate = (day: string) =>
  new Intl.DateTimeFormat("en", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${day}T00:00:00Z`));

/**
 * The archive page: every kept edition, newest first, each a relative link to its dated
 * file. Built here from a template (no model call), in the paper's own house style, and
 * with no script: it is served beside the papers and holds to their rules.
 */
export function archiveHtml(index: EditionsIndex): string {
  const title = escapeHtml(index.title || "The Nostr Observer");
  const rows = [...index.editions]
    .sort(newestFirst)
    .map((e) => {
      const headline = typeof e.headline === "string" && e.headline.trim() ? escapeHtml(e.headline.trim()) : "";
      return `<li><a href=".${escapeHtml(editionPath(e.day))}">${escapeHtml(archiveDate(e.day))}</a>${headline ? ` <span class="dek">— ${headline}</span>` : ""}</li>`;
    })
    .join("\n");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} — Archive</title>
<style>
${houseCss}
.archive { max-width: 720px; margin: 0 auto; padding: 32px 22px 72px; }
.archive h1 { margin: 0 0 4px; }
.archive ol { list-style: none; padding: 0; margin: 24px 0 0; }
.archive li { padding: 10px 0; border-bottom: 1px solid rgba(0,0,0,0.12); }
.archive .dek { color: rgba(0,0,0,0.65); }
</style>
</head>
<body>
<main class="archive">
<h1>${title}</h1>
<p><a href="./index.html">Today's paper</a></p>
<ol>
${rows}
</ol>
</main>
</body>
</html>
`;
}

/** The author's raw pubkey in base36, lowercase, left-padded to NIP-5A's fixed 50 characters. */
export function pubkeyB36(pubkeyHex: string): string {
  return BigInt(`0x${pubkeyHex}`).toString(36).padStart(50, "0");
}

/** The canonical named-site URL (NIP-5A): `<pubkeyB36><d>.<gateway>`. */
export function observerUrl(pubkeyHex: string, gateway = NSITE_GATEWAY): string {
  return `https://${pubkeyB36(pubkeyHex)}${OBSERVER_D}.${gateway}`;
}

export function observerNaddr(pubkeyHex: string, relays: string[] = []): string {
  return nip19.naddrEncode({
    kind: OBSERVER_SITE_KIND,
    pubkey: pubkeyHex,
    identifier: OBSERVER_D,
    relays: relays.slice(0, 2),
  });
}
