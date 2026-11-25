/**
 * A NIP-53 live event (kind 30311) read for a viewer: what it is called, its
 * poster, whether it is live, where the video is, how many are watching.
 *
 * Platform-hosted streams (Shosho, zap.stream) are authored by the platform
 * and name the streamer in a `p` tag with the "host" role, so the streamer
 * can be neither the author nor the only participant; callers fetch by both
 * shapes and this only reads the event.
 */
import { schnorr } from "@noble/curves/secp256k1.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { hexToBytes, utf8ToBytes } from "@noble/hashes/utils.js";

type EventLike = { id: string; pubkey: string; kind: number; created_at: number; tags: string[][]; content: string };

export interface LiveStream {
  id: string;
  pubkey: string;
  d: string;
  title: string;
  image?: string;
  /** Verbatim: `live`, `planned`, `ended` — NIP-53's set, kept open. */
  status: string;
  startsSec: number;
  streaming?: string;
  /** Where the stream can be watched after it ended, when the platform kept one. */
  recording?: string;
  viewers?: number;
  createdAt: number;
}

export function parseLiveStream(ev: EventLike): LiveStream | null {
  if (ev.kind !== 30311) return null;
  const tag = (k: string) => ev.tags.find((t) => t[0] === k)?.[1]?.trim() || undefined;
  const viewers = Number(tag("current_participants"));
  return {
    id: ev.id,
    pubkey: ev.pubkey,
    d: tag("d") ?? "",
    title: tag("title") || tag("summary") || "Live stream",
    image: tag("image"),
    status: (tag("status") || "").toLowerCase(),
    startsSec: Number(tag("starts")) || 0,
    streaming: tag("streaming"),
    recording: isWebUrl(tag("recording")) ? tag("recording") : undefined,
    viewers: Number.isFinite(viewers) && viewers >= 0 && tag("current_participants") ? viewers : undefined,
    createdAt: ev.created_at,
  };
}

export interface PickedStreams {
  /** On air now (newest if several). */
  live: LiveStream | null;
  /** Announced and not yet started — the soonest. */
  upcoming: LiveStream | null;
  /** The newest ended stream that left a recording. Ended without one is nothing to show. */
  replay: LiveStream | null;
}

/**
 * What a person's streams give a viewer something to do with. An ended stream
 * with no recording is deliberately absent: probed 2026-09-04, a third of
 * ended streams carry a `recording`, and advertising the rest sends people to
 * "This stream has ended".
 */
export function pickStreams(events: EventLike[], nowSec = Math.floor(Date.now() / 1000)): PickedStreams {
  // The shelf each stream is on comes from liveStateOf — the Live tab's rule —
  // so a "live" nobody updated for months is not live here either.
  const parsed = events
    .map((ev) => ({ stream: parseLiveStream(ev), state: liveStateOf(ev, nowSec) }))
    .filter((x): x is { stream: LiveStream; state: LiveState | null } => x.stream !== null);
  const newestFirst = [...parsed].sort(
    (a, b) => Math.max(b.stream.startsSec, b.stream.createdAt) - Math.max(a.stream.startsSec, a.stream.createdAt),
  );
  const upcoming =
    parsed.filter((x) => x.state === "upcoming").sort((a, b) => a.stream.startsSec - b.stream.startsSec)[0]?.stream ??
    null;
  return {
    live: newestFirst.find((x) => x.state === "live")?.stream ?? null,
    upcoming,
    replay: newestFirst.find((x) => x.state === "replay")?.stream ?? null,
  };
}

/**
 * A web address, the only kind of link a recording or a replay button may be.
 * Local until cluster C's lib/safeHref lands; then this is `safeHref`.
 */
export function isWebUrl(url: string | undefined | null): url is string {
  const u = url?.trim().toLowerCase() ?? "";
  return u.startsWith("https://") || u.startsWith("http://");
}

/** Test seam: kept for callers' tests; there is nothing cached any more. */
export function __resetRecordingChecks() {}

