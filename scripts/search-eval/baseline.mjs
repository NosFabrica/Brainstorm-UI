#!/usr/bin/env node
/**
 * Search eval baseline: runs the labelled query set (docs/search/eval/queries.json)
 * against the search relay the way the Top page asks today, and scores each query
 * against its `expect`. Read-only: it sends REQ and COUNT frames and nothing else.
 *
 *   node scripts/search-eval/baseline.mjs [--observer <hex>] [--out <path>]
 *        [--queries <path>] [--relay <url>] [--hub <url>] [--pause <ms>]
 *        [--timeout <ms>] [--only <id,id,…>] [--no-dlist] [--print-filters] [--full]
 *
 * Node 22 or newer (global WebSocket), no dependencies. What it mirrors, and what
 * it leaves out, is in docs/search/eval/README.md.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

// ---------------------------------------------------------------------------
// Arguments

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const opt = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
};
if (flag("help") || flag("h")) {
  console.log(
    readFileSync(fileURLToPath(import.meta.url), "utf8")
      .split("\n")
      .slice(1, 13)
      .join("\n"),
  );
  process.exit(0);
}
if (typeof WebSocket !== "function") {
  console.error("Needs Node 22 or newer (global WebSocket).");
  process.exit(1);
}

const QUERIES_PATH = resolve(opt("queries", resolve(ROOT, "docs/search/eval/queries.json")));
const OUT_PATH = resolve(opt("out", resolve(ROOT, `docs/search/eval/baseline-${ymd(new Date())}.json`)));
const RELAY = opt("relay", "wss://search.brainstorm.world/");
const PAUSE_MS = Number(opt("pause", "1500"));
const TIMEOUT_MS = Number(opt("timeout", "15000"));
const ONLY = opt("only", "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const WITH_DLIST = !flag("no-dlist");
const PRINT_FILTERS = flag("print-filters");
/** Keep every section's top 10, not only the sections an entry names: for reading a run, not for committing. */
const FULL = flag("full");
/** Where the app finds the house observer: the server's NIP-05 `_` (services/trustSource, index.html). */
const HOUSE_ORIGINS = ["https://brainstorm.world", "https://api.brainstorm.world"];

// ---------------------------------------------------------------------------
// What the Top page asks (client/src/components/search/ComposedResults.tsx TOP_SECTIONS,
// services/search.ts bandKindsForTab; index.html's head start sends the same REQ and
// headStart.test holds the two together). One REQ, one filter per section, routed back by kind.

const SECTIONS = [
  { key: "people", kinds: [0], recent: false, limit: 8 },
  { key: "notes", kinds: [1, 11, 1111, 9802, 1068, 6969], recent: true, limit: 10 },
  // Best match when words are typed, which is every query this runner sends.
  { key: "articles", kinds: [30023, 30024, 30818, 30040, 30041, 30817, 30142], recent: false, limit: 5 },
  { key: "events", kinds: [31922, 31923], recent: true, limit: 12 },
  { key: "live", kinds: [30311, 30312, 30313], recent: true, limit: 8 },
  { key: "media", kinds: [20, 21, 22, 1063, 1222, 34235, 34236], recent: true, limit: 8 },
  { key: "music", kinds: [31337, 36787, 54, 30054, 30055], recent: false, limit: 12 },
  { key: "shop", kinds: [30402, 30018, 30020], recent: false, limit: 12 },
];
const SECTION_OF_KIND = new Map(SECTIONS.flatMap((s) => s.kinds.map((k) => [k, s.key])));
/** The list kinds with a look of their own on the Top page (components/items/ListKindSearch LIST_KINDS). */
const DLIST_CATEGORIES = ["places", "books", "github"];
const TOP_CATEGORIES = new Set([...SECTIONS.map((s) => s.key), ...DLIST_CATEGORIES]);

