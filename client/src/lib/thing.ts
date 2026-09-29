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
}

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
 * A rating as stars out of five, the way Quartz's `EntityRatingEvent.stars()`
 * reads it — two scales are published and the `rating` tag alone cannot
 * always tell them apart:
 *
 * 1. an `s` tag in 1..5 is the author's own star count and wins;
 * 2. else a `rating` in 0..1 is the spec's fraction (a full score is `1.000`);
 * 3. else a `rating` in 1..5 is a raw star count (NIP-87 mints publish `5`);
 * 4. else null — a review we cannot score shows no stars, never zero.
 */
export function starsOf(ev: EventLike): number | null {
  const s = Number(tag(ev, "s"));
  if (Number.isInteger(s) && s >= 1 && s <= 5) return s;
  // The overall score is the `rating` with no aspect (a third element names one: speed, uptime…).
  const overall = ev.tags.find((t) => t[0] === "rating" && t[1] && !t[2]) ?? ev.tags.find((t) => t[0] === "rating");
  const raw = Number(overall?.[1]);
  if (!overall?.[1] || !Number.isFinite(raw) || raw < 0) return null;
  if (raw <= 1) return raw * 5;
  if (raw <= 5) return raw;
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

function thing(partial: Partial<Thing> & { title: string }): Thing {
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

export function describeThing(ev: EventLike): Thing | null {
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
      });
    }
    // NIP-72 moderated community.
    case 34550: {
      const title = tag(ev, "name") ?? tag(ev, "d");
      if (!title) return null;
      const mods = ev.tags.filter((t) => t[0] === "p" && t[1] && (!t[3] || t[3] === "moderator")).length;
      const image = tag(ev, "image");
      return thing({
        title,
        description: tag(ev, "description") ?? null,
        image: isHttp(image) ? image : null,
        facts: mods > 0 ? [plural(mods, "moderator")] : [],
      });
    }
    // NIP-29 relay-based group: its name, about, and whether anyone may join.
    case 39000: {
      const title = tag(ev, "name");
      if (!title) return null;
      const has = (k: string) => ev.tags.some((t) => t[0] === k);
      const picture = tag(ev, "picture");
      const about = tag(ev, "about");
      return thing({
        title,
        description: about ?? null,
        image: isHttp(picture) ? picture : null,
        facts: [has("private") ? "Private" : "Public", has("closed") ? "Closed" : "Open to join"],
      });
    }
    // NIP-15 stall: a merchant's shop, JSON in content. The kind number is
    // also a typing game's score sheet — no name, not a stall.
    case 30017: {
      const json = jsonContent(ev);
      const title = str(json?.name);
      if (!title) return null;
      const currency = str(json?.currency);
      return thing({
        title,
        description: str(json?.description) ?? null,
        facts: ["Shop", ...(currency ? [`Prices in ${currency.toUpperCase()}`] : [])],
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
      });
    }
    // NIP-89 handler: an app's profile (kind-0 shaped JSON) and the kinds it opens.
    case 31990: {
      const json = jsonContent(ev);
      const title = str(json?.display_name) ?? str(json?.name) ?? tag(ev, "name") ?? tag(ev, "d");
      if (!title) return null;
      const picture = str(json?.picture) ?? str(json?.image);
      const website = str(json?.website);
      const kinds = count(ev, "k");
      return thing({
        title,
        description: str(json?.about) ?? str(json?.description) ?? null,
        image: isHttp(picture) ? picture : null,
        link: isHttp(website) ? website : null,
        facts: kinds > 0 ? [`Opens ${plural(kinds, "kind")}`] : [],
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
      });
    }
    // NIP-51 emoji set: the emoji are the thing, so a few of them show.
    case 30030: {
      const title = tag(ev, "title") ?? tag(ev, "name") ?? tag(ev, "d");
      if (!title) return null;
      const emoji = ev.tags.filter((t) => t[0] === "emoji" && isHttp(t[2])).map((t) => t[2]);
      if (emoji.length === 0) return null;
      return thing({
        title,
        description: tag(ev, "description") ?? null,
        facts: [plural(emoji.length, "emoji", "emoji")],
        previews: emoji.slice(0, 8),
      });
    }
    // A music playlist or album: its title, notes and cover, and how many tracks.
    case 34139: {
      const title = tag(ev, "title") ?? tag(ev, "d");
      if (!title) return null;
      const image = tag(ev, "image");
      const tracks = count(ev, "a") + count(ev, "e");
      const type = tag(ev, "type");
      return thing({
        title,
        description: tag(ev, "description") ?? null,
        image: isHttp(image) ? image : null,
        facts: [
          type === "album" ? "Album" : type === "ep" ? "EP" : "Playlist",
          ...(tracks > 0 ? [plural(tracks, "track")] : []),
        ],
      });
    }
    // NIP-75 zap goal: the content is the goal; `amount` is millisats.
    case 9041: {
      const title = ev.content.trim().split("\n")[0]?.trim();
      if (!title) return null;
      const msats = Number(tag(ev, "amount"));
      const image = tag(ev, "image");
      return thing({
        title,
        description: tag(ev, "summary") ?? null,
        image: isHttp(image) ? image : null,
        link: isHttp(tag(ev, "link")) ? tag(ev, "link")! : null,
        facts: Number.isFinite(msats) && msats > 0 ? [`Goal ${plural(Math.round(msats / 1000), "sat")}`] : [],
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
      const deadline = Number(tag(ev, "deadline"));
      const over = Number.isFinite(deadline) && deadline > 0 && deadline * 1000 < Date.now();
      return thing({
        title,
        description: ev.content.trim() || tag(ev, "summary") || null,
        image: isHttp(image) ? image : null,
        facts: [
          ...(Number.isFinite(goal) && goal > 0 ? [`Goal ${plural(goal, "sat")}`] : []),
          ...(over ? ["Ended"] : []),
        ],
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
      });
    }
    // A review of a relay (kind 31987): `d` is the relay's URL.
    case 31987: {
      const relay = tag(ev, "d") ?? tag(ev, "relay");
      if (!relay) return null;
      const host = hostOfUrl(relay);
      return thing({
        title: host,
        description: ev.content.trim() || null,
        stars: starsOf(ev),
        facts: ["Relay review"],
      });
    }
    // NIP-87 mint recommendation: `u` is the mint.
    case 38000: {
      const mint = tag(ev, "u") ?? tag(ev, "d");
      if (!mint) return null;
      const host = hostOfUrl(mint);
      return thing({
        title: host,
        description: ev.content.trim() || tag(ev, "comment") || null,
        stars: starsOf(ev),
        link: isHttp(mint) ? mint : null,
        facts: ["Ecash mint"],
      });
    }
    // NIP-52 calendar: a named collection of events.
    case 31924: {
      const title = tag(ev, "title") ?? tag(ev, "d");
      if (!title) return null;
      const events = count(ev, "a");
      const location = tag(ev, "location");
      return thing({
        title,
        description: ev.content.trim() || tag(ev, "summary") || null,
        image: isHttp(tag(ev, "image")) ? tag(ev, "image")! : null,
        facts: ["Calendar", ...(events > 0 ? [plural(events, "event")] : []), ...(location ? [location] : [])],
      });
    }
    // A learning resource (kind 30142): name, description, language.
    case 30142: {
      const title = tag(ev, "name") ?? tag(ev, "title");
      if (!title) return null;
      const image = tag(ev, "image");
      const lang = tag(ev, "inLanguage");
      return thing({
        title,
        description: tag(ev, "description") ?? (ev.content.trim() || null),
        image: isHttp(image) ? image : null,
        facts: ["Learning resource", ...(lang ? [lang.toUpperCase()] : [])],
      });
    }
    // NIP-35 torrent: the title, what the uploader said, and the files' size.
    case 2003: {
      const title = tag(ev, "title");
      if (!title) return null;
      const files = ev.tags.filter((t) => t[0] === "file");
      const bytes = files.reduce((n, t) => n + (Number(t[2]) || 0), 0);
      return thing({
        title,
        description: ev.content.trim() || null,
        facts: [
          "Torrent",
          ...(files.length > 1 ? [plural(files.length, "file")] : []),
          ...(bytes > 0 ? [formatBytes(bytes)] : []),
        ],
      });
    }
    default:
      return null;
  }
}
