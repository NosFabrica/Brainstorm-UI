// @vitest-environment jsdom
/**
 * URL templates render from the EventStore while the relays are asked
 * (docs/adr/0005): a definition's pinned templates by id, and the link
 * picker's choices — the items of the reader's governing URL Templates list —
 * which take in a template published later.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { NostrEvent } from "nostr-tools";
import { eventStore } from "@/lib/eventStore";
import { __resetAsks } from "@/lib/askOnce";
import { queryWrapper } from "@/test/utils";

const CURATOR = "a".repeat(64);
const TEMPLATES = `39998:${CURATOR}:url-templates`;
const io = vi.hoisted(() => ({
  templates: vi.fn(async (): Promise<unknown[]> => []),
  headers: vi.fn(async (): Promise<unknown[]> => []),
  items: vi.fn(async (): Promise<unknown[]> => []),
}));
vi.mock("@/config/dictionary", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/config/dictionary")>()),
  URL_TEMPLATES_CONCEPT: `39998:${"a".repeat(64)}:url-templates`,
}));
vi.mock("@/hooks/useDictionaryReader", () => ({
  useDictionaryReader: () => ({ pubkey: null, taPubkey: null, settled: true }),
}));
vi.mock("@/hooks/draftTemplates", () => ({ useDraftTemplates: () => new Map() }));
vi.mock("@/lib/houseObserverQuery", () => ({
  houseObserverQuery: { queryKey: ["house-observer"], queryFn: async () => "0".repeat(64), staleTime: Infinity },
}));
vi.mock("@/services/trustAnchor", () => ({ askTrustProviderList: async () => undefined }));
vi.mock("@/services/linkTemplates", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/linkTemplates")>()),
  readTemplateEvents: () => io.templates(),
}));
vi.mock("@/services/dictionary", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/dictionary")>()),
  readDictionaryHeaders: () => io.headers(),
  loadConceptItems: () => io.items(),
}));

import { useAvailableTemplates, useLinkTemplates } from "./useLinkTemplates";

const realVerify = eventStore.verifyEvent;
beforeAll(() => {
  eventStore.verifyEvent = undefined;
});
afterAll(() => {
  eventStore.verifyEvent = realVerify;
});
beforeEach(() => __resetAsks());

let n = 0;
const template = (name: string, created_at = 100 + n) =>
  ({
    id: (++n).toString(16).padStart(64, "0"),
    kind: 39999,
    pubkey: "b".repeat(64),
    created_at,
    content: "",
    sig: "s",
    tags: [
      ["d", name],
      ["z", TEMPLATES],
      ["name", name],
      ["url-template", `https://example.com/${name}/{id}`],
    ],
  }) as NostrEvent;

describe("useLinkTemplates", () => {
  it("answers the pinned templates from the store, once the ask has", async () => {
    const pinned = template("repo");
    io.templates.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 5));
      return [eventStore.add(pinned)];
    });
    const refs = [{ templateId: pinned.id, relay: "", bindings: [] }];
    const { result } = renderHook(() => useLinkTemplates(refs));
    expect(result.current.isPending).toBe(true);
    await waitFor(() => expect(result.current.data?.get(pinned.id)?.name).toBe("repo"));
  });
});

describe("useAvailableTemplates", () => {
  it("offers the governing list's templates, and one published later", async () => {
    const first = template("issues");
    io.items.mockImplementation(async () => [eventStore.add(first)]);
    const { result } = renderHook(() => useAvailableTemplates(), { wrapper: queryWrapper() });
    await waitFor(() => expect(result.current.data?.map((t) => t.name)).toEqual(["issues"]));
    act(() => {
      eventStore.add(template("wiki", 999));
    });
    await waitFor(() => expect(result.current.data?.map((t) => t.name)).toEqual(["wiki", "issues"]));
  });
});