/** lib/searchQuery tidyTerms: a token of punctuation alone ("&") is dropped, spaces collapse. */
const ORPHAN = /(^|\s)[^\p{L}\p{M}\p{N}_\p{Extended_Pictographic}\u200D\uFE0F#"-]+(?=\s|$)/gu;
const tidy = (s) => s.replace(ORPHAN, "$1").replace(/\s+/g, " ").trim();

function topFilters(query, observer) {
  const q = tidy(query);
  return SECTIONS.map((s) => ({
    kinds: s.kinds,
    search: `${s.recent ? `${q} sort:recent` : q} observer:${observer}`,
    limit: s.limit,
  }));
}

// ---------------------------------------------------------------------------
// Relay connection: one socket, one subscription at a time, every frame counted.

let framesSent = 0;
/** Frames by type: REQ and COUNT are the requests; CLOSE ends one. */
const sentByType = { REQ: 0, COUNT: 0, CLOSE: 0 };
const relayErrors = [];

class Relay {
  constructor(url) {
    this.url = url;
    this.ws = null;
    this.handlers = new Map();
    this.notices = [];
  }
  async connect() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return;
    await new Promise((ok, fail) => {
      const ws = new WebSocket(this.url);
      const timer = setTimeout(() => fail(new Error(`connect timeout ${this.url}`)), 10_000);
      ws.onopen = () => {
        clearTimeout(timer);
        ok();
      };
      ws.onerror = (e) => {
        clearTimeout(timer);
        fail(new Error(`socket error ${this.url}: ${e?.message ?? "unknown"}`));
      };
      ws.onclose = () => {
        for (const h of this.handlers.values()) h(["CLOSED", null, "socket closed"]);
        this.handlers.clear();
      };
      ws.onmessage = (m) => {
        let msg;
        try {
          msg = JSON.parse(m.data);
        } catch {
          return;
        }
        // The relay greets with an AUTH challenge; an anonymous reader does not answer it.
        if (msg[0] === "AUTH") return;
        if (msg[0] === "NOTICE") return void this.notices.push(String(msg[1]));
        const h = this.handlers.get(msg[1]);
        if (h) h(msg);
      };
      this.ws = ws;
    });
  }
  close() {
    try {
      this.ws?.close();
    } catch {
      /* closing is best effort */
    }
  }
  send(frame) {
    framesSent++;
    sentByType[frame[0]] = (sentByType[frame[0]] ?? 0) + 1;
    this.ws.send(JSON.stringify(frame));
  }
  /** One REQ to its EOSE (or CLOSED, or the timeout). Every event carries its arrival in ms since the REQ left. */
  async req(filters, { timeoutMs = TIMEOUT_MS } = {}) {
    await this.connect();
    const id = `e${framesSent}`;
    return new Promise((done) => {
      const events = [];
      const t0 = performance.now();
      let settled = false;
      const finish = (end) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.handlers.delete(id);
        // A finished or abandoned subscription is closed, so it cannot hold up the next REQ on this socket.
        if ((end.end === "eose" || end.end === "timeout") && this.ws?.readyState === WebSocket.OPEN)
          this.send(["CLOSE", id]);
        done({ events, ...end });
      };
      const timer = setTimeout(() => finish({ end: "timeout", ms: performance.now() - t0 }), timeoutMs);
      this.handlers.set(id, (msg) => {
        if (msg[0] === "EVENT" && msg[2]) events.push({ event: msg[2], t: performance.now() - t0 });
        else if (msg[0] === "EOSE") finish({ end: "eose", ms: performance.now() - t0 });
        else if (msg[0] === "CLOSED") finish({ end: "closed", reason: msg[2], ms: performance.now() - t0 });
      });
      this.send(["REQ", id, ...filters]);
    });
  }
  async count(filters) {
    await this.connect();
    const id = `c${framesSent}`;
    return new Promise((done) => {
      const timer = setTimeout(() => {
        this.handlers.delete(id);
        done(null);
      }, 10_000);
      this.handlers.set(id, (msg) => {
        clearTimeout(timer);
        this.handlers.delete(id);
        done(msg[0] === "COUNT" ? (msg[2]?.count ?? null) : null);
      });
      this.send(["COUNT", id, ...filters]);
    });
  }
}

/** A REQ tried up to three times, backing off 4 s then 8 s: a rate limit or a dropped socket is noted, not fatal. */
async function reqWithRetry(relay, filters, label) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await relay.req(filters);
      if (res.end === "closed" && /rate-limited|socket closed/i.test(res.reason ?? "") && attempt < 2) {
        relayErrors.push({ label, attempt, reason: res.reason });
        await sleep(4000 * (attempt + 1));
        continue;
      }
      return res;
    } catch (err) {
      relayErrors.push({ label, attempt, reason: String(err.message ?? err) });
      relay.close();
      await sleep(4000 * (attempt + 1));
    }
  }
  return { events: [], end: "error", ms: null };
}

// ---------------------------------------------------------------------------
// Event helpers

const tagOf = (ev, k) => ev.tags.find((t) => t[0] === k && t.length > 1)?.[1];
const isAddressable = (kind) => kind >= 30000 && kind < 40000;
/** The id an expectation names: a pubkey for a person, an address for an addressable event, else the event id. */
function stableId(ev) {
  if (ev.kind === 0) return ev.pubkey;
  if (isAddressable(ev.kind)) return `${ev.kind}:${ev.pubkey}:${tagOf(ev, "d") ?? ""}`;
  return ev.id;
}
function labelOf(ev) {
  let text = "";
  if (ev.kind === 0) {
    try {
      const m = JSON.parse(ev.content);
      text = m.display_name || m.displayName || m.name || "";
    } catch {
      /* unreadable profile: no label */
    }
  } else {
    text = tagOf(ev, "title") || tagOf(ev, "name") || tagOf(ev, "subject") || ev.content || "";
  }
  return text.replace(/\s+/g, " ").trim().slice(0, 60);
}

