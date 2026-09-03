/**
 * Endorsements — Nostr's reviews of apps and people, ordered by the web of
 * trust.
 *
 * Nostr has no star rating (probed 2026-09-03: 0 of 845 app comments carry
 * one), so the Google "shared endorsement" beat — a friend's name, photo and
 * verdict attached to a result — is rendered here as name + tier ring +
 * quote, and WHO is speaking decides the order: people you follow (a fact
 * from your own kind-3), then verified accounts (house trust score above the
 * verified line), then everyone else. The relay's observer lens is a set
 * filter, not a ranker, so this ordering is done on-device where it can be
 * labeled honestly.
 */
import { compactCount } from "@/lib/compactCount";
import { apiClient } from "@/services/api";
import {
  fetchAppEndorsementCounts,
  fetchAppReviews,
  fetchAppZaps,
  fetchPersonVouches,
  type AppReview,
  type AppZap,
  type PersonVouch,
} from "@/services/search";

export interface PersonEndorsements {
  /** The most trusted accounts following this person, with each one's score. */
  followedBy: { pubkey: string; score01: number | null }[];
  /** How many verified accounts follow them in all; null when unknown. */
  total: number | null;
  /** Trust reviews about them (Relay Outpost vouches), newest first. */
  vouches: PersonVouch[];
}

export type RankedVouch = PersonVouch & { score: number | null; group: EndorserGroup };

/**
 * Trust reviews in the one order: the reviewer's standing with the viewer
 * (you follow → verified → other), score, recency. Same rule as app reviews.
 */
export function rankVouches(vouches: PersonVouch[], ctx: RankContext): RankedVouch[] {
  const by = new Map(rankEndorsers(vouches, ctx).map((r) => [r.pubkey, r]));
  return vouches
    .map((v) => ({ ...v, score: by.get(v.pubkey)?.score ?? null, group: by.get(v.pubkey)?.group ?? ("other" as EndorserGroup) }))
    .sort((a, b) => GROUP_ORDER[a.group] - GROUP_ORDER[b.group] || (b.score ?? -1) - (a.score ?? -1) || b.at - a.at);
}

/**
 * Identity is a CLAIM by its author ("I personally know this is really
 * them") and the prose can contradict it — live, "this mf is a fake" was
 * filed as identity. So a confirmation only counts from someone you follow
 * or a verified account, and its words travel with it so a reader can judge.
 */
export function identityConfirmers(ranked: RankedVouch[]): RankedVouch[] {
  return ranked.filter((v) => v.type === "identity" && v.group !== "other");
}

/**
 * A person's endorsements are their followers — Nostr's oldest review. Follows
 * are not indexed on the search relay (probed), so this is our own server's
 * connections endpoint: the house Perspective for a stable public line, the
 * viewer's own when they look through My perspective. Never rejects.
 */
export async function fetchPersonEndorsements(pubkey: string, opts: { personal: boolean }): Promise<PersonEndorsements> {
  const [followersRes, vouchesRes] = await Promise.allSettled([
    apiClient.getUserConnections(pubkey, "followed_by", {
      limit: 8,
      order: "desc",
      verified_only: true,
      with_total: true,
      house: !opts.personal,
    }) as Promise<{ data?: { items?: Array<string | { pubkey?: string; influence?: number | null }>; total?: unknown } } | null>,
    fetchPersonVouches(pubkey),
  ]);
  const res = followersRes.status === "fulfilled" ? followersRes.value : null;
  const items = res?.data?.items ?? [];
  const followedBy = items
    .map((e) =>
      typeof e === "string"
        ? { pubkey: e, score01: null }
        : { pubkey: e?.pubkey ?? "", score01: typeof e?.influence === "number" ? e.influence : null },
    )
    .filter((e) => !!e.pubkey);
  const total = typeof res?.data?.total === "number" ? res.data.total : null;
  const vouches = vouchesRes.status === "fulfilled" ? vouchesRes.value : [];
  return { followedBy, total, vouches };
}
import { DEFAULT_VERIFIED_LINE, TIER_THRESHOLDS } from "@/services/trustThreshold";

export interface AppEndorsements {
  address: string;
  /** Top-level reviews by people other than the publisher, newest first. */
  reviews: AppReview[];
  /** How many reviews exist — the COUNT, or what we hold if that is more. */
  reviewCount: number;
  zaps: AppZap[];
  /** Zaps seen on the search relay (a floor: the Zap Store relay has no COUNT). */
  zapCount: number;
  /** Curated app collections (kind 30267) that feature the app. */
  collectionCount: number;
}

const APP_KIND = "32267";

/**
 * Everything the network has said about an app, in one tolerant fetch: any
 * primitive failing reads as zero, the promise never rejects. `reviewLimit`
 * / `zapLimit` of 0 skip that page entirely — a results card wants faces and
 * numbers (small review page, no zaps), the rail wants numbers only.
 */
export async function fetchAppEndorsements(
  address: string,
  opts: { publisher: string; reviewLimit?: number; zapLimit?: number },
): Promise<AppEndorsements> {
  const { publisher, reviewLimit = 50, zapLimit = 50 } = opts;
  const [reviewsRes, zapsRes, countsRes] = await Promise.allSettled([
    reviewLimit > 0 ? fetchAppReviews(address, { limit: reviewLimit }) : Promise.resolve([] as AppReview[]),
    zapLimit > 0 ? fetchAppZaps(address, { limit: zapLimit }) : Promise.resolve([] as AppZap[]),
    fetchAppEndorsementCounts(address),
  ]);
  const held = reviewsRes.status === "fulfilled" ? reviewsRes.value : [];
  // The publisher answering reviewers is conversation, not endorsement; a
  // reply to a review (k names the review's kind) is a review of the review.
  const reviews = held.filter((r) => r.pubkey !== publisher && (r.k == null || r.k === APP_KIND));
  const zaps = zapsRes.status === "fulfilled" ? zapsRes.value : [];
  const counts = countsRes.status === "fulfilled" ? countsRes.value : { reviews: 0, zaps: 0, collections: 0 };
  return {
    address,
    reviews,
    reviewCount: Math.max(counts.reviews, reviews.length),
    zaps,
    zapCount: Math.max(counts.zaps, zaps.length),
    collectionCount: counts.collections,
  };
}

