/**
 * The kinds with no card of their own — communities, fundraisers, reviews,
 * stalls, app handlers, sites, calendars, badges — read into one shape a
 * generic card can draw: a title, a line of description, a picture, a few
 * quiet facts, and for a review its stars.
 *
 * Every shape here is what staging actually holds (probed 2026-09-29), not
 * only what a spec says: several of these kinds carry JSON in `content`
 * (NIP-28 channels, NIP-15 stalls and marketplaces, NIP-89 handlers), and a
 * few kind numbers are shared with unrelated apps — 30017 also carries a
 * typing game's scores. So a thing is a thing only when it has a name to
 * show; anything else returns null, and the tabs leave it out.
 */
import { formatBytes } from "@/lib/formatBytes";

type EventLike = { kind: number; tags: string[][]; content: string; created_at?: number };

export interface Thing {
  title: string;
  description: string | null;
  image: string | null;
  /** Short facts for one quiet line: "3 moderators", "Goal 5,000 sats", "Closed". */
  facts: string[];
  /** Out of five, when the event is a review or rating we can read. */
  stars: number | null;
  /** A page outside Brainstorm this thing points at (a site, a mint, a relay's info page). */
  link: string | null;
  /** Small pictures that ARE the thing — an emoji pack's first few emoji. */
  previews: string[];
  /** What this kind's own card draws beyond the common shape (components/search/thingCards). */
  detail: ThingDetail;
}

/** Where a prediction market stands: taking bets, waiting on its oracle, settled, or called off. */
export type MarketStatus = "open" | "closed" | "resolved" | "cancelled";

export type TorrentCategory = "audio" | "video" | "image" | "software" | "archive" | "other";

/** The per-kind part of a [Thing], one shape per card. */
export type ThingDetail =
  | {
      type: "community";
      /** NIP-72 moderated community, NIP-29 relay group, or NIP-28 public chat channel. */
      variant: "moderated" | "group" | "channel";
      moderators: string[];
      rules: string | null;
      isPublic: boolean;
      isOpen: boolean;
    }
  | {
      type: "fundraiser";
      /** A NIP-75 zap goal (raised by zaps, so progress can be counted) vs an Agora campaign (on-chain). */
      zapGoal: boolean;
      goalSats: number | null;
      /** Unix seconds. */
      deadline: number | null;
      ended: boolean;
      topics: string[];
    }
  | {
      type: "review";
      subject: "relay" | "mint" | "entity";
      /** What sort of thing is reviewed, in words: "Relay", "Ecash mint", "Book". */
      subjectLabel: string;
      /** A relay review's per-aspect scores (speed, uptime…), out of five. */
      aspects: { name: string; stars: number }[];
    }
  | {
      type: "market";
      /** The answers a bettor picks between: "YES"/"NO", or ranges and names. */
      outcomes: string[];
      status: MarketStatus | null;
      /** The outcome it resolved to, when the event says. */
      resolution: string | null;
      /** When betting closes, unix seconds. */
      closes: number | null;
      category: string | null;
      /** On BAO's demo network — play money, not sats. */
      demo: boolean;
    }
  | {
      type: "ballot";
      /** The election's own id, as the voting app names it. */
      election: string;
      /** Each question's id and the voter's answer, in the order cast. */
      answers: { question: string; answer: string }[];
      proofHash: string | null;
    }
  | { type: "shop"; variant: "stall" | "marketplace"; currency: string | null; zones: string[]; merchants: number }
  | {
      type: "app";
      variant: "handler" | "site" | "napplet";
      /** The kinds a NIP-89 handler opens. */
      handles: number[];
      files: number;
      /** A napplet's required host capabilities. */
      requires: string[];
      topics: string[];
    }
  | { type: "calendar"; events: number; location: string | null; topics: string[] }
  | { type: "badge" }
  | { type: "emoji"; emoji: { code: string; url: string }[] }
  | {
      type: "playlist";
      variant: "album" | "ep" | "playlist";
      tracks: number;
      artist: string | null;
      trackLines: string[];
    }
  | {
      type: "learning";
      language: string | null;
      license: string | null;
      free: boolean;
      creator: string | null;
      audience: string[];
      topics: string[];
    }
  | {
      type: "torrent";
      files: { name: string; bytes: number }[];
      totalBytes: number;
      /** The BitTorrent v1 info hash, when the `x` tag holds one. */
      infoHash: string | null;
      trackers: string[];
      category: TorrentCategory;
      topics: string[];
    };

/** Every kind [describeThing] reads. */
export const THING_KINDS = new Set([
  40, 41, 2003, 9041, 15128, 15129, 30009, 30017, 30019, 30030, 30142, 31924, 31987, 31990, 33863, 34139, 34259, 34550,
  35128, 35129, 38000, 39000,
]);