// lib/calendarEvent + lib/eventFilters: an event is on until its end (a date-only event, the end of its day).
function toSec(v) {
  if (!v) return 0;
  if (/^\d+$/.test(v)) return Number(v);
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  if (!m) return 0;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? 0 : Math.floor(d.getTime() / 1000);
}
function spanOf(ev) {
  const start = toSec(tagOf(ev, "start"));
  const end = toSec(tagOf(ev, "end"));
  if (!start) return { start: 0, end: 0 };
  return { start, end: end && end > start ? end : ev.kind === 31922 ? start + 86_400 : start };
}
const endOfToday = (now) => {
  const d = new Date(now * 1000);
  d.setHours(24, 0, 0, 0);
  return Math.floor(d.getTime() / 1000);
};
function weekendWindow(now) {
  const d = new Date(now * 1000);
  const dow = d.getDay();
  const sat = new Date(d);
  sat.setDate(d.getDate() + (dow === 6 ? 0 : dow === 0 ? -1 : 6 - dow));
  sat.setHours(0, 0, 0, 0);
  const mon = new Date(sat);
  mon.setDate(sat.getDate() + 2);
  return { from: Math.floor(sat.getTime() / 1000), to: Math.floor(mon.getTime() / 1000) };
}
/** The time phrases the runner can score; any other phrase is recorded but not scored. */
const TIME_PHRASES = new Set([
  "today",
  "tonight",
  "this weekend",
  "this week",
  "next 7 days",
  "this month",
  "next 30 days",
  "upcoming",
]);
/** Does an event fall in the window a phrase names? null when the phrase is not one this runner scores. */
function inTimeWindow(ev, phrase, now) {
  const { start, end } = spanOf(ev);
  if (!start) return false;
  const on = end > now;
  const p = phrase.toLowerCase();
  if (p === "today" || p === "tonight") return on && start < endOfToday(now);
  if (p === "this weekend") {
    const w = weekendWindow(now);
    return on && start >= w.from && start < w.to;
  }
  if (p === "this week" || p === "next 7 days") return on && start < now + 7 * 86_400;
  if (p === "this month" || p === "next 30 days") return on && start < now + 30 * 86_400;
  if (p === "upcoming") return on;
  return null;
}

