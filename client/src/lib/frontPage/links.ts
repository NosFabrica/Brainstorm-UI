/**
 * The paper's links, per app: where a citation and a byline point. The brief names them only
 * as `<CITE_BASE>` and `<PROFILE_BASE>` and the writer's message gives each app's
 * (`linksLine`), so the brief is the same text in every app. The writer cites an event as
 * `<citeBase><64-hex id>` and a person as `<profileBase><64-hex id of one of their posts>`;
 * resolve encodes the first into an nevent, or an naddr for an addressable event (a stream,
 * a listing, a calendar entry, a long-form post or a recipe), and the second into the
 * author's npub; the boundary accepts exactly those encoded forms, for events and authors the
 * edition read.
 *
 * Matched to Amethyst's `commons/.../frontpage/PaperLinks.kt` (`PaperLinkSet`). Amethyst uses
 * jumble.social; Brainstorm its own `/e/` and `/p/` pages (`BRAINSTORM_LINKS`).
 */
import { nip19, type NostrEvent } from "nostr-tools";
import { naddrFor, toNevent, toNpub } from "./desks";

/**
 * The origin a published paper links to. Fixed, not the page's own: a paper is published to
 * the reader's public Observer site and downloaded, and its links must lead to Brainstorm's
 * production pages from wherever it is read (a print on staging or a dev server included).
 */
export const PAPER_LINK_ORIGIN = "https://brainstorm.world";

/** What an encoded citation decodes to. */
export type CitedEntity =
  { type: "nevent" | "note"; id: string } | { type: "naddr"; kind: number; pubkey: string; identifier: string };

const TAIL = "(?:[/?#].*)?$";
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

/** One app's two link bases, and the forms the paper may carry on them. */
export interface PaperLinkSet {
  citeBase: string;
  profileBase: string;
  /** The writer's citation of `eventId`: what the brief tells it to write. */
  writerCitation(eventId: string): string;
  /** The page's citation of `event`: its naddr when it is addressable and its address encodes, else its nevent. */
  citation(event: NostrEvent): string;
  /** The page's byline link to `pubkey`: their npub. */
  profile(pubkey: string): string;
  /** The event id of a writer's `<citeBase><64-hex>`, or null. */
  writerCited(href: string): string | null;
  /** The decoded entity of an encoded citation (`<citeBase>nevent1…`, `naddr1…`, `note1…`), or null. */
  cited(href: string): CitedEntity | null;
  /** The hex a writer's `<profileBase><64-hex>` names (a post's id, or leniently a pubkey), or null. */
  writerProfile(href: string): string | null;
  /** The pubkey of an encoded byline link (`<profileBase>npub1…`), or null. */
  profiled(href: string): string | null;
  /** `nostr:<bech32>` for a link in one of this set's encoded forms, decoded and of the right entity; else null. */
  toNostrUri(url: string): string | null;
}

function decodeCited(bech32: string): CitedEntity | null {
  try {
    const decoded = nip19.decode(bech32.toLowerCase());
    if (decoded.type === "nevent") return { type: "nevent", id: decoded.data.id.toLowerCase() };
    if (decoded.type === "note") return { type: "note", id: decoded.data.toLowerCase() };
    if (decoded.type === "naddr") {
      return {
        type: "naddr",
        kind: decoded.data.kind,
        pubkey: decoded.data.pubkey.toLowerCase(),
        identifier: decoded.data.identifier,
      };
    }
    return null;
  } catch {
    return null;
  }
}

function decodeNpub(bech32: string): string | null {
  try {
    const decoded = nip19.decode(bech32.toLowerCase());
    return decoded.type === "npub" ? decoded.data.toLowerCase() : null;
  } catch {
    return null;
  }
}

/** An addressable event's naddr: kinds 30000-39999 with a `d` tag that encodes (at most 255 bytes); else null. */
export function addressOf(event: NostrEvent): string | null {
  if (event.kind < 30_000 || event.kind > 39_999) return null;
  return naddrFor(event);
}

export function paperLinkSet(citeBase: string, profileBase: string): PaperLinkSet {
  const cite = escape(citeBase);
  const people = escape(profileBase);
  const citeHex = new RegExp(`^${cite}([0-9a-fA-F]{64})${TAIL}`);
  const citeBech32 = new RegExp(`^${cite}((?:nevent1|naddr1|note1)[0-9a-zA-Z]+)${TAIL}`, "i");
  const profileHex = new RegExp(`^${people}([0-9a-fA-F]{64})${TAIL}`);
  const profileNpub = new RegExp(`^${people}(npub1[0-9a-zA-Z]+)${TAIL}`, "i");
  return {
    citeBase,
    profileBase,
    writerCitation: (eventId) => citeBase + eventId.toLowerCase(),
    citation: (event) => citeBase + (addressOf(event) ?? toNevent(event.id)),
    profile: (pubkey) => profileBase + toNpub(pubkey),
    writerCited: (href) => citeHex.exec(href)?.[1]?.toLowerCase() ?? null,
    cited: (href) => {
      const found = citeBech32.exec(href);
      return found ? decodeCited(found[1]) : null;
    },
    writerProfile: (href) => profileHex.exec(href)?.[1]?.toLowerCase() ?? null,
    profiled: (href) => {
      const found = profileNpub.exec(href);
      return found ? decodeNpub(found[1]) : null;
    },
    toNostrUri: (url) => {
      const trimmed = url.trim();
      const cited = citeBech32.exec(trimmed);
      if (cited) return decodeCited(cited[1]) ? `nostr:${cited[1].toLowerCase()}` : null;
      const person = profileNpub.exec(trimmed);
      if (person) return decodeNpub(person[1]) ? `nostr:${person[1].toLowerCase()}` : null;
      return null;
    },
  };
}

/** Brainstorm's: its own event page (`/e/`, nevent and naddr) and profile page (`/p/`, npub). */
export const BRAINSTORM_LINKS = paperLinkSet(`${PAPER_LINK_ORIGIN}/e/`, `${PAPER_LINK_ORIGIN}/p/`);

/**
 * Jumble's, the forms the writer was told before the brief named the app's bases. Still read
 * from the writer for compatibility (a model that remembers them, a cached prompt) and
 * rewritten into the app's own; never accepted on a checked page.
 */
export const LEGACY_JUMBLE_LINKS = paperLinkSet("https://jumble.social/notes/", "https://jumble.social/users/");

/** The writer's message line naming the app's link bases. */
export function linksLine(links: PaperLinkSet): string {
  return `Links: citations ${links.citeBase}<id>, people ${links.profileBase}<id>`;
}