/**
 * Whether a recording is one to offer: a web address. Odell's year-old replay
 * pointed at a host that no longer exists, and this used to HEAD every
 * recording from the reader's browser to find out. That is a third-party call
 * from the reader (ADR 0007: those go through our origin, and never during
 * search or in a card), and our origin has no probe for it. So nothing is
 * asked: a recording that no longer answers shows when the player fails to
 * play it. Kept a promise so its callers need no change.
 */
export function verifyRecording(url: string): Promise<boolean> {
  return Promise.resolve(isWebUrl(url));
}

export type LiveState = "live" | "upcoming" | "replay";

/** A "live" event untouched this long is stale. */
export const LIVE_STALE_AFTER_SEC = 7 * 86_400;
/** From this age on, a "live" event must prove its stream still answers. */
export const LIVE_CHECK_AFTER_SEC = 86_400;

/**
 * The stream URL a "live" event must prove before it shows — when the event is
 * a day or more old with no viewer count to vouch for it (probed 2026-09-05:
 * half the two-day-old "live" manifests return 404, every fresh one answers).
 * Fresh events are trusted; so are ones nobody can HEAD (LiveKit rooms,
 * platform pages). Null when there is nothing to prove.
 */
export function liveNeedsCheck(ev: EventLike, nowSec = Math.floor(Date.now() / 1000)): string | null {
  const tag = (k: string) => ev.tags.find((t) => t[0] === k)?.[1]?.trim() || undefined;
  const status = (tag("status") || "").toLowerCase();
  if (status !== "live" && status !== "open") return null;
  const age = nowSec - ev.created_at;
  if (age < LIVE_CHECK_AFTER_SEC || age > LIVE_STALE_AFTER_SEC) return null;
  if (Number(tag("current_participants")) > 0) return null;
  const streaming = tag("streaming");
  return streaming && /^https?:\/\//i.test(streaming) ? streaming : null;
}

/**
 * Which shelf a NIP-53 event belongs on — Live, Upcoming, Replays — or none.
 * Probed 2026-09-05 over the 200 newest streams: 97 live, 80 ended (16 with a
 * recording), 0 planned; kind 30313 meetings carry the planned ones; kind
 * 30312 rooms are 8k mostly-closed, untitled machine records. So: live or open
 * is live; ended or closed is a replay only with a recording; planned (or a
 * start still ahead) is upcoming unless it was due more than six hours ago;
 * anything untitled is nothing at all.
 */