const tag = (ev: EventLike, k: string): string | undefined => ev.tags.find((t) => t[0] === k)?.[1]?.trim() || undefined;
const count = (ev: EventLike, k: string): number => ev.tags.filter((t) => t[0] === k && t[1]).length;
const isHttp = (s: string | undefined | null): s is string => !!s && /^https?:\/\//i.test(s);
const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

/** A JSON object in `content`, or null — never a throw on the junk a kind number also carries. */
function jsonContent(ev: EventLike): Record<string, unknown> | null {
  const text = ev.content.trim();
  if (!text.startsWith("{")) return null;
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined);

/** "relay.damus.io" from "wss://relay.damus.io/", "mint.lnpay.cz" from a URL; the input itself when it is no URL. */
export function hostOfUrl(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, "") || url;
  } catch {
    return url;
  }
}

/**
 * Kind 38000 is NIP-87's mint recommendation, but the number is shared: BAO
 * Markets publishes prediction markets on it, and ballots, games and test
 * votes sit there too (probed 2026-09-30). NIP-87 names the mint's own kind
 * in `k` — 38172 a Cashu mint, 38173 a Fedimint — so a `k` decides; without
 * one, only a `u` (the mint's address) makes it a mint review.
 */
export function isMintReview(ev: Pick<EventLike, "tags">): boolean {
  const k = ev.tags.find((t) => t[0] === "k")?.[1]?.trim();
  if (k) return k === "38172" || k === "38173";
  return ev.tags.some((t) => t[0] === "u" && t[1]?.trim());
}

/** The formats kind 38000 carries that Brainstorm can draw. */
export type Kind38000Format = "mint-review" | "market" | "ballot";

/**
 * Which of kind 38000's formats an event is, told apart by the tags each
 * app always writes (production relay, 2026-09-30 — 15k events a year):
 *
 * - a NIP-87 mint review names the mint (isMintReview);
 * - a ballot names its `election` (an auditable-voting app; JSON answers);
 * - a BAO prediction market has a `market` id, two or more `outcome`s, or
 *   — its first shape — a `type` and an `end`.
 *
 * Anything else — the 12k one-key "sybil test vote"s against a federation,
 * app manifests, agent profiles — is null, and shows as a plain event.
 */
export function kind38000Format(ev: Pick<EventLike, "tags">): Kind38000Format | null {
  if (isMintReview(ev)) return "mint-review";
  const has = (k: string) => ev.tags.some((t) => t[0] === k && t[1]?.trim());
  if (has("election")) return "ballot";
  const outcomes = ev.tags.filter((t) => t[0] === "outcome" && t[1]?.trim()).length;
  if (has("market") || outcomes >= 2 || (has("type") && has("end"))) return "market";
  return null;
}

/**
 * Which scale a kind's `rating` is on. Relay reviews (31987) are always the
 * 0..1 fraction (Quartz's `RelayReviewEvent`); NIP-87 mint reviews (38000)
 * are published as raw stars — `["rating","1"]` there is one star, not five.
 * Ratings of anything (34259) are published both ways ("either").
 */
export type RatingScale = "fraction" | "stars" | "either";

/**
 * A rating as stars out of five, the way Quartz's `EntityRatingEvent.stars()`
 * reads it where both scales are published and the `rating` tag alone
 * cannot always tell them apart:
 *
 * 1. an `s` tag in 1..5 is the author's own star count and wins;
 * 2. else a `rating` in 0..1 is the spec's fraction (a full score is `1.000`);
 * 3. else a `rating` in 1..5 is a raw star count;
 * 4. else null — a review we cannot score shows no stars, never zero.
 *
 * A kind whose scale is known reads only that scale; anything outside it is
 * malformed, and shows no stars.
 */
export function starsOf(ev: EventLike, scale: RatingScale = "either"): number | null {
  const s = Number(tag(ev, "s"));
  if (Number.isInteger(s) && s >= 1 && s <= 5) return s;
  // The overall score is the `rating` with no aspect (a third element names one: speed, uptime…).
  const overall = ev.tags.find((t) => t[0] === "rating" && t[1] && !t[2]) ?? ev.tags.find((t) => t[0] === "rating");
  const raw = Number(overall?.[1]);
  if (!overall?.[1] || !Number.isFinite(raw) || raw < 0) return null;
  if (scale === "stars") return raw >= 1 && raw <= 5 ? raw : null;
  if (raw <= 1) return raw * 5;
  if (scale === "either" && raw <= 5) return raw;
  return null;
}

