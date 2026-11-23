/**
 * The Brainstorm API's per-person reads, as react-query options shared by every
 * surface that shows them.
 *
 * `/user/{pk}/overview` used to sit in the cache under eight keys (the share
 * page's own, its house-influence twin, the article and note author rings, the
 * account menu, Insights, the profile page, the mention confirm), so the same
 * answer was fetched once per surface — and twice on an anonymous `/p/:id`,
 * where the "viewer" read and the house read are the same URL. One key per
 * (person, perspective) means a hover's prefetch, a page and the next page all
 * read one entry.
 *
 * The perspective is in the key as the read actually goes out: a viewer read
 * with no Account is the anonymous read, which IS the house's, so both resolve
 * to "house" and share. Switching Accounts clears the whole cache
 * (accounts/login-flow), so a resolved key never outlives the Account it was
 * resolved for.
 *
 * The data is the server's envelope as returned; callers that want only part of
 * it `select` it (`selectOverview`, `selectInfluence`), which keeps one entry
 * whatever each reads.
 */
import { queryOptions } from "@tanstack/react-query";
import { activeAccount } from "@/accounts/signing";
import { apiClient } from "@/services/api";

/**
 * Whose perspective a read asks through. "viewer" is the signed-in reader's
 * own (the server reads it off the session); "house" is Brainstorm's,
 * unauthenticated and the same for everyone.
 */
export type Pov = "house" | "viewer";

/** The perspective the request will really be made from. */
export function resolvePov(pov: Pov): Pov {
  return pov === "viewer" && activeAccount() ? "viewer" : "house";
}

/** Per-person reads move only when a calculation runs or the preset changes, and both invalidate. */
const PERSON_READ_STALE_MS = 5 * 60_000;

export const OVERVIEW_BASE = "/user/overview";
export const STATS_BASE = "/user/stats";
export const HISTORY_BASE = "/user/history";
export const TOP_FOLLOWERS_BASE = "/user/top-followers";
export const SETUP_ROWS_BASE = "/setup";

// The API answers `any`; naming it once keeps the factories honest about it.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Envelope = any;

export function overviewKey(pubkey: string, pov: Pov) {
  return [OVERVIEW_BASE, pubkey.toLowerCase(), resolvePov(pov)] as const;
}

/** `GET /user/{pk}/overview`: influence, the six relationship counts, the subject's own tier and flag verdicts. */
export function overviewOptions(pubkey: string, pov: Pov) {
  return queryOptions({
    queryKey: overviewKey(pubkey, pov),
    queryFn: ({ queryKey }): Promise<Envelope> => apiClient.getUserOverview(pubkey, { house: queryKey[2] === "house" }),
    enabled: !!pubkey,
    staleTime: PERSON_READ_STALE_MS,
    retry: false,
  });
}

export function statsKey(pubkey: string, pov: Pov) {
  return [STATS_BASE, pubkey.toLowerCase(), resolvePov(pov)] as const;
}

/** `GET /user/{pk}/stats`: verified and total per relationship, with tier counts. */
export function statsOptions(pubkey: string, pov: Pov) {
  return queryOptions({
    queryKey: statsKey(pubkey, pov),
    queryFn: ({ queryKey }): Promise<Envelope> => apiClient.getUserStats(pubkey, { house: queryKey[2] === "house" }),
    enabled: !!pubkey,
    staleTime: PERSON_READ_STALE_MS,
    retry: false,
  });
}

/** The overview object out of its `{ code, message, data }` envelope. */
export const selectOverview = (envelope: Envelope) => envelope?.data ?? null;

/** Stats out of the envelope, likewise. */
export const selectStats = selectOverview;

/** Only the influence (0..1), for a ring or a score: null when the server has none. */
export function selectInfluence(envelope: Envelope): number | null {
  const influence = envelope?.data?.influence;
  return typeof influence === "number" && Number.isFinite(influence) ? influence : null;
}

/**
 * `GET /user/history` — the signed-in reader's own record (`ta_pubkey`, when
 * scores were last calculated). Keyed by whose it is because the server reads
 * that from the session. It changes only when a calculation finishes or the
 * Assistant is created, and both write or invalidate it, so it never goes
 * stale on a timer.
 */
export function historyKey(pubkey: string | undefined) {
  return [HISTORY_BASE, pubkey] as const;
}
export function historyOptions(pubkey: string | undefined) {
  return queryOptions({
    queryKey: historyKey(pubkey),
    queryFn: (): Promise<Envelope> => apiClient.getUserHistory(),
    staleTime: Infinity,
  });
}

export interface TopFollower {
  pubkey: string;
  /** The follower's own influence — a ring for free. */
  influence: number | null;
}
export interface TopFollowers {
  items: TopFollower[];
  /** How many verified accounts follow them in all; null when the server didn't say. */
  total: number | null;
}

export function topFollowersKey(pubkey: string, pov: Pov) {
  return [TOP_FOLLOWERS_BASE, pubkey.toLowerCase(), resolvePov(pov)] as const;
}

/**
 * The eight most trusted verified accounts following someone, and how many
 * verified followers they have in all. The share page's "Followed by" row and
 * the endorsements line (services/endorsements) both draw it, so it is asked
 * once with the total rather than twice, once without.
 */
export function topFollowersOptions(pubkey: string, pov: Pov) {
  return queryOptions({
    queryKey: topFollowersKey(pubkey, pov),
    queryFn: async ({ queryKey }): Promise<TopFollowers> => {
      const res = (await apiClient.getUserConnections(pubkey, "followed_by", {
        limit: 8,
        order: "desc",
        verified_only: true,
        with_total: true,
        house: queryKey[2] === "house",
      })) as {
        data?: { items?: Array<string | { pubkey?: string; influence?: number | null }>; total?: unknown };
      } | null;
      const items = (res?.data?.items ?? [])
        .map((e) =>
          typeof e === "string"
            ? { pubkey: e, influence: null }
            : { pubkey: e?.pubkey ?? "", influence: typeof e?.influence === "number" ? e.influence : null },
        )
        .filter((e) => !!e.pubkey);
      const total = typeof res?.data?.total === "number" ? res.data.total : null;
      return { items, total };
    },
    enabled: !!pubkey,
    staleTime: PERSON_READ_STALE_MS,
    retry: false,
  });
}

/**
 * `GET /setup/{pk}`: the rows the server would have someone's Treasure Map
 * hold, and who signs their Trusted Lists. Read for the signed-in reader by
 * their Assistants page (the duties on offer) and by the lists check
 * (services/trustLists); one entry serves both.
 */
export function setupRowsOptions(pubkey: string) {
  return queryOptions({
    queryKey: [SETUP_ROWS_BASE, pubkey.toLowerCase()] as const,
    queryFn: () => apiClient.getSetupRows(pubkey),
    enabled: !!pubkey,
    staleTime: 10 * 60_000,
    retry: false,
  });
}