export function liveStateOf(ev: EventLike, nowSec = Math.floor(Date.now() / 1000)): LiveState | null {
  if (ev.kind !== 30311 && ev.kind !== 30312 && ev.kind !== 30313) return null;
  const tag = (k: string) => ev.tags.find((t) => t[0] === k)?.[1]?.trim() || undefined;
  if (!liveTitleOf(ev)) return null;
  const status = (tag("status") || "").toLowerCase();
  const starts = Number(tag("starts")) || 0;
  const ends = Number(tag("ends")) || 0;
  const over = isWebUrl(tag("recording")) ? "replay" : null;
  // A space (30312) is open, private or closed: private is in operation too, behind its own door.
  if (status === "live" || status === "open" || (ev.kind === 30312 && status === "private")) {
    // A status nobody updated is not a broadcast: platforms republish a live
    // event as viewers come and go, so one untouched for a week — or one past
    // its own end — is over (Barnoldswick: "live" since 2.4 years ago).
    if ((ends > 0 && ends < nowSec) || nowSec - ev.created_at > LIVE_STALE_AFTER_SEC) return over;
    // And a stream nothing can play is not one either: a streaming URL that
    // is not a web or socket URL (probed 2026-09-05, a QA event's ftp:// with
    // 99999 "viewers" led the grid). An announced stream with no URL yet stays.
    const streaming = tag("streaming");
    if (streaming && !/^(https?|wss?):\/\//i.test(streaming)) return over;
    return "live";
  }
  if (status === "ended" || status === "closed") return over;
  if (status === "planned" || starts > nowSec) return starts === 0 || starts > nowSec - 6 * 3600 ? "upcoming" : null;
  return null;
}

/**
 * How long a stream has been on — "2h 15m" — while that still says something.
 * Half the live streams have been "on" for over a day (radio, Owncast servers
 * that never end): past 24 hours the number is noise, so nothing.
 */
export function onAirLabel(startsSec: number, nowSec = Math.floor(Date.now() / 1000)): string | null {
  if (!startsSec) return null;
  const diff = nowSec - startsSec;
  if (diff < 0 || diff >= 86_400) return null;
  if (diff < 60) return "just started";
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/**
 * The streamer: the `p` tag marked host (platforms publish for their streamers).
 * NIP-53's role is a displayable marker — `Host` in its examples, `host` from
 * zap.stream and Nostrich — so any case is the host. Only a key: a value that is
 * not 64 hex characters names nobody (and would throw in npub encoding).
 */
export function liveHostOf(ev: EventLike): string | null {
  const t = ev.tags.find((t) => t[0] === "p" && t[3]?.trim().toLowerCase() === "host" && HEX64.test(t[1] ?? ""));
  return t ? t[1].toLowerCase() : null;
}

/** Who an event names as its host, and whether they agreed to it. */
export interface LiveHostClaim {
  pubkey: string;
  /**
   * The host is the event's signer, or signed NIP-53's proof for this event's
   * address. Otherwise the signer only says so: anyone can name anyone a host
   * "to lure their followers" (NIP-53), so it reads as unconfirmed.
   */
  confirmed: boolean;
}

/**
 * NIP-53's proof: the participant's Schnorr signature, in hex, over the SHA-256
 * of the event's complete `a` tag (`kind:pubkey:d`). Never throws.
 */
export function verifyLiveProof(
  ev: Pick<EventLike, "kind" | "pubkey" | "tags">,
  participant: string,
  proof: string,
): boolean {
  if (!/^[0-9a-f]{128}$/i.test(proof) || !HEX64.test(participant)) return false;
  const d = ev.tags.find((t) => t[0] === "d")?.[1] ?? "";
  try {
    const message = sha256(utf8ToBytes(`${ev.kind}:${ev.pubkey}:${d}`));
    return schnorr.verify(hexToBytes(proof.toLowerCase()), message, hexToBytes(participant.toLowerCase()));
  } catch {
    return false;
  }
}

/** The host a live event, a space or a meeting names (liveHostOf), and whether it is confirmed. Null when none. */
export function liveHostClaim(ev: EventLike): LiveHostClaim | null {
  const pubkey = liveHostOf(ev);
  if (!pubkey) return null;
  if (pubkey === ev.pubkey.toLowerCase()) return { pubkey, confirmed: true };
  const proof = ev.tags.find(
    (t) => t[0] === "p" && t[1]?.toLowerCase() === pubkey && t[3]?.trim().toLowerCase() === "host",
  )?.[4];
  return { pubkey, confirmed: !!proof && verifyLiveProof(ev, pubkey, proof.trim()) };
}

type TitledEvent = Pick<EventLike, "kind" | "tags">;

/**
 * What a NIP-53 event is called, by its kind: a meeting space (30312) by its
 * `room` ("Required: Display name"), a meeting (30313) by its `title`
 * ("Required: Meeting title"), a stream (30311) by its `title` — or, as the
 * Live tab always read streams, a `name` or its `summary`.
 */
export function liveTitleOf(ev: TitledEvent): string | undefined {
  const tag = (k: string) => ev.tags.find((t) => t[0] === k)?.[1]?.trim() || undefined;
  if (ev.kind === 30312) return tag("room");
  if (ev.kind === 30313) return tag("title");
  return tag("title") || tag("name") || tag("summary");
}

/** A role a NIP-53 `p` tag gives someone: `["p", <pubkey>, <relay>, <role>, <proof>]`. */
export interface LiveParticipant {
  pubkey: string;
  /** As published, a displayable marker: "Host", "Moderator", "Speaker"… */
  role?: string;
  /** NIP-53's proof of agreement: without one, a client MAY show them as invited. */
  proof: boolean;
}

/** A NIP-53 meeting space (30312) or a meeting in one (30313), read for its page and card. */
export interface Meeting {
  kind: 30312 | 30313;
  title: string;
  summary?: string;
  image?: string;
  /** Verbatim, lowercased: a space is open, private or closed; a meeting planned, live or ended. */
  status: string;
  /** 30312: the URL to access the room. Only a web address. */
  service?: string;
  /** 30313: the space it is in, by address (`30312:<pubkey>:<d>`), and where to find it. */
  space?: { kind: number; pubkey: string; identifier: string; relays?: string[] };
  startsSec: number;
  endsSec: number;
  currentParticipants?: number;
  totalParticipants?: number;
  participants: LiveParticipant[];
  hashtags: string[];
}

const HEX64 = /^[0-9a-f]{64}$/i;
const httpUrl = (v: string | undefined) => (v && /^https?:\/\//i.test(v) ? v : undefined);
const count = (v: string | undefined) => {
  const n = Number(v);
  return v && Number.isFinite(n) && n >= 0 ? n : undefined;
};

/** Each `p` with its role, once a person; NIP-53's tag is `["p", pubkey, relay, role, proof]`. */
export function liveParticipantsOf(ev: TitledEvent): LiveParticipant[] {
  const seen = new Map<string, LiveParticipant>();
  for (const t of ev.tags) {
    if (t[0] !== "p" || !HEX64.test(t[1] ?? "")) continue;
    const pubkey = t[1].toLowerCase();
    if (!seen.has(pubkey)) seen.set(pubkey, { pubkey, role: t[3]?.trim() || undefined, proof: !!t[4]?.trim() });
  }
  return [...seen.values()];
}

/** A meeting space or meeting, by NIP-53's tags; null for any other kind or one with no name. */
export function readMeeting(ev: TitledEvent): Meeting | null {
  if (ev.kind !== 30312 && ev.kind !== 30313) return null;
  const tag = (k: string) => ev.tags.find((t) => t[0] === k)?.[1]?.trim() || undefined;
  const title = liveTitleOf(ev);
  if (!title) return null;
  let space: Meeting["space"];
  if (ev.kind === 30313) {
    const a = ev.tags.find((t) => t[0] === "a" && (t[1] ?? "").startsWith("30312:"));
    const [, pubkey, ...rest] = (a?.[1] ?? "").split(":");
    if (a && HEX64.test(pubkey ?? ""))
      space = {
        kind: 30312,
        pubkey: pubkey.toLowerCase(),
        identifier: rest.join(":"),
        relays: /^wss?:\/\//i.test(a[2] ?? "") ? [a[2]] : undefined,
      };
  }
  return {
    kind: ev.kind,
    title,
    summary: tag("summary"),
    image: httpUrl(tag("image")),
    status: (tag("status") || "").toLowerCase(),
    service: ev.kind === 30312 ? httpUrl(tag("service")) : undefined,
    space,
    startsSec: Number(tag("starts")) || 0,
    endsSec: Number(tag("ends")) || 0,
    currentParticipants: count(tag("current_participants")),
    totalParticipants: count(tag("total_participants")),
    participants: liveParticipantsOf(ev),
    hashtags: [...new Set(ev.tags.filter((t) => t[0] === "t" && t[1]?.trim()).map((t) => t[1].trim()))],
  };
}

/** A stream's state in one word, as every surface says it: the Live tab's shelf (liveStateOf), or Ended. */
export function liveStateLabel(state: LiveState | null): "Live" | "Upcoming" | "Replay" | "Ended" {
  return state === "live" ? "Live" : state === "upcoming" ? "Upcoming" : state === "replay" ? "Replay" : "Ended";
}

const GENERIC_LIVE_TAGS = new Set([
  "streaming",
  "stream",
  "livestream",
  "live",
  "owncast",
  "247",
  "24/7",
  "nostr",
  "zap.stream",
  "video",
]);

/** One category worth a word — the first `t` that is not a platform word. */
export function liveCategoryOf(ev: EventLike): string | null {
  for (const t of ev.tags) {
    if (t[0] !== "t" || !t[1]) continue;
    const v = t[1].trim().toLowerCase();
    if (v && !GENERIC_LIVE_TAGS.has(v)) return v;
  }
  return null;
}