export type EndorserGroup = "followed" | "verified" | "other";

export interface Endorser {
  pubkey: string;
  /** When they last endorsed (unix seconds). */
  at: number;
  score: number | null;
  group: EndorserGroup;
}

export interface RankContext {
  /** The viewer's own follows (empty when signed out). */
  follows: ReadonlySet<string>;
  /** House trust score per pubkey; null/undefined = unrated. */
  scoreOf: (pk: string) => number | null | undefined;
  verifiedLine?: number;
}

const GROUP_ORDER: Record<EndorserGroup, number> = { followed: 0, verified: 1, other: 2 };

/**
 * One rule everywhere: dedupe by person (latest endorsement wins), group by
 * relationship to the viewer, score descending inside a group, recency last.
 */
export function rankEndorsers(items: { pubkey: string; at: number }[], ctx: RankContext): Endorser[] {
  const line = ctx.verifiedLine ?? DEFAULT_VERIFIED_LINE;
  const latest = new Map<string, number>();
  for (const it of items) {
    if (!it.pubkey) continue;
    latest.set(it.pubkey, Math.max(latest.get(it.pubkey) ?? 0, it.at));
  }
  const ranked: Endorser[] = [...latest.entries()].map(([pubkey, at]) => {
    const raw = ctx.scoreOf(pubkey);
    const score = typeof raw === "number" && Number.isFinite(raw) ? raw : null;
    const group: EndorserGroup = ctx.follows.has(pubkey) ? "followed" : score != null && score >= line ? "verified" : "other";
    return { pubkey, at, score, group };
  });
  return ranked.sort(
    (a, b) => GROUP_ORDER[a.group] - GROUP_ORDER[b.group] || (b.score ?? -1) - (a.score ?? -1) || b.at - a.at,
  );
}

/**
 * "Reviewed by Vitor & 13 others" — names up to two people, counts the rest;
 * with no names resolved it counts people, compacting big numbers.
 */
const NAME_MAX = 24;

/** Names as people actually write them: newlines collapsed, long ones cut. */
export function tidyName(name: string): string {
  const clean = name.replace(/\s+/g, " ").trim();
  return clean.length > NAME_MAX ? clean.slice(0, NAME_MAX - 1).trimEnd() + "…" : clean;
}

export function endorsementLabel(verb: string, names: string[], total: number): string {
  const lead = names.map(tidyName).filter(Boolean).slice(0, 2);
  const others = Math.max(0, total - lead.length);
  if (lead.length === 0) return `${verb} by ${compactCount(total)} ${total === 1 ? "person" : "people"}`;
  if (others === 0) return `${verb} by ${lead.join(" & ")}`;
  return `${verb} by ${lead.join(", ")} & ${compactCount(others)} ${others === 1 ? "other" : "others"}`;
}

/**
 * Which follow-set badges a person earns. A list title is only as good as who
 * published it: a badge stays when at least two accounts published a list
 * with that title (corroboration), or when a single publisher sits in the
 * top trust tier (a curator the network trusts highly). One merely-verified
 * account's private list names ("Plebs", "pleb 2") are not a credential.
 */
export function visiblePersonSets<T extends { exporters: number; exporterPubkeys: string[] }>(
  sets: T[],
  ctx: { scoreOf: (pk: string) => number | null | undefined; curatorLine?: number; max?: number },
): T[] {
  const line = ctx.curatorLine ?? TIER_THRESHOLDS.high;
  return sets
    .filter((s) => s.exporters >= 2 || s.exporterPubkeys.some((pk) => (ctx.scoreOf(pk) ?? -1) >= line))
    .slice(0, ctx.max ?? 3);
}

/**
 * The person page's collapsed reviews line, in words anyone follows: how many
 * reviews, and how many come from accounts the reader can trust. "You
 * follow" outranks "verified" when both apply; with neither, just the count.
 */
export function reviewsSummaryLabel({ total, followed, verified }: { total: number; followed: number; verified: number }): string {
  const reviews = `${compactCount(total)} ${total === 1 ? "review" : "reviews"}`;
  const part = (n: number, one: string, many: string) => (n === 1 ? `1 from ${one}` : `${compactCount(n)} from ${many}`);
  const who =
    followed > 0
      ? part(followed, "someone you follow", "people you follow")
      : verified > 0
        ? part(verified, "a verified account", "verified accounts")
        : null;
  if (!who) return reviews;
  // One review from one trusted source reads as a sentence, not a tally.
  if (total === 1) return `${reviews} ${who.replace(/^1 /, "")}`;
  return `${reviews} · ${who}`;
}

/**
 * The quotable part of a review: whitespace collapsed, whole when short,
 * otherwise its first sentence — and a hard cut with an ellipsis when the
 * prose never pauses. A review with no words in it ("👍", "100") yields
 * nothing: an emoji is an endorsement, not a quote.
 */
export function quoteFor(text: string, max = 90): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!/\p{L}/u.test(clean)) return "";
  if (clean.length <= max) return clean;
  const sentence = clean.match(/^.*?[.!?](?=\s|$)/);
  if (sentence && sentence[0].length <= max) return sentence[0];
  return clean.slice(0, max - 1).trimEnd() + "…";
}