const MARK_NOUNS: Record<string, string> = {
  book: "a book",
  books: "a book",
  movie: "a movie",
  film: "a film",
  music: "music",
  podcast: "a podcast",
  place: "a place",
  product: "a product",
  hashtag: "a hashtag",
  url: "a web page",
  event: "a note",
  profile: "a person",
};

function thing(partial: Partial<Thing> & { title: string; detail: ThingDetail }): Thing {
  return {
    description: null,
    image: null,
    facts: [],
    stars: null,
    link: null,
    previews: [],
    ...partial,
  };
}

/**
 * One read per event object: the tabs gate on it, the card and SerpRow draw
 * from it, and a results page recomputes its rows on every streamed author
 * score — several of these kinds parse JSON content to answer.
 */
const read = new WeakMap<EventLike, Thing | null>();

export function describeThing(ev: EventLike): Thing | null {
  if (!THING_KINDS.has(ev.kind)) return null;
  const known = read.get(ev);
  if (known !== undefined) return known;
  const raw = readThing(ev);
  const thing = raw && {
    ...raw,
    title: decodeEntities(raw.title),
    description: raw.description && decodeEntities(raw.description),
  };
  read.set(ev, thing);
  return thing;
}

function readThing(ev: EventLike): Thing | null {
  switch (ev.kind) {
    // NIP-28 public chat: the channel's name, about and picture are JSON in content.
    case 40:
    case 41: {
      const json = jsonContent(ev);
      const title = str(json?.name);
      if (!title) return null;
      const picture = str(json?.picture);
      return thing({
        title,
        description: str(json?.about) ?? null,
        image: isHttp(picture) ? picture : null,
        facts: ["Public chat"],
        detail: { type: "community", variant: "channel", moderators: [], rules: null, isPublic: true, isOpen: true },
      });
    }
    // NIP-72 moderated community: its moderators are `p` tags with the role
    // (or no role at all, as Amethyst and chorus publish them).
    case 34550: {
      const title = tag(ev, "name") ?? tag(ev, "d");
      if (!title) return null;
      const moderators = [
        ...new Set(
          ev.tags
            .filter((t) => t[0] === "p" && /^[0-9a-f]{64}$/i.test(t[1] ?? "") && (!t[3] || t[3] === "moderator"))
            .map((t) => t[1].toLowerCase()),
        ),
      ];
      const image = tag(ev, "image");
      return thing({
        title,
        description: tag(ev, "description") ?? null,
        image: isHttp(image) ? image : null,
        facts: moderators.length > 0 ? [plural(moderators.length, "moderator")] : [],
        detail: {
          type: "community",
          variant: "moderated",
          moderators,
          rules: rulesOf(ev),
          isPublic: true,
          isOpen: true,
        },
      });
    }
    // NIP-29 relay-based group: its name, about, and whether anyone may join.
    case 39000: {
      const title = tag(ev, "name");
      if (!title) return null;
      const has = (k: string) => ev.tags.some((t) => t[0] === k);
      const picture = tag(ev, "picture");
      const isPublic = !has("private");
      const isOpen = !has("closed");
      return thing({
        title,
        description: tag(ev, "about") ?? null,
        image: isHttp(picture) ? picture : null,
        facts: [isPublic ? "Public" : "Private", isOpen ? "Open to join" : "Closed"],
        detail: { type: "community", variant: "group", moderators: [], rules: null, isPublic, isOpen },
      });
    }
    // NIP-15 stall: a merchant's shop, JSON in content — its currency and
    // where it ships. The kind number is also a typing game's score sheet:
    // no name, not a stall.
    case 30017: {
      const json = jsonContent(ev);
      const title = str(json?.name);
      if (!title) return null;
      const currency = str(json?.currency)?.toUpperCase() ?? null;
      const zones = Array.isArray(json?.shipping)
        ? [
            ...new Set(
              json.shipping.flatMap((z) => {
                const zone = z as Record<string, unknown> | null;
                const regions = Array.isArray(zone?.regions) ? zone.regions.map(str).filter(Boolean) : [];
                return regions.length ? (regions as string[]) : [str(zone?.name)].filter((n): n is string => !!n);
              }),
            ),
          ]
        : [];
      return thing({
        title,
        description: str(json?.description) ?? null,
        facts: ["Shop", ...(currency ? [`Prices in ${currency}`] : [])],
        detail: { type: "shop", variant: "stall", currency, zones, merchants: 0 },
      });
    }
    // NIP-15 marketplace: a curated set of merchants, JSON in content.
    case 30019: {
      const json = jsonContent(ev);
      const title = str(json?.name);
      if (!title) return null;
      const ui = json?.ui && typeof json.ui === "object" ? (json.ui as Record<string, unknown>) : null;
      const picture = str(ui?.picture) ?? str(ui?.banner);
      const merchants = Array.isArray(json?.merchants) ? json.merchants.length : 0;
      return thing({
        title,
        description: str(json?.about) ?? null,
        image: isHttp(picture) ? picture : null,
        facts: ["Marketplace", ...(merchants > 0 ? [plural(merchants, "merchant")] : [])],
        detail: { type: "shop", variant: "marketplace", currency: null, zones: [], merchants },
      });
    }
    // NIP-89 handler: an app's profile (kind-0 shaped JSON) and the kinds it opens.
    case 31990: {
      const json = jsonContent(ev);
      const title = str(json?.display_name) ?? str(json?.name) ?? tag(ev, "name") ?? tag(ev, "d");
      if (!title) return null;
      const picture = str(json?.picture) ?? str(json?.image);
      const website = str(json?.website);
      const handles = [
        ...new Set(ev.tags.filter((t) => t[0] === "k" && /^\d+$/.test(t[1] ?? "")).map((t) => Number(t[1]))),
      ];
      return thing({
        title,
        description: str(json?.about) ?? str(json?.description) ?? null,
        image: isHttp(picture) ? picture : null,
        link: isHttp(website) ? website : null,
        facts: handles.length > 0 ? [`Opens ${plural(handles.length, "kind")}`] : [],
        detail: { type: "app", variant: "handler", handles, files: 0, requires: [], topics: topicsOf(ev) },
      });
    }
    // NIP-5A static sites (root 15128, named 35128) and NIP-5D napplets
    // (15129, 35129). Most sites name nothing but their `d`; a root site not
    // even that, and is its author's site.
    case 15128:
    case 35128:
    case 15129:
    case 35129: {
      const napplet = ev.kind === 15129 || ev.kind === 35129;
      const title = tag(ev, "title") ?? tag(ev, "d") ?? (napplet ? "Mini app" : "Website");
      const files = count(ev, "path");
      return thing({
        title,
        description: tag(ev, "description") ?? (ev.content.trim() || null),
        facts: [napplet ? "Mini app" : "Nostr site", ...(files > 1 ? [plural(files, "file")] : [])],
        detail: {
          type: "app",
          variant: napplet ? "napplet" : "site",
          handles: [],
          files,
          requires: [...new Set(ev.tags.filter((t) => t[0] === "requires" && t[1]).map((t) => t[1]))],
          topics: topicsOf(ev),
        },
      });
    }
    // NIP-58 badge definition.
    case 30009: {
      const title = tag(ev, "name") ?? tag(ev, "d");
      if (!title) return null;
      const image = tag(ev, "image") ?? tag(ev, "thumb");
      return thing({
        title,
        description: tag(ev, "description") ?? null,
        image: isHttp(image) ? image : null,
        facts: ["Badge"],
        detail: { type: "badge" },
      });
    }
    // NIP-51 emoji set: the emoji are the thing, so a few of them show.
    case 30030: {
      const title = tag(ev, "title") ?? tag(ev, "name") ?? tag(ev, "d");
      if (!title) return null;
      const emoji = ev.tags
        .filter((t) => t[0] === "emoji" && t[1] && isHttp(t[2]))
        .map((t) => ({ code: t[1], url: t[2] }));
      if (emoji.length === 0) return null;
      return thing({
        title,
        description: tag(ev, "description") ?? null,
        facts: [plural(emoji.length, "emoji", "emoji")],
        previews: emoji.slice(0, 8).map((e) => e.url),
        detail: { type: "emoji", emoji },
      });
    }
    // A music playlist or album: its title, notes and cover, how many tracks,
    // and the first few by name — Yakihonne and wavlake-style publishers list
    // them in content, one "artist - title" per line under a `#` heading.
    case 34139: {
      const title = tag(ev, "title") ?? tag(ev, "d");
      if (!title) return null;
      const image = tag(ev, "image");
      const tracks = count(ev, "a") + count(ev, "e");
      const type = tag(ev, "type");
      const variant = type === "album" ? "album" : type === "ep" ? "ep" : "playlist";
      const trackLines = ev.content
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => / [-–—] /.test(l) && !l.startsWith("#") && !/https?:\/\//i.test(l))
        .slice(0, 3);
      return thing({
        title,
        description: tag(ev, "description") ?? null,
        image: isHttp(image) ? image : null,
        facts: [
          variant === "album" ? "Album" : variant === "ep" ? "EP" : "Playlist",
          ...(tracks > 0 ? [plural(tracks, "track")] : []),
        ],
        detail: { type: "playlist", variant, tracks, artist: tag(ev, "artist") ?? null, trackLines },
      });
    }
    // NIP-75 zap goal: the content is the goal; `amount` is millisats.
    case 9041: {
      const title = ev.content.trim().split("\n")[0]?.trim();
      if (!title) return null;
      const msats = Number(tag(ev, "amount"));
      const goalSats = Number.isFinite(msats) && msats > 0 ? Math.round(msats / 1000) : null;
      const closes = Number(tag(ev, "closed_at"));
      const deadline = Number.isFinite(closes) && closes > 0 ? closes : null;
      const image = tag(ev, "image");
      return thing({
        title,
        description: tag(ev, "summary") ?? null,
        image: isHttp(image) ? image : null,
        link: isHttp(tag(ev, "link")) ? tag(ev, "link")! : null,
        facts: goalSats ? [`Goal ${plural(goalSats, "sat")}`] : [],
        detail: {
          type: "fundraiser",
          zapGoal: true,
          goalSats,
          deadline,
          ended: deadline !== null && deadline * 1000 < Date.now(),
          topics: topicsOf(ev),
        },
      });
    }
    // Agora fundraiser: a campaign with a story, a banner and a goal in sats.
    case 33863: {
      const title = tag(ev, "title") ?? tag(ev, "d");
      if (!title) return null;
      const imetaUrl = ev.tags
        .find((t) => t[0] === "imeta")
        ?.find((s) => s.startsWith("url "))
        ?.slice(4);
      const image = tag(ev, "banner") ?? tag(ev, "image") ?? imetaUrl;
      const goal = Number(tag(ev, "goal"));
      const goalSats = Number.isFinite(goal) && goal > 0 ? goal : null;
      const due = Number(tag(ev, "deadline"));
      const deadline = Number.isFinite(due) && due > 0 ? due : null;
      const ended = deadline !== null && deadline * 1000 < Date.now();
      return thing({
        title,
        description: ev.content.trim() || tag(ev, "summary") || null,
        image: isHttp(image) ? image : null,
        facts: [...(goalSats ? [`Goal ${plural(goalSats, "sat")}`] : []), ...(ended ? ["Ended"] : [])],
        detail: { type: "fundraiser", zapGoal: false, goalSats, deadline, ended, topics: topicsOf(ev) },
      });
    }
    // A rating of anything (kind 34259): the mark says what sort of thing.
    case 34259: {
      const mark = tag(ev, "m") ?? "event";
      // An unknown mark is said as written — "Rating of books", never "a books".
      const about = MARK_NOUNS[mark.toLowerCase()] ?? mark;
      const review = ev.content.trim();
      return thing({
        title: `Rating of ${about}`,
        description: review || null,
        stars: starsOf(ev),
        detail: {
          type: "review",
          subject: "entity",
          subjectLabel: capitalize(about.replace(/^an? /, "")),
          aspects: [],
        },
      });
    }
    // A review of a relay (kind 31987): `d` is the relay's URL; a `rating`
    // with a third element scores one aspect of it (speed, uptime…).
    case 31987: {
      const relay = tag(ev, "d") ?? tag(ev, "relay");
      if (!relay) return null;
      const host = hostOfUrl(relay);
      const aspects = ev.tags
        .filter((t) => t[0] === "rating" && t[2])
        .map((t) => ({ name: capitalize(t[2]), fraction: Number(t[1]) }))
        .filter((a) => Number.isFinite(a.fraction) && a.fraction >= 0 && a.fraction <= 1)
        .map((a) => ({ name: a.name, stars: a.fraction * 5 }));
      return thing({
        title: host,
        description: ev.content.trim() || null,
        stars: starsOf(ev, "fraction"),
        facts: ["Relay review"],
        detail: { type: "review", subject: "relay", subjectLabel: "Relay", aspects },
      });
    }
    case 38000: {
      const format = kind38000Format(ev);
      if (format === "market") return readMarket(ev);
      if (format === "ballot") return readBallot(ev);
      if (format !== "mint-review") return null;
      // NIP-87 mint recommendation: `u` is the mint.
      const mint = tag(ev, "u") ?? tag(ev, "d");
      if (!mint) return null;
      const host = hostOfUrl(mint);
      return thing({
        title: host,
        description: ev.content.trim() || tag(ev, "comment") || null,
        stars: starsOf(ev, "stars"),
        link: isHttp(mint) ? mint : null,
        facts: ["Ecash mint"],
        detail: { type: "review", subject: "mint", subjectLabel: "Ecash mint", aspects: [] },
      });
    }
    // NIP-52 calendar: a named collection of events.
    case 31924: {
      const title = tag(ev, "title") ?? tag(ev, "d");
      if (!title) return null;
      const events = count(ev, "a");
      const location = tag(ev, "location") ?? null;
      return thing({
        title,
        description: ev.content.trim() || tag(ev, "summary") || null,
        image: isHttp(tag(ev, "image")) ? tag(ev, "image")! : null,
        facts: ["Calendar", ...(events > 0 ? [plural(events, "event")] : []), ...(location ? [location] : [])],
        detail: { type: "calendar", events, location, topics: topicsOf(ev) },
      });
    }
    // A learning resource (kind 30142, the edufeed/AMB shape): name,
    // description, language, licence, audience, and the resource itself —
    // its `d` is the resource's own URL.
    case 30142: {
      const title = tag(ev, "name") ?? tag(ev, "title");
      if (!title) return null;
      const image = tag(ev, "image");
      const lang = tag(ev, "inLanguage") ?? null;
      const url = [tag(ev, "d"), tag(ev, "url"), tag(ev, "r")].find(isHttp) ?? null;
      const audience = [
        ...new Set(
          ev.tags
            // A bare number ("3") is a grade or level with its context lost; it says nothing on its own.
            .filter((t) => /:prefLabel(:[a-z-]+)?$/i.test(t[0] ?? "") && t[1]?.trim() && !/^\d+$/.test(t[1].trim()))
            .map((t) => t[1].trim()),
        ),
      ].slice(0, 3);
      return thing({
        title,
        description: tag(ev, "description") ?? (ev.content.trim() || null),
        image: isHttp(image) ? image : null,
        link: url,
        facts: ["Learning resource", ...(lang ? [lang.toUpperCase()] : [])],
        detail: {
          type: "learning",
          language: lang,
          license: licenseLabel(tag(ev, "license:id") ?? tag(ev, "license")),
          free: tag(ev, "isAccessibleForFree") === "true",
          creator: tag(ev, "creator:name") ?? null,
          audience,
          topics: topicsOf(ev),
        },
      });
    }
    // NIP-35 torrent: the title, what the uploader said, the files and their
    // size, and the info hash a magnet link is made of.
    case 2003: {
      const title = tag(ev, "title");
      if (!title) return null;
      const files = ev.tags
        .filter((t) => t[0] === "file" && t[1])
        .map((t) => ({ name: t[1], bytes: Number(t[2]) || 0 }));
      const totalBytes = files.reduce((n, f) => n + f.bytes, 0);
      const infoHash = tag(ev, "x");
      return thing({
        title,
        description: ev.content.trim() || null,
        facts: [
          "Torrent",
          ...(files.length > 1 ? [plural(files.length, "file")] : []),
          ...(totalBytes > 0 ? [formatBytes(totalBytes)] : []),
        ],
        detail: {
          type: "torrent",
          files,
          totalBytes,
          infoHash: infoHash && /^[0-9a-f]{40}$/i.test(infoHash) ? infoHash.toLowerCase() : null,
          trackers: ev.tags.filter((t) => t[0] === "tracker" && t[1]).map((t) => t[1]),
          category: torrentCategory(ev, files),
          topics: topicsOf(ev),
        },
      });
    }
    default:
      return null;
  }
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/**
 * Publishers that write from HTML leave its entities in plain-text fields —
 * "Kettle &amp; Pine" on staging. The common named ones and numeric ones are
 * decoded; anything else is left as written.
 */
export function decodeEntities(text: string): string {
  if (!text.includes("&")) return text;
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
    if (code[0] === "#") {
      const n = code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : whole;
    }
    return ENTITIES[code.toLowerCase()] ?? whole;
  });
}

