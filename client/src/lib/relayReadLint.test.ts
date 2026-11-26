// @vitest-environment node
/**
 * The lint guard that keeps relay reads out of react-query (eslint.config.js).
 * A selector that stops matching fails silently, so it is pinned here against
 * code it must flag and code it must leave alone.
 */
import { describe, expect, it } from "vitest";
import { ESLint } from "eslint";
import { readFileSync } from "node:fs";
import { join } from "node:path";
// @ts-expect-error -- the root config is plain JavaScript, with no types
import { DEFERRED_STORE_READS, relayFetchers, relayReadsOnly } from "../../../eslint.config.js";

const SRC = join(__dirname, "..");

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

/**
 * Outside react-query too (docs/adr/0005): in components/ and hooks/, a relay
 * fetcher is called only as a store read's ask. In an effect, an event handler
 * or a plain call its answer becomes component state beside the store.
 */
describe("relay reads outside a store ask, in components and hooks", () => {
  const inComponents = async (code: string) => {
    const [result] = await eslint.lintText(code, { filePath: "client/src/components/__relayReadLint__.tsx" });
    return result.messages.filter((m) => m.ruleId === "no-restricted-syntax").length;
  };

  it("flags a fetcher in an effect, an event handler and a plain call", async () => {
    const code = `
      import { useEffect, useState } from "react";
      import { fetchSpecsForKind } from "@/services/search";
      export function Specs({ kind }: { kind: number }) {
        const [n, setN] = useState(0);
        useEffect(() => { void fetchSpecsForKind(kind).then((s) => setN(s.length)); }, [kind]);
        const again = () => void fetchSpecsForKind(kind).then((s) => setN(s.length));
        return <button onClick={() => void fetchSpecsForKind(kind)}>{n}{String(again)}</button>;
      }`;
    expect(await inComponents(code)).toBe(3);
  });

  it("leaves a fetcher alone as the ask of useStoreEvents, askOnce or askAnswer", async () => {
    const code = `
      import { useStoreEvents } from "@/hooks/useStoreEvents";
      import { askAnswer, askOnce } from "@/lib/askOnce";
      import { fetchSpecsForKind } from "@/services/search";
      export function useSpecs(kind: number) {
        void askOnce("k", { minMs: 1 }, () => fetchSpecsForKind(kind));
        void askAnswer("k", { minMs: 1 }, async () => (await fetchSpecsForKind(kind)).length);
        return useStoreEvents("specs", null, () => fetchSpecsForKind(kind)).events;
      }`;
    expect(await inComponents(code)).toBe(0);
  });

  it("leaves a write alone, whatever it reads first", async () => {
    const code = `
      import { followUser } from "@/services/socialActions";
      export function Follow({ pk }: { pk: string }) {
        return <button onClick={() => void followUser(pk)}>Follow</button>;
      }`;
    expect(await inComponents(code)).toBe(0);
  });

  it("takes a relay probe at its word", async () => {
    const code = `
      import { fetchSpecsForKind } from "@/services/search";
      export function probe(kind: number) {
        // eslint-disable-next-line no-restricted-syntax -- relay probe: is it there right now
        return fetchSpecsForKind(kind);
      }`;
    expect(await inComponents(code)).toBe(0);
  });

  it("knows the writes from the reads", () => {
    const reads = new Set<string>(relayReadsOnly());
    for (const name of ["fetchSpecsForKind", "fetchGitStatuses", "fetchProfileMap", "searchStream"])
      expect(reads, name).toContain(name);
    for (const name of ["followUser", "publishProfile", "publishInboxRelays"]) expect(reads, name).not.toContain(name);
  });

  // Each deferred file still reads outside the store: the list shrinks as they move, never goes stale.
  it("defers only files that still read outside the store", async () => {
    for (const file of Object.values(DEFERRED_STORE_READS as Record<string, string[]>).flat()) {
      const code = readFileSync(join(SRC, file), "utf8");
      const [result] = await eslint.lintText(code, { filePath: "client/src/components/__deferredRead__.tsx" });
      const flagged = result.messages.filter((m) => m.message.includes("call a relay fetcher"));
      expect(flagged.length, file).toBeGreaterThan(0);
    }
  }, 60_000);
});
