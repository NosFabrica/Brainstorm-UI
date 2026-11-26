// @vitest-environment node
/**
 * The lint guard that keeps relay reads out of react-query (eslint.config.js).
 * A selector that stops matching fails silently, so it is pinned here against
 * code it must flag and code it must leave alone.
 */
import { describe, expect, it } from "vitest";
import { ESLint } from "eslint";
// @ts-expect-error -- the root config is plain JavaScript, with no types
import { relayFetchers } from "../../../eslint.config.js";

const eslint = new ESLint();

async function restricted(code: string): Promise<number> {
  const [result] = await eslint.lintText(code, { filePath: "client/src/__relayReadLint__.tsx" });
  return result.messages.filter((m) => m.ruleId === "no-restricted-syntax").length;
}

describe("relay reads in react-query", () => {
  it("flags a relay fetcher inside a useQuery queryFn", async () => {
    const code = `
      import { useQuery } from "@tanstack/react-query";
      import { fetchEventsByFilter } from "@/services/nostr";
      export function useNotes(pk: string) {
        return useQuery({ queryKey: ["n", pk], queryFn: () => fetchEventsByFilter({ authors: [pk] }) });
      }`;
    expect(await restricted(code)).toBe(1);
  });

  it("flags one nested in an async queryFn passed to prefetchQuery", async () => {
    const code = `
      import { queryClient } from "@/lib/queryClient";
      import { fetchContactList } from "@/services/socialActions";
      export function warm(pk: string) {
        void queryClient.prefetchQuery({ queryKey: ["c", pk], queryFn: async () => { const c = await fetchContactList(pk); return c; } });
      }`;
    expect(await restricted(code)).toBe(1);
  });

  it("leaves an HTTP queryFn alone", async () => {
    const code = `
      import { useQuery } from "@tanstack/react-query";
      import { apiClient } from "@/services/api";
      export function useOverview(pk: string) {
        return useQuery({ queryKey: ["o", pk], queryFn: () => apiClient.getUserOverview(pk) });
      }`;
    expect(await restricted(code)).toBe(0);
  });
});

/**
 * A wrapper around a relay fetcher is a relay read too. The rule's list was a
 * hand-kept allowlist, and every wrapper slipped past it (an item's reactions,
 * a concept's items, a lens's ranks); it is now grown from the primitives.
 */
describe("wrappers around relay reads", () => {
  it("are found however many hops down, in services and lib", () => {
    const found = new Set<string>(relayFetchers());
    for (const name of [
      "fetchTownEvents",
      "fetchAreaEvents",
      "fetchAppsByAddress",
      "fetchItemReactions",
      "fetchItemsReactions",
      "readPlaceReviewEvents",
      "readBookReviewEvents",
      "loadConceptItems",
      "loadDictionary",
      "readAuthorRanks",
      "readLensRanks",
      "readTemplateEvents",
    ])
      expect(found, name).toContain(name);
    // Pure derivations and the HTTP API are not.
    for (const name of ["endorsersOf", "githubClaimantsOf", "standingReviews", "getUserOverview"])
      expect(found, name).not.toContain(name);
  });

  it("are flagged inside a queryFn", async () => {
    const code = `
      import { useQuery } from "@tanstack/react-query";
      import { fetchItemReactions } from "@/services/itemEngagement";
      export function useReactions(item: { id: string; kind: number; pubkey: string; tags: string[][] }) {
        return useQuery({ queryKey: ["r", item.id], queryFn: () => fetchItemReactions(item) });
      }`;
    expect(await restricted(code)).toBe(1);
  });
});
