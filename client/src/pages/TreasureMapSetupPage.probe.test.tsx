// @vitest-environment jsdom
/**
 * The page's repair over the real hook, relay read and EventStore, with only
 * the API and the relay pool faked: what it says while the relays a press reads
 * (the check's `writerRelays`) are asked, and while a press it offered for a
 * relay's miss is under way.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Observable } from "rxjs";
import { finalizeEvent, generateSecretKey, getPublicKey, verifyEvent } from "nostr-tools";

const SCORES = "wss://scores.example/";
const OUTBOX = "wss://outbox.example/";

const h = vi.hoisted(() => ({
  getAssistantTreasureMap: vi.fn(),
  setAssistantTreasureMap: vi.fn(),
  held: {} as Record<string, unknown[]>,
  silent: new Set<string>(),
  asked: [] as string[][],
}));
vi.mock("wouter", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  useLocation: () => ["/setup/treasure-map", vi.fn()],
}));
vi.mock("@/hooks/useActiveAccountDisplay", () => ({
  useActiveAccountDisplay: () => ({ pubkey: "a".repeat(64), npub: "npub1lira", displayName: "Lira" }),
}));
vi.mock("@/accounts/login-flow", () => ({ logout: vi.fn() }));
vi.mock("@/components/AppHeader", () => ({ AppHeader: () => null }));
vi.mock("@/services/api", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  apiClient: { getAssistantTreasureMap: h.getAssistantTreasureMap, setAssistantTreasureMap: h.setAssistantTreasureMap },
}));
vi.mock("@/services/nostr", () => ({ fetchEventsByFilter: vi.fn(async () => []) }));
vi.mock("@/lib/relayPool", () => ({
  pool: {
    req: (relays: string[]) => {
      h.asked.push(relays);
      return new Observable((sub) => {
        const timers = relays
          .filter((relay) => !h.silent.has(relay))
          .map((relay) =>
            setTimeout(() => {
              for (const ev of h.held[relay] ?? [])
                sub.next({ type: "EVENT", from: relay, event: JSON.parse(JSON.stringify(ev)) });
              sub.next({ type: "EOSE", from: relay });
            }, 0),
          );
        return () => timers.forEach(clearTimeout);
      });
    },
  },
}));

import { parseTreasureMapCheck } from "@/lib/assistantTreasureMap";
import { __resetAsks } from "@/lib/askOnce";
import { eventStore } from "@/lib/eventStore";
import TreasureMapSetupPage from "./TreasureMapSetupPage";

eventStore.verifyEvent = verifyEvent;
let sk = generateSecretKey();
let ASSISTANT = getPublicKey(sk);
let t = 1_790_500_000;
const SHOULD = [
  ["30382:rank", SCORES],
  ["30382:followers", SCORES],
];
const signed = (entries: string[][], at: number) =>
  finalizeEvent({ kind: 10040, created_at: at, content: "", tags: entries.map(([k, r]) => [k, ASSISTANT, r]) }, sk);
const check = (on: boolean) =>
  parseTreasureMapCheck({
    assistant: ASSISTANT,
    on,
    duties: [],
    shouldSay: SHOULD,
    relays: [SCORES, OUTBOX],
    writerRelays: [SCORES, OUTBOX],
  });

function mountPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return render(<TreasureMapSetupPage />, { wrapper: Wrapper });
}

beforeEach(() => {
  vi.clearAllMocks();
  __resetAsks();
  sk = generateSecretKey();
  ASSISTANT = getPublicKey(sk);
  t += 10_000;
  h.held = {};
  h.silent = new Set();
  h.asked = [];
});

describe("the page's repair, over the real probe", () => {
  it("names a relay's miss and offers the press while a silent relay is still being asked", async () => {
    eventStore.add(signed(SHOULD, t));
    h.held = { [SCORES]: [] };
    h.silent.add(OUTBOX);
    h.getAssistantTreasureMap.mockResolvedValue(check(true));
    mountPage();
    await waitFor(() => expect(screen.getByTestId("treasure-map-missed")).toHaveTextContent(SCORES));
    expect(screen.getByTestId("treasure-map-checking-relays")).toBeInTheDocument();
    expect(screen.getByTestId("treasure-map-update")).toBeEnabled();
  });

  it("while off, keeps the Turn off it offered for a relay's miss, and its Publishing…, until the check after it is back", async () => {
    const old = signed(SHOULD, t);
    const empty = signed([], t + 100);
    eventStore.add(empty);
    h.held = { [SCORES]: [old], [OUTBOX]: [empty] };
    h.getAssistantTreasureMap.mockResolvedValue(check(false));
    mountPage();
    await waitFor(() => expect(screen.getByTestId("treasure-map-off")).toBeEnabled());
    expect(screen.getByTestId("treasure-map-missed")).toHaveTextContent(SCORES);

    let answer!: () => void;
    h.setAssistantTreasureMap.mockImplementation(
      () =>
        new Promise((resolve) => {
          answer = () => resolve({ on: false, published: true, event: empty, relays: [{ url: SCORES, ok: true }] });
        }),
    );
    let back!: () => void;
    h.getAssistantTreasureMap.mockImplementation(
      () =>
        new Promise((resolve) => {
          back = () => resolve(check(false));
        }),
    );
    h.asked = [];
    fireEvent.click(screen.getByTestId("treasure-map-off"));
    await waitFor(() => expect(screen.getByTestId("treasure-map-off")).toHaveTextContent("Publishing…"));
    // The repair reached the scores relay: from now on it holds the empty version.
    h.held = { [SCORES]: [empty], [OUTBOX]: [empty] };
    // Nothing is asked while the POST is out.
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.getByTestId("treasure-map-off")).toHaveTextContent("Publishing…");
    expect(h.asked).toEqual([]);
    await act(async () => answer());
    // The press waits for the check it stood on. Till then the page is the one it was made from: the
    // miss it was offered for, and its button saying "Publishing…" (V3-2); the relays aren't asked.
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.getByTestId("treasure-map-off")).toHaveTextContent("Publishing…");
    expect(screen.getByTestId("treasure-map-missed")).toHaveTextContent(SCORES);
    expect(screen.queryByTestId("treasure-map-checking-relays")).not.toBeInTheDocument();
    expect(screen.queryByTestId("treasure-map-report")).not.toBeInTheDocument();
    expect(h.asked).toEqual([]);
    await act(async () => back());
    await waitFor(() => expect(screen.getByTestId("treasure-map-report")).toBeInTheDocument());
    await waitFor(() => expect(screen.queryByTestId("treasure-map-checking-relays")).not.toBeInTheDocument());
    expect(screen.queryByTestId("treasure-map-missed")).not.toBeInTheDocument();
    expect(screen.queryByTestId("treasure-map-off")).not.toBeInTheDocument();
    expect(h.asked).toEqual([[SCORES], [OUTBOX]]);
  });
});