/** A community's rules, unless they only repeat its description. */
function rulesOf(ev: EventLike): string | null {
  const rules = tag(ev, "rules") ?? tag(ev, "guidelines");
  const same = (a: string, b: string | undefined) => a.replace(/\s+/g, " ") === b?.replace(/\s+/g, " ");
  return rules && !same(rules, tag(ev, "description")) ? rules : null;
}

/** A JSON object in a string, or null. */
function jsonObject(text: string | undefined): Record<string, unknown> | null {
  if (!text?.trim().startsWith("{")) return null;
  return jsonContent({ kind: 0, tags: [], content: text });
}

const MARKET_STATUS: Record<string, MarketStatus> = {
  active: "open",
  open: "open",
  funding: "open",
  resolving: "closed",
  ended: "closed",
  closed: "closed",
  resolved: "resolved",
  settled: "resolved",
  voided: "cancelled",
  cancelled: "cancelled",
  canceled: "cancelled",
};

/**
 * Where a market stands — the same rules Amethyst's PredictionMarketEvent
 * keeps, so the two apps agree: a declared resolved or cancelled is final; a
 * `resolution` settles one still marked open (or unmarked); a `cancel_reason`
 * cancels an unmarked one; and BAO leaves "active" on markets whose betting
 * has closed, so an open one past its `end` is closed.
 */