// The Top page's client-side gates, section by section.
const AUDIO_EXT = /\.(mp3|mpga|wav|m4a|aac|ogg|oga|opus|flac|webm)(\?|#|$)/i;
const isHttp = (v) => typeof v === "string" && /^https?:\/\//i.test(v);
function hasAudio(ev) {
  for (const k of ["media", "url", "stream", "streaming", "enclosure", "audio"]) if (isHttp(tagOf(ev, k))) return true;
  for (const t of ev.tags)
    if (t[0] === "imeta" && t.some((s) => typeof s === "string" && isHttp(s.slice(4)) && s.startsWith("url ")))
      return true;
  for (const t of ev.tags) for (const v of t.slice(1)) if (isHttp(v) && AUDIO_EXT.test(v)) return true;
  return (ev.content || "").match(/https?:\/\/\S+/g)?.some((u) => AUDIO_EXT.test(u)) ?? false;
}
function isListing(ev) {
  if (ev.kind === 30402) return !!tagOf(ev, "title")?.trim();
  if (ev.kind === 30020) return !!(tagOf(ev, "title") || tagOf(ev, "name"))?.trim();
  if (ev.kind === 30018) {
    try {
      const j = JSON.parse(ev.content);
      return !!(j && typeof j === "object" && typeof j.name === "string" && j.name.trim());
    } catch {
      return false;
    }
  }
  return false;
}
function gate(section, events, now) {
  switch (section) {
    case "events": {
      // Happening shows what is on now or next, soonest first (filterEventsByWhen "upcoming").
      return events
        .map((ev) => ({ ev, ...spanOf(ev) }))
        .filter((d) => d.start && d.end > now)
        .sort((a, b) => a.start - b.start)
        .map((d) => d.ev);
    }
    case "media":
      // A kind-1063 stays only when the file is a picture, a video or a sound (dropNonMediaFiles).
      return events.filter((ev) => ev.kind !== 1063 || /^(image|video|audio)\//.test(tagOf(ev, "m") ?? ""));
    case "music":
      // The Listen row keeps what parses as a song: a title and a playable URL (lib/trackEvent).
      return events.filter((ev) => !!(tagOf(ev, "title") || tagOf(ev, "subject")) && hasAudio(ev));
    case "shop": {
      // A parsed listing, two per seller, four in all (the Shop row).
      const perSeller = new Map();
      const out = [];
      for (const ev of events.filter(isListing)) {
        const n = perSeller.get(ev.pubkey) ?? 0;
        if (n >= 2) continue;
        perSeller.set(ev.pubkey, n + 1);
        out.push(ev);
        if (out.length >= 4) break;
      }
      return out;
    }
    default:
      return events;
  }
}

// ---------------------------------------------------------------------------
// List items as the DList previews read them (services/dictionary.ts, lib/listSearch.ts,
// components/items/ListKindSearch.tsx useKindHits).

const FILLER = new Set(["a", "an", "and", "&", "the", "of", "in", "on", "at", "to", "for", "from", "by", "with", "or"]);
const wordsOf = (text) => text.toLowerCase().split(/\s+/).filter(Boolean);
const namesWords = (text) => wordsOf(text).filter((w) => !FILLER.has(w) && !/^\d+$/.test(w));
function wordsToFind(query, names) {
  const name = new Set([...namesWords(names[0]), ...namesWords(names[1])]);
  return wordsOf(query).filter((w) => !FILLER.has(w) && !name.has(w));
}
const tokensOf = (text) =>
  text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
function matchListItems(items, words, max, read, titleOnly) {
  if (!words.length) return [];
  const found = (tokens) => words.every((w) => tokens.includes(w));
  const ranked = [];
  for (const item of items) {
    const shown = read(item);
    const title = shown.title ?? "";
    const inTitle = found(tokensOf(title));
    if (!inTitle && (titleOnly || !found(tokensOf(`${title} ${shown.summary ?? ""}`)))) continue;
    ranked.push({ item, rank: title.toLowerCase().startsWith(words.join(" ")) ? 0 : inTitle ? 1 : 2 });
  }
  return ranked
    .sort((a, b) => a.rank - b.rank)
    .slice(0, max)
    .map((r) => r.item);
}
const categoryWords = (v) => {
  const s = (v ?? "").trim().replace(/_/g, " ");
  return s ? s[0].toUpperCase() + s.slice(1) : null;
};
/** lib/books authorName: "Clarke, Susanna" → "Susanna Clarke". */
const authorName = (raw) =>
  raw
    .split(/\s*&\s*|\s+and\s+/)
    .map((part) => {
      const bare = part.replace(/\s*\([^)]*\)\s*/g, " ").trim();
      const m = bare.match(/^([^,]+),\s*(.+)$/);
      return (m ? `${m[2].trim()} ${m[1].trim()}` : bare).replace(/\s+/g, " ");
    })
    .filter(Boolean)
    .join(" & ");
/** How a card reads an item, per tier-three view (placePresentation, bookPresentation, githubPresentation). */
const READERS = {
  places: (it) => {
    const name = tagOf(it, "name")?.trim();
    if (!name) return { title: null, summary: null };
    const kind = categoryWords(tagOf(it, "category"));
    const cuisine = categoryWords(tagOf(it, "cuisine"));
    const line = [kind, cuisine !== kind ? cuisine : null, tagOf(it, "locality")?.trim() || null]
      .filter(Boolean)
      .join(" · ");
    return { title: name, summary: line || tagOf(it, "address") || null };
  },
  books: (it) => {
    const author = tagOf(it, "author");
    return { title: tagOf(it, "title") ?? null, summary: author ? authorName(author) || null : null };
  },
  github: (it) => ({ title: tagOf(it, "github-username")?.trim() ?? null, summary: tagOf(it, "description") ?? null }),
};
/** Top page: places and GitHub accounts by what the card shows; a book by its title alone. */
const TITLE_ONLY = { places: false, books: true, github: false };
/** How many matches a preview considers (CANDIDATES) and shows. */
const CANDIDATES = 60;
const PREVIEW_SHOWS = { places: 3, books: 6, github: 3 };
const ITEM_LIMIT = 500;

/** services/dictionary itemIdentity + distinctItems + filedItems: newest version of each item, newest first. */
function poolOf(events, headers) {
  const byId = new Map();
  for (const ev of events) byId.set(ev.id, ev);
  const filed = new Set(headers);
  const best = new Map();
  for (const ev of byId.values()) {
    if (ev.kind !== 39999 && ev.kind !== 9999) continue;
    const z = ev.tags.filter((t) => t[0] === "z" && t[1]).map((t) => t[1]);
    if (!z.some((v) => filed.has(v))) continue;
    const d = tagOf(ev, "d");
    let key = isAddressable(ev.kind) ? `${ev.kind}:${ev.pubkey}:${d ?? ""}` : ev.id;
    if (d?.startsWith("copy-")) {
      const q = ev.tags.filter((t) => t[0] === "q" && t[1]);
      const original = q.find((t) => /^\d+:[0-9a-f]{64}:/.test(t[1])) ?? q[0];
      if (original) key = original[1];
    }
    const cur = best.get(key);
    if (!cur || ev.created_at > cur.created_at) best.set(key, ev);
  }
  return [...best.values()].sort((a, b) => b.created_at - a.created_at);
}

async function loadDList(index, observer) {
  const views = JSON.parse(readFileSync(resolve(ROOT, "client/src/config/dictionary.config.json"), "utf8"));
  const tagging = JSON.parse(readFileSync(resolve(ROOT, "client/src/config/tagging.config.json"), "utf8"));
  const hubUrl = opt("hub", tagging.tagRelays[0]);
  const communities = {
    places: views.views.place,
    books: views.views.book,
    github: views.views["github-account"],
  };
  const parse = (c) => {
    const [kind, pubkey, ...d] = c.split(":");
    return { kind: Number(kind), pubkey, d: d.join(":") };
  };
  const hub = new Relay(hubUrl);
  const lens = (f) => ({ ...f, search: "include:spam" });
  const t0 = performance.now();

  // Brainstorm's own definitions: the house, then the Assistant its kind-10040 names (houseCopyAuthors).
  const trust = await reqWithRetry(index, [lens({ kinds: [10040], authors: [observer], limit: 1 })], "house 10040");
  const ta = trust.events[0]?.event.tags.find((t) => t[0] === "30382:rank")?.[1];
  const copyAuthors = [observer, ...(ta && ta !== observer ? [ta] : [])];
  const all = Object.values(communities);
  const headerFilters = [
    {
      kinds: [39998],
      authors: [...new Set(all.map((c) => parse(c).pubkey))],
      "#d": [...new Set(all.map((c) => parse(c).d))],
    },
    { kinds: [39998], authors: copyAuthors, "#b": all },
  ];
  const headerAnswers = await Promise.all([
    reqWithRetry(index, headerFilters.map(lens), "headers index"),
    reqWithRetry(hub, headerFilters, "headers hub"),
  ]);
  const headers = [...headerAnswers[0].events, ...headerAnswers[1].events].map((e) => e.event);
  const newest = (evs) => evs.sort((a, b) => b.created_at - a.created_at)[0] ?? null;
  // Whether each concept is on the Demo Dictionary Concepts list (hooks/useDictionaryConcepts): it must be for a preview to show.
  const listed = await reqWithRetry(
    index,
    [lens({ kinds: [39999], "#z": [views.conceptList], limit: 200 })],
    "concept list",
  );
  const listedCoords = new Set(listed.events.flatMap((e) => e.event.tags.filter((t) => t[0] === "a").map((t) => t[1])));

  const out = {};
  for (const [cat, community] of Object.entries(communities)) {
    const c = parse(community);
    const communityHeader = newest(headers.filter((h) => h.pubkey === c.pubkey && tagOf(h, "d") === c.d));
    const pointsAt = (h) => h.tags.some((t) => t[0] === "b" && t[1] === community);
    // copyBy: the author's header pointing at the community, preferring the one sharing its d.
    let governing = null;
    for (const a of copyAuthors) {
      const mine = headers.filter((h) => h.pubkey === a && pointsAt(h));
      const pick = mine.find((h) => tagOf(h, "d") === c.d) ?? newest(mine);
      if (pick) {
        governing = pick;
        break;
      }
    }
    const governingHeader = governing ?? communityHeader;
    const coordOf = (h) => `39998:${h.pubkey}:${tagOf(h, "d")}`;
    const chain = [...new Set([...(governing ? [coordOf(governing)] : []), community])];
    const namesTag = governingHeader?.tags.find((t) => t[0] === "names");
    const names = [namesTag?.[1] ?? cat, namesTag?.[2] ?? cat];
    const itemFilter = { kinds: [39999, 9999], "#z": chain, limit: ITEM_LIMIT };
    const t1 = performance.now();
    const [fromIndex, fromHub] = await Promise.all([
      reqWithRetry(index, [lens(itemFilter)], `${cat} items index`),
      reqWithRetry(hub, [itemFilter], `${cat} items hub`),
    ]);
    const loadMs = Math.round(performance.now() - t1);
    const pool = poolOf(
      [...fromIndex.events, ...fromHub.events].map((e) => e.event),
      chain,
    );
    const total = await index.count([lens({ kinds: [39999, 9999], "#z": chain })]);
    out[cat] = {
      community,
      in_dictionary: listedCoords.has(community),
      governing: governingHeader ? coordOf(governingHeader) : null,
      chain,
      names,
      index_returned: fromIndex.events.length,
      hub_returned: fromHub.events.length,
      pool_size: pool.length,
      relay_total: total,
      load_ms: loadMs,
      pool,
    };
  }
  hub.close();
  return { hub: hubUrl, house_assistant: ta ?? null, setup_ms: Math.round(performance.now() - t0), lists: out };
}

// ---------------------------------------------------------------------------
// Scoring

const norm = (s) => (s ?? "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
const placeMatches = (ev, city) => norm(tagOf(ev, "locality")) === norm(city);
const eventPlaceMatches = (ev, city) =>
  norm(`${tagOf(ev, "location") ?? ""} ${tagOf(ev, "address") ?? ""}`).includes(norm(city));
function propertyMatches(ev, prop) {
  return Object.entries(prop).every(([k, v]) => {
    const val = norm(tagOf(ev, k));
    const want = norm(String(v));
    return (
      val === want ||
      val
        .replace(/_/g, " ")
        .split(/[;,]\s*/)
        .includes(want.replace(/_/g, " "))
    );
  });
}
function share(list, pred) {
  if (!list.length) return null;
  return list.filter(pred).length / list.length;
}

/** `expect.results` as groups of ids: a string is a group of one, an array lists copies of one thing. */
const resultGroups = (expect) => (expect?.results ?? []).map((r) => (Array.isArray(r) ? r : [r]));

function scoreEntry(entry, run, now) {
  const expect = entry.expect ?? {};
  const cats = expect.categories ?? [];
  const shownCount = (c) => run.categories[c]?.shown ?? 0;
  const category_hits = Object.fromEntries(cats.map((c) => [c, TOP_CATEGORIES.has(c) ? shownCount(c) > 0 : false]));
  const not_on_top_page = cats.filter((c) => !TOP_CATEGORIES.has(c));
  const absent_violations = (expect.absent_categories ?? []).filter((c) => shownCount(c) > 0);

  // Recall@10: each expected result, looked for in every category's top ten. A result is one id,
  // or a list of ids that are the same thing published more than once (any one of them counts).
  let recall = null;
  const result_details = [];
  const groups = resultGroups(expect);
  if (groups.length) {
    let found = 0;
    for (const ids of groups) {
      const where = Object.entries(run.categories).flatMap(([k, v]) =>
        ids
          .filter((id) => v.top10_ids?.includes(id))
          .map((id) => ({ category: k, rank: v.top10_ids.indexOf(id) + 1, id })),
      );
      if (where.length) found++;
      const detail = {
        id: ids.length === 1 ? ids[0] : ids,
        found_in: where,
        on_relay: ids.some((id) => run.exists?.[id] === true),
      };
      const check = ids.map((id) => run.dlist_checks?.[id]).find(Boolean);
      if (check) Object.assign(detail, check);
      result_details.push(detail);
    }
    recall = found / groups.length;
  }

  // Filter precision@10, where a filter can be read off the results.
  const filters = expect.filters ?? {};
  const fp = {};
  const placesTop = run.categories.places?.top10_events ?? [];
  const eventsTop = run.categories.events?.top10_events ?? [];
  if (filters.place) {
    if (cats.includes("places") && placesTop.length)
      fp.place_places = share(placesTop, (ev) => placeMatches(ev, filters.place));
    if (cats.includes("events") && eventsTop.length)
      fp.place_events = share(eventsTop, (ev) => eventPlaceMatches(ev, filters.place));
  }
  if (filters.property && cats.includes("places") && placesTop.length)
    fp.property = share(placesTop, (ev) => propertyMatches(ev, filters.property));
  if (filters.time && cats.includes("events") && eventsTop.length && TIME_PHRASES.has(filters.time.toLowerCase()))
    fp.time = share(eventsTop, (ev) => inTimeWindow(ev, filters.time, now) === true);
  const fpValues = Object.values(fp).filter((v) => v !== null);

  return {
    category_hits,
    all_categories_hit: cats.length ? Object.values(category_hits).every(Boolean) : null,
    category_hit_share: cats.length ? Object.values(category_hits).filter(Boolean).length / cats.length : null,
    not_on_top_page,
    absent_violations,
    recall_at_10: recall,
    results: result_details,
    filter_precision: fp,
    filter_precision_mean: fpValues.length ? fpValues.reduce((a, b) => a + b, 0) / fpValues.length : null,
  };
}

// ---------------------------------------------------------------------------
// Run

/** Indented JSON that keeps a short object or array on one line, so a results file stays readable and small. */
function stringify(value, indent = "") {
  const flat = JSON.stringify(value);
  if (flat === undefined) return "null";
  if (flat.length <= 120 || value === null || typeof value !== "object") return flat;
  const next = `${indent}  `;
  if (Array.isArray(value)) return `[\n${value.map((v) => next + stringify(v, next)).join(",\n")}\n${indent}]`;
  const rows = Object.entries(value)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${next}${JSON.stringify(k)}: ${stringify(v, next)}`);
  return `{\n${rows.join(",\n")}\n${indent}}`;
}

function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
const round = (v) => (v == null ? null : Math.round(v));
function pct(values, p) {
  const xs = values.filter((v) => v != null).sort((a, b) => a - b);
  if (!xs.length) return null;
  return xs[Math.min(xs.length - 1, Math.ceil((p / 100) * xs.length) - 1)];
}
const mean = (xs) => {
  const v = xs.filter((x) => x != null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};

async function resolveObserver() {
  const given = opt("observer", null);
  if (given) {
    if (!/^[0-9a-f]{64}$/.test(given)) throw new Error("--observer must be 64 hex characters");
    return { observer: given, source: "--observer" };
  }
  for (const origin of HOUSE_ORIGINS) {
    try {
      const res = await fetch(`${origin}/.well-known/nostr.json?name=_`, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) continue;
      const pk = (await res.json())?.names?._;
      if (/^[0-9a-f]{64}$/.test(pk ?? "")) return { observer: pk, source: `${origin}/.well-known/nostr.json?name=_` };
    } catch {
      /* next origin */
    }
  }
  throw new Error("Could not discover the house observer; pass --observer <hex>.");
}

/** index.html's head start sends the Top page's REQ; warn if this runner has drifted from it. */
function driftCheck() {
  try {
    const html = readFileSync(resolve(ROOT, "client/index.html"), "utf8");
    const rows = [...html.matchAll(/\{ kinds: \[([\d, ]+)\], search: (q|fresh) \+ perspective, limit: (\d+) \}/g)].map(
      (m) => ({
        kinds: m[1].split(",").map((s) => Number(s.trim())),
        recent: m[2] === "fresh",
        limit: Number(m[3]),
      }),
    );
    const same =
      rows.length === SECTIONS.length &&
      rows.every(
        (r, i) =>
          JSON.stringify(r) ===
          JSON.stringify({ kinds: SECTIONS[i].kinds, recent: SECTIONS[i].recent, limit: SECTIONS[i].limit }),
      );
    return same
      ? null
      : "Top page sections in client/index.html differ from this runner's SECTIONS; update the runner.";
  } catch {
    return "Could not read client/index.html to check the sections.";
  }
}

async function main() {
  const set = JSON.parse(readFileSync(QUERIES_PATH, "utf8"));
  const entries = set.entries.filter((e) => !ONLY.length || ONLY.includes(e.id));
  const { observer, source } = await resolveObserver();
  const drift = driftCheck();
  if (drift) console.warn(`warning: ${drift}`);

  if (PRINT_FILTERS) {
    for (const e of entries.filter((x) => x.run !== false && typeof x.query === "string"))
      console.log(e.id, JSON.stringify(["REQ", "top", ...topFilters(e.query, observer)]));
    return;
  }

  const index = new Relay(RELAY);
  const startedAt = new Date();
  const now = Math.floor(Date.now() / 1000);
  console.error(`observer ${observer} (${source})`);

  const dlist = WITH_DLIST ? await loadDList(index, observer) : null;
  if (dlist) {
    for (const [k, v] of Object.entries(dlist.lists))
      console.error(
        `${k}: ${v.pool_size} items in the browser pool (index ${v.index_returned}, hub ${v.hub_returned}) of ${v.relay_total ?? "?"} on the relay`,
      );
  }

  // Every expected id, checked once against the relay (include:spam: does it exist at all?).
  const wanted = [...new Set(entries.flatMap((e) => resultGroups(e.expect).flat()))];
  const exists = {};
  {
    const pubkeys = wanted.filter((id) => /^[0-9a-f]{64}$/.test(id));
    const addrs = wanted.filter((id) => /^\d+:[0-9a-f]{64}:/.test(id));
    const filters = [];
    if (pubkeys.length) filters.push({ kinds: [0], authors: pubkeys, search: "include:spam", limit: pubkeys.length });
    const groups = new Map();
    for (const a of addrs) {
      const [kind, pubkey, ...d] = a.split(":");
      const key = `${kind}:${pubkey}`;
      groups.set(key, [...(groups.get(key) ?? []), d.join(":")]);
    }
    for (const [key, ds] of groups) {
      const [kind, pubkey] = key.split(":");
      filters.push({
        kinds: [Number(kind)],
        authors: [pubkey],
        "#d": ds,
        search: "include:spam",
        limit: ds.length * 2,
      });
    }
    for (let i = 0; i < filters.length; i += 10) {
      const res = await reqWithRetry(index, filters.slice(i, i + 10), "exists");
      for (const { event } of res.events) exists[stableId(event)] = true;
    }
    for (const id of wanted) exists[id] ??= false;
  }

  const results = [];
  for (const [n, entry] of entries.entries()) {
    if (entry.run === false || typeof entry.query !== "string") {
      results.push({ id: entry.id, class: entry.class, journey: entry.journey, run: false });
      continue;
    }
    const filters = topFilters(entry.query, observer);
    const res = await reqWithRetry(index, filters, entry.id);
    const bySection = Object.fromEntries(SECTIONS.map((s) => [s.key, []]));
    for (const { event, t } of res.events) {
      const key = SECTION_OF_KIND.get(event.kind);
      if (key) bySection[key].push({ event, t });
    }
    const categories = {};
    for (const s of SECTIONS) {
      const arrived = bySection[s.key];
      const shownEvents = gate(
        s.key,
        arrived.map((a) => a.event),
        now,
      );
      const top = shownEvents.slice(0, 10);
      categories[s.key] = {
        received: arrived.length,
        count: Math.min(arrived.length, s.limit),
        shown: shownEvents.length,
        t_first_event_ms: round(arrived[0]?.t),
        t_last_event_ms: round(arrived[arrived.length - 1]?.t),
        top10: top.map((ev) => ({ id: stableId(ev), label: labelOf(ev) })),
        top10_ids: top.map(stableId),
        top10_events: top,
      };
    }

    // The DList previews: the words matched in the items the browser loaded.
    const dlist_checks = {};
    if (dlist) {
      for (const cat of DLIST_CATEGORIES) {
        const list = dlist.lists[cat];
        if (!list.in_dictionary) {
          categories[cat] = {
            shown: 0,
            matched: 0,
            top10: [],
            top10_ids: [],
            top10_events: [],
            note: "not on the Dictionary list",
          };
          continue;
        }
        const words = wordsToFind(entry.query, list.names);
        const found = matchListItems(list.pool, words, CANDIDATES, READERS[cat], TITLE_ONLY[cat]);
        const top = found.slice(0, 10);
        categories[cat] = {
          words,
          matched: found.length,
          shown: Math.min(found.length, PREVIEW_SHOWS[cat]),
          top10: top.map((ev) => ({ id: stableId(ev), label: READERS[cat](ev).title?.slice(0, 60) ?? "" })),
          top10_ids: top.map(stableId),
          top10_events: top,
          found_ids: found.map(stableId),
        };
      }
      // For each expected list item: is it in the browser's pool, did the words match it there,
      // and would the relay have found it if the page had asked (a counterfactual probe, not today's behaviour)?
      const dlistWanted = resultGroups(entry.expect)
        .flat()
        .filter((id) => /^(39999|9999):/.test(id));
      const cats = DLIST_CATEGORIES.filter((c) => (entry.expect?.categories ?? []).includes(c));
      if (dlistWanted.length && cats.length) {
        for (const cat of cats) {
          const list = dlist.lists[cat];
          const probe = await reqWithRetry(
            index,
            [
              {
                kinds: [39999, 9999],
                "#z": list.chain,
                search: `${tidy(entry.query)} observer:${observer}`,
                limit: 10,
              },
            ],
            `${entry.id} relay probe ${cat}`,
          );
          const probeIds = probe.events.map((e) => stableId(e.event));
          for (const id of dlistWanted) {
            const inPool = list.pool.some((ev) => stableId(ev) === id);
            // An id belongs to the list whose pool holds it; failing that, the first list expected.
            if (dlist_checks[id]?.in_browser_pool && !inPool) continue;
            const matched = (categories[cat].found_ids ?? []).indexOf(id) + 1;
            dlist_checks[id] = {
              list: cat,
              in_browser_pool: inPool,
              matched_rank: matched || null,
              relay_probe_rank: probeIds.indexOf(id) + 1 || null,
              relay_probe_count: probe.events.length,
            };
          }
          await sleep(300);
        }
      }
      for (const cat of DLIST_CATEGORIES) delete categories[cat]?.found_ids;
    }

    const run = { categories, exists, dlist_checks };
    const score = scoreEntry(entry, run, now);
    const firstAny = res.events.length ? round(res.events[0].t) : null;
    // The sections an entry names keep their top 10; the rest keep their counts and timings.
    const named = new Set([...(entry.expect?.categories ?? []), ...(entry.expect?.absent_categories ?? [])]);
    for (const [cat, c] of Object.entries(categories)) {
      delete c.top10_events;
      delete c.top10_ids; // the same ids are in top10, with labels
      if (!FULL && !named.has(cat)) delete c.top10;
    }
    results.push({
      id: entry.id,
      query: entry.query,
      class: entry.class,
      journey: entry.journey,
      run: true,
      sent_terms: tidy(entry.query),
      end: res.end,
      closed_reason: res.reason ?? null,
      t_first_event_ms: firstAny,
      t_eose_ms: res.end === "eose" ? round(res.ms) : null,
      events_received: res.events.length,
      categories,
      score,
    });
    const s = score;
    console.error(
      `${String(n + 1).padStart(3)} ${entry.id.padEnd(34)} eose ${String(round(res.ms) ?? "-").padStart(5)}ms  cat ${s.category_hit_share == null ? "  - " : `${Math.round(s.category_hit_share * 100)}%`.padStart(4)}  recall ${s.recall_at_10 == null ? " -  " : `${Math.round(s.recall_at_10 * 100)}%`.padStart(4)}${s.absent_violations.length ? `  absent! ${s.absent_violations.join(",")}` : ""}`,
    );
    await sleep(PAUSE_MS);
  }
  index.close();

  // Summary
  const ran = results.filter((r) => r.run);
  const summarize = (rows) => {
    const pairs = rows.flatMap((r) => Object.values(r.score.category_hits));
    const recall = rows.map((r) => r.score.recall_at_10).filter((v) => v != null);
    return {
      queries: rows.length,
      all_categories_hit_rate: mean(
        rows.map((r) => (r.score.all_categories_hit == null ? null : r.score.all_categories_hit ? 1 : 0)),
      ),
      category_hit_rate: pairs.length ? pairs.filter(Boolean).length / pairs.length : null,
      recall_at_10: mean(recall),
      recall_queries: recall.length,
      absent_violations: rows.reduce((a, r) => a + r.score.absent_violations.length, 0),
      absent_checks: rows.reduce(
        (a, r) => a + (set.entries.find((e) => e.id === r.id)?.expect?.absent_categories ?? []).length,
        0,
      ),
      filter_precision: mean(rows.map((r) => r.score.filter_precision_mean)),
      filter_queries: rows.filter((r) => r.score.filter_precision_mean != null).length,
      eose_p50_ms: pct(
        rows.map((r) => r.t_eose_ms),
        50,
      ),
      eose_p95_ms: pct(
        rows.map((r) => r.t_eose_ms),
        95,
      ),
      first_event_p50_ms: pct(
        rows.map((r) => r.t_first_event_ms),
        50,
      ),
      timeouts: rows.filter((r) => r.end !== "eose").length,
    };
  };
  const groupBy = (key) =>
    Object.fromEntries(
      [...new Set(ran.map((r) => r[key]))].sort().map((k) => [k, summarize(ran.filter((r) => r[key] === k))]),
    );
  const summary = { overall: summarize(ran), by_class: groupBy("class"), by_journey: groupBy("journey") };
  const notRun = results.filter((r) => !r.run).length;

  const output = {
    meta: {
      run_at: startedAt.toISOString(),
      runner: "scripts/search-eval/baseline.mjs",
      queries_file: QUERIES_PATH.replace(`${ROOT}/`, ""),
      set_version: set.version ?? null,
      relay: RELAY,
      observer,
      observer_source: source,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      node: process.version,
      app_commit: appCommit(),
      pause_ms: PAUSE_MS,
      timeout_ms: TIMEOUT_MS,
      requests_sent: sentByType.REQ + sentByType.COUNT,
      frames_sent: { ...sentByType },
      relay_errors: relayErrors,
      drift_warning: drift,
      entries: entries.length,
      run: ran.length,
      not_run: notRun,
    },
    dlist: dlist && {
      hub: dlist.hub,
      house_assistant: dlist.house_assistant,
      setup_ms: dlist.setup_ms,
      lists: Object.fromEntries(Object.entries(dlist.lists).map(([k, v]) => [k, { ...v, pool: undefined }])),
    },
    summary,
    results,
  };
  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, `${stringify(output)}\n`);

  const p = (v) => (v == null ? "  -  " : `${(v * 100).toFixed(0)}%`.padStart(5));
  const ms = (v) => (v == null ? "   - " : `${v}`.padStart(5));
  console.log(
    `\nSearch eval baseline  ${startedAt.toISOString()}  observer ${observer.slice(0, 8)}…  ${ran.length} run, ${notRun} not run\n`,
  );
  console.log("group                    n   all-cats  cat-hit  recall@10  absent  filters  eose p50  eose p95");
  const line = (name, s) =>
    console.log(
      `${name.padEnd(22)} ${String(s.queries).padStart(3)}   ${p(s.all_categories_hit_rate)}    ${p(s.category_hit_rate)}    ${p(s.recall_at_10)}    ${`${s.absent_violations}/${s.absent_checks}`.padStart(5)}   ${p(s.filter_precision)}    ${ms(s.eose_p50_ms)}     ${ms(s.eose_p95_ms)}`,
    );
  line("overall", summary.overall);
  for (const [k, s] of Object.entries(summary.by_class)) line(`class ${k}`, s);
  for (const [k, s] of Object.entries(summary.by_journey)) line(`journey ${k}`, s);
  console.log(`\n${sentByType.REQ} REQ + ${sentByType.COUNT} COUNT sent. Results: ${OUT_PATH.replace(`${ROOT}/`, "")}`);
  console.log("Before committing: npx prettier --write docs/search/eval/");
}

/** The checkout's commit, whose Top page the runner mirrors; null outside a git checkout. */
function appCommit() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