export function marketStatus(
  said: string | undefined,
  { resolution, cancelled, closes }: { resolution: string | null; cancelled: boolean; closes: number | null },
  now = Date.now(),
): MarketStatus | null {
  const declared = said ? MARKET_STATUS[said] : undefined;
  if (declared === "resolved" || declared === "cancelled") return declared;
  if (resolution) return "resolved";
  if (!declared && cancelled) return "cancelled";
  const ended = closes !== null && closes * 1000 <= now;
  if (declared === "open" || !declared) return closes === null ? (declared ?? null) : ended ? "closed" : "open";
  return declared;
}

/** Unix seconds from seconds, milliseconds or an ISO date; null for anything else. */
function unixSeconds(v: unknown): number | null {
  if (typeof v === "string" && !/^\d+$/.test(v.trim())) {
    const ms = Date.parse(v);
    return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
  }
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n > 1e12 ? Math.floor(n / 1000) : Math.floor(n);
}

/**
 * A BAO prediction market, in any of its three shapes: the current one
 * (everything in tags, the market's words as JSON in a `data` tag, a post in
 * `content`), BAO Fund's (a `title` tag, JSON content) and the first
 * (`baoMarkets-mkt-…`, JSON content with outcome objects).
 */
function readMarket(ev: EventLike): Thing | null {
  const data = jsonObject(tag(ev, "data")) ?? jsonContent(ev);
  const title = str(data?.title) ?? tag(ev, "title");
  if (!title) return null;
  const tagged = ev.tags.filter((t) => t[0] === "outcome" && t[1]?.trim()).map((t) => t[1].trim());
  const listed = Array.isArray(data?.outcomes)
    ? data.outcomes
        .map(
          (o) =>
            str(o) ??
            (o && typeof o === "object"
              ? (str((o as { label?: unknown }).label) ?? str((o as { id?: unknown }).id))
              : undefined),
        )
        .filter((o): o is string => !!o)
    : [];
  const outcomes = [...new Set(tagged.length ? tagged : listed)];
  const resolution = tag(ev, "resolution") ?? null;
  const closes = unixSeconds(tag(ev, "end") ?? data?.endTime ?? data?.endDate);
  const status = marketStatus(
    (tag(ev, "status") ?? tag(ev, "state") ?? tag(ev, "s") ?? str(data?.status) ?? str(data?.state))?.toLowerCase(),
    { resolution, cancelled: !!tag(ev, "cancel_reason"), closes },
  );
  const demo = (tag(ev, "network") ?? tag(ev, "n"))?.toLowerCase() === "demo";
  const category = tag(ev, "category") ?? tag(ev, "c") ?? null;
  // The current shape's content is a social post of the same words, emoji and hashtags added.
  const description = str(data?.description) ?? (data ? null : ev.content.trim() || null);
  return thing({
    title,
    description,
    facts: ["Prediction market", ...(demo ? ["Demo"] : [])],
    detail: { type: "market", outcomes, status, resolution, closes, category, demo },
  });
}

/** An answer as words: a number or yes/no as written, an object not at all. */
const answerWords = (v: unknown): string | null =>
  typeof v === "string" ? v.trim() || null : typeof v === "number" || typeof v === "boolean" ? String(v) : null;

/**
 * A ballot cast in an auditable-voting app: the `election` it belongs to and
 * its answers, which are JSON in content — `responses` (question id, value),
 * a `ballot` object of question → choice, or a lone `vote_choice`.
 */
function readBallot(ev: EventLike): Thing | null {
  const election = tag(ev, "election");
  if (!election) return null;
  const json = jsonContent(ev);
  const answers: { question: string; answer: string }[] = [];
  if (Array.isArray(json?.responses)) {
    for (const r of json.responses as unknown[]) {
      if (!r || typeof r !== "object") continue;
      const { question_id, value } = r as { question_id?: unknown; value?: unknown };
      const question = answerWords(question_id);
      const answer = answerWords(value);
      if (question && answer) answers.push({ question, answer });
    }
  }
  if (json?.ballot && typeof json.ballot === "object" && !Array.isArray(json.ballot)) {
    for (const [question, value] of Object.entries(json.ballot as Record<string, unknown>)) {
      const answer = answerWords(value);
      if (answer) answers.push({ question, answer });
    }
  }
  const choice = answerWords(json?.vote_choice);
  if (choice) answers.push({ question: "Vote", answer: choice });
  const proofHash = tag(ev, "proof-hash") ?? tag(ev, "proof_hash") ?? str(json?.proof_hash) ?? null;
  return thing({
    title: `Ballot in ${election}`,
    description: answers.length ? answers.map((a) => `${a.question}: ${a.answer}`).join(" · ") : null,
    facts: ["Ballot", ...(answers.length ? [plural(answers.length, "answer")] : [])],
    detail: { type: "ballot", election, answers, proofHash },
  });
}

/** An event's `t` topics, lower-cased and de-duplicated. */
function topicsOf(ev: EventLike): string[] {
  return [...new Set(ev.tags.filter((t) => t[0] === "t" && t[1]?.trim()).map((t) => t[1].trim().toLowerCase()))];
}

const capitalize = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** "CC BY 4.0" from a Creative Commons URL; any other licence as written. */
export function licenseLabel(raw: string | undefined): string | null {
  if (!raw) return null;
  const cc = raw.match(/creativecommons\.org\/(?:licenses|publicdomain)\/([a-z-]+)\/(\d(?:\.\d)?)/i);
  if (cc) return cc[1].toLowerCase() === "zero" ? "CC0" : `CC ${cc[1].toUpperCase()} ${cc[2]}`;
  return raw.length <= 24 ? raw : null;
}

const AUDIO_EXT = /\.(flac|mp3|m4a|aac|ogg|opus|wav|alac)$/i;
const VIDEO_EXT = /\.(mkv|mp4|avi|mov|webm|m4v|wmv|ts)$/i;
const IMAGE_EXT = /\.(jpe?g|png|gif|webp|tiff?|raw)$/i;
const SOFTWARE_EXT = /\.(exe|dmg|iso|apk|deb|rpm|appimage|msi|pkg)$/i;
const ARCHIVE_EXT = /\.(zip|rar|7z|tar|gz|bz2|xz)$/i;

/** What a torrent holds, for its icon: its `t` topics first, else its files' extensions. */
function torrentCategory(ev: EventLike, files: { name: string }[]): TorrentCategory {
  const topics = new Set(topicsOf(ev));
  if (["audio", "music", "flac", "mp3", "album", "podcast"].some((t) => topics.has(t))) return "audio";
  if (["video", "movie", "movies", "film", "tv", "series", "anime"].some((t) => topics.has(t))) return "video";
  if (["software", "game", "games", "app", "apps"].some((t) => topics.has(t))) return "software";
  if (["image", "images", "photo", "photos"].some((t) => topics.has(t))) return "image";
  const names = [ev.tags.find((t) => t[0] === "title")?.[1] ?? "", ...files.map((f) => f.name)];
  if (names.some((n) => VIDEO_EXT.test(n))) return "video";
  if (names.some((n) => AUDIO_EXT.test(n))) return "audio";
  if (names.some((n) => SOFTWARE_EXT.test(n))) return "software";
  if (names.some((n) => IMAGE_EXT.test(n))) return "image";
  if (names.some((n) => ARCHIVE_EXT.test(n))) return "archive";
  return "other";
}

type ChannelEvent = EventLike & { id: string; pubkey: string; created_at: number };

/**
 * One result per NIP-28 channel. A kind 40 creates the channel; a kind 41
 * updates it, naming the 40 in its `e` tag — staging holds a 40 and several
 * 41s for one channel, which would read as the same result over and over.
 *
 * - Only what [describeThing] can name competes, so an unnamed update never
 *   wins the slot and takes the channel's named card down with it.
 * - NIP-28: a 41 counts only from the channel's creator. When the 40 is on
 *   the page, anyone else's 41 for it is dropped rather than shown in its
 *   place; when it is not, each author's 41s stand apart, so a stranger's
 *   update can never replace the creator's.
 * - The newest of a channel's events is its card, at the position the
 *   channel first appeared (the relay's order between channels is kept).
 *
 * Everything else passes through, in order.
 */
export function oneCardPerChannel<H extends { event: ChannelEvent }>(hits: H[]): H[] {
  const creatorOf = new Map<string, string>();
  for (const h of hits) if (h.event.kind === 40) creatorOf.set(h.event.id, h.event.pubkey);
  const out: H[] = [];
  const slot = new Map<string, number>();
  for (const h of hits) {
    const e = h.event;
    if (e.kind !== 40 && e.kind !== 41) {
      out.push(h);
      continue;
    }
    if (describeThing(e) === null) continue;
    const channel = e.kind === 40 ? e.id : (e.tags.find((t) => t[0] === "e" && t[1])?.[1] ?? e.id);
    const creator = creatorOf.get(channel);
    if (e.kind === 41 && creator !== undefined && creator !== e.pubkey) continue;
    const key = creator !== undefined ? channel : `${channel}|${e.pubkey}`;
    const at = slot.get(key);
    if (at === undefined) {
      slot.set(key, out.length);
      out.push(h);
    } else if (e.created_at > out[at].event.created_at) out[at] = h;
  }
  return out;
}
