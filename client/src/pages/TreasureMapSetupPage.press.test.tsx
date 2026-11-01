// @vitest-environment jsdom
/**
 * /setup/treasure-map's presses over the real hook and a real QueryClient
 * (the API, the store and the relay probe mocked): the pressed button keeps
 * its "Publishing…" until the press answers, a report stays beside the button
 * that made it, and a Turn off that worked isn't offered again.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { finalizeEvent, generateSecretKey, getPublicKey } from "nostr-tools";

const sk = generateSecretKey();
const ASSISTANT = getPublicKey(sk);
const SCORES = "wss://scores.example/";
const SHOULD = [
  ["30382:rank", SCORES],
  ["30382:followers", SCORES],
];
const signedMap = (entries: string[][], created_at = 1_790_000_000) =>
  finalizeEvent({ kind: 10040, created_at, content: "", tags: entries.map(([k, r]) => [k, ASSISTANT, r]) }, sk);

const h = vi.hoisted(() => ({
  getAssistantTreasureMap: vi.fn(),
  setAssistantTreasureMap: vi.fn(),
  reach: vi.fn(),
  stored: undefined as unknown,
  listeners: new Set<() => void>(),
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
  apiClient: {
    getAssistantTreasureMap: h.getAssistantTreasureMap,
    setAssistantTreasureMap: h.setAssistantTreasureMap,
  },
}));
// A store that re-renders on `add`, as the EventStore does.
vi.mock("@/hooks/useStoreReplaceable", async () => {
  const { useSyncExternalStore } = await import("react");
  const subscribe = (listener: () => void) => {
    h.listeners.add(listener);
    return () => void h.listeners.delete(listener);
  };
  return {
    useStoreReplaceable: (_kind: number, pubkey: string | null) => {
      const event = useSyncExternalStore(subscribe, () => h.stored);
      return { event: pubkey ? event : undefined, loading: false, settled: !!pubkey };
    },
  };
});
vi.mock("@/services/nostr", () => ({
  fetchEventsByFilter: vi.fn(async () => []),
}));
vi.mock("@/lib/eventStore", () => ({
  eventStore: {
    add: (ev: unknown) => {
      h.stored = ev;
      h.listeners.forEach((listener) => listener());
    },
  },
}));
vi.mock("@/lib/relayRequest", () => ({ requestHeld: h.reach }));

import { parseTreasureMapCheck } from "@/lib/assistantTreasureMap";
import { AssistantRouteError, TreasureMapUnavailableError } from "@/services/api";
import TreasureMapSetupPage from "./TreasureMapSetupPage";

const check = (on: boolean) =>
  parseTreasureMapCheck({
    assistant: ASSISTANT,
    on,
    duties: [],
    shouldSay: SHOULD,
    relays: [SCORES],
    writerRelays: [SCORES],
  });
const TOO_MANY =
  "Your Treasure Map names more than 64 keys, too many to check, so your Assistant's Treasure Map couldn't be checked.";
const SCORES_502 = "Couldn't check whether your Scores are kept up to date. Try again in a moment.";
const KEY = ["assistant-treasure-map", "a".repeat(64)];

function mountPage(client = new QueryClient({ defaultOptions: { queries: { retryDelay: 20 } } })) {
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { ...render(<TreasureMapSetupPage />, { wrapper: Wrapper }), client };
}
/** The buttons shown, as `testid:enabled|disabled:text`. */
const buttons = () =>
  ["treasure-map-on", "treasure-map-update", "treasure-map-off"]
    .map((id) => screen.queryByTestId(id) as HTMLButtonElement | null)
    .filter((b): b is HTMLButtonElement => b !== null)
    .map((b) => `${b.dataset.testid}:${b.disabled ? "disabled" : "enabled"}:${b.textContent}`);
/** From here, each GET waits to be answered by hand. */
const holdGets = () => {
  const gets: { resolve: (v: unknown) => void; reject: (e: unknown) => void }[] = [];
  h.getAssistantTreasureMap.mockImplementation(() => new Promise((resolve, reject) => gets.push({ resolve, reject })));
  return gets;
};
const OFF = "treasure-map-off:disabled:Publishing…";

beforeEach(() => {
  vi.clearAllMocks();
  h.stored = undefined;
  h.reach.mockImplementation(async (relays: string[]) => ({
    held: h.stored,
    reach: { asked: relays, answered: relays },
  }));
});

describe("TreasureMapSetupPage's presses", () => {
  it("Turn off keeps its button and its Publishing… until the check after it is back", async () => {
    h.stored = signedMap(SHOULD);
    h.getAssistantTreasureMap.mockResolvedValue(check(true));
    mountPage();
    await waitFor(() => expect(screen.getByTestId("treasure-map-off")).toBeEnabled());
    const gets = holdGets();
    h.setAssistantTreasureMap.mockResolvedValue({
      on: false,
      published: true,
      event: signedMap([], 1_790_000_100),
      relays: [{ url: SCORES, ok: true }],
    });
    fireEvent.click(screen.getByTestId("treasure-map-off"));
    await waitFor(() => expect(gets).toHaveLength(1));
    await waitFor(() => expect(screen.getByTestId("treasure-map-published-none")).toBeInTheDocument());
    expect(buttons()).toContain(OFF);
    expect(screen.queryByTestId("treasure-map-report")).toBeNull();
    await act(async () => gets[0].resolve(check(false)));
    await waitFor(() => expect(screen.getByTestId("treasure-map-report")).toHaveTextContent("now lists none"));
    expect(buttons()).toEqual(["treasure-map-on:enabled:List your Assistant's live duties in its Treasure Map"]);
  });

  it("while off, Turn off keeps its button and its Publishing… though its version empties the one found", async () => {
    h.stored = signedMap(SHOULD);
    h.getAssistantTreasureMap.mockResolvedValue(check(false));
    mountPage();
    await waitFor(() => expect(screen.getByTestId("treasure-map-off")).toBeEnabled());
    const gets = holdGets();
    h.setAssistantTreasureMap.mockResolvedValue({
      on: false,
      published: true,
      event: signedMap([], 1_790_000_100),
      relays: [{ url: SCORES, ok: true }],
    });
    fireEvent.click(screen.getByTestId("treasure-map-off"));
    await waitFor(() => expect(gets).toHaveLength(1));
    await waitFor(() => expect(screen.getByTestId("treasure-map-published-none")).toBeInTheDocument());
    expect(buttons()).toContain(OFF);
    await act(async () => gets[0].resolve(check(false)));
    await waitFor(() => expect(screen.getByTestId("treasure-map-report")).toHaveTextContent("now lists none"));
    expect(buttons()).toEqual(["treasure-map-on:enabled:List your Assistant's live duties in its Treasure Map"]);
  });

  it("Turn on keeps its button and its Publishing… until the check after it is back", async () => {
    h.getAssistantTreasureMap.mockResolvedValue(check(false));
    mountPage();
    await waitFor(() => expect(screen.getByTestId("treasure-map-on")).toBeEnabled());
    const gets = holdGets();
    h.setAssistantTreasureMap.mockResolvedValue({
      on: true,
      published: true,
      event: signedMap(SHOULD, 1_790_000_100),
      relays: [{ url: SCORES, ok: true }],
    });
    fireEvent.click(screen.getByTestId("treasure-map-on"));
    await waitFor(() => expect(gets).toHaveLength(1));
    await waitFor(() => expect(screen.getByTestId("treasure-map-published")).toBeInTheDocument());
    expect(buttons()).toContain("treasure-map-on:disabled:Publishing…");
    await act(async () => gets[0].resolve(check(true)));
    await waitFor(() => expect(screen.getByTestId("treasure-map-report")).toBeInTheDocument());
    expect(buttons()).toEqual([
      "treasure-map-update:disabled:Update your Assistant's Treasure Map now",
      "treasure-map-off:enabled:Remove your Assistant's duties from its Treasure Map",
    ]);
  });

  it("with no check, a Turn off that worked isn't offered again, and its report stays in its card", async () => {
    h.getAssistantTreasureMap.mockRejectedValue(new AssistantRouteError(TOO_MANY, 422, true));
    mountPage();
    await waitFor(() => expect(screen.getByTestId("treasure-map-off")).toBeEnabled());
    h.setAssistantTreasureMap.mockResolvedValue({
      on: false,
      published: true,
      event: signedMap([], 1_790_000_100),
      relays: [{ url: SCORES, ok: true }],
    });
    fireEvent.click(screen.getByTestId("treasure-map-off"));
    await waitFor(() => expect(screen.getByTestId("treasure-map-report")).toHaveTextContent("now lists none"));
    expect(screen.queryByTestId("treasure-map-off")).toBeNull();
    expect(screen.queryByTestId("treasure-map-off-unchecked")).toBeNull();
    expect(screen.getByTestId("treasure-map-error")).toHaveTextContent(TOO_MANY);
    // The 422 isn't asked again: no press changes the reader's Map.
    await new Promise((r) => setTimeout(r, 50));
    expect(h.getAssistantTreasureMap).toHaveBeenCalledTimes(1);
  });

  it("a press made while a cached check is failing answers at once, beside its button, under the failure", async () => {
    h.stored = signedMap(SHOULD);
    h.getAssistantTreasureMap.mockResolvedValue(check(true));
    const { client } = mountPage();
    await waitFor(() => expect(screen.getByTestId("treasure-map-off")).toBeEnabled());
    h.getAssistantTreasureMap.mockRejectedValue(new AssistantRouteError(SCORES_502, 502, true));
    await act(async () => {
      await client.invalidateQueries({ queryKey: KEY });
    });
    await waitFor(() => expect(screen.getByTestId("treasure-map-error")).toBeInTheDocument(), { timeout: 3000 });
    // The re-read hangs, as a GET waiting on the follow count does.
    h.getAssistantTreasureMap.mockImplementation(() => new Promise(() => {}));
    h.setAssistantTreasureMap.mockResolvedValue({
      on: false,
      published: true,
      event: signedMap([], 1_790_000_100),
      relays: [{ url: SCORES, ok: true }],
    });
    fireEvent.click(screen.getByTestId("treasure-map-off"));
    const report = await screen.findByTestId("treasure-map-report");
    expect(report).toHaveTextContent("now lists none");
    expect(screen.getByTestId("treasure-map-error")).toHaveTextContent(SCORES_502);
    expect(screen.getByTestId("treasure-map-error-last")).toHaveTextContent(
      "Your Assistant’s duties, and what its Treasure Map should list, are from the last check that worked.",
    );
    expect(screen.getByTestId("treasure-map-state")).toHaveTextContent("set to list none of its duties.");
    // No second Turn off, and the report sits in the card with the buttons.
    expect(buttons()).toEqual(["treasure-map-on:enabled:List your Assistant's live duties in its Treasure Map"]);
    const card = screen.getByTestId("treasure-map-on").closest(".space-y-3") as HTMLElement;
    expect(within(card).getByTestId("treasure-map-report")).toBe(report);
  });

  it("a page opened again while a press is under way keeps it busy, sends no second press, and shows its answer (A1)", async () => {
    h.stored = signedMap(SHOULD);
    h.getAssistantTreasureMap.mockResolvedValue(check(true));
    const first = mountPage();
    await waitFor(() => expect(screen.getByTestId("treasure-map-off")).toBeEnabled());
    let answer!: (v: unknown) => void;
    h.setAssistantTreasureMap.mockImplementation(() => new Promise((resolve) => (answer = resolve)));
    fireEvent.click(screen.getByTestId("treasure-map-off"));
    await waitFor(() => expect(buttons()).toContain(OFF));
    // "Back to setup checklist", then the Treasure Map row again, before the POST answers.
    first.unmount();
    mountPage(first.client);
    await waitFor(() => expect(buttons()).toContain(OFF));
    expect(screen.getByTestId("treasure-map-update")).toBeDisabled();
    fireEvent.click(screen.getByTestId("treasure-map-off"));
    expect(h.setAssistantTreasureMap).toHaveBeenCalledTimes(1);
    h.getAssistantTreasureMap.mockResolvedValue(check(false));
    await act(async () =>
      answer({ on: false, published: true, event: signedMap([], 1_790_000_100), relays: [{ url: SCORES, ok: true }] }),
    );
    await waitFor(() => expect(screen.getByTestId("treasure-map-report")).toHaveTextContent("now lists none"));
  });

  it("with no check, Turn off's card and Publishing… stay while it runs, though the re-ask fails another way (A6)", async () => {
    h.getAssistantTreasureMap.mockRejectedValue(new AssistantRouteError(SCORES_502, 502, true));
    const { client } = mountPage();
    await waitFor(() => expect(screen.getByTestId("treasure-map-off")).toBeEnabled(), { timeout: 3000 });
    let answer!: (v: unknown) => void;
    h.setAssistantTreasureMap.mockImplementation(() => new Promise((resolve) => (answer = resolve)));
    fireEvent.click(screen.getByTestId("treasure-map-off"));
    await waitFor(() => expect(buttons()).toContain(OFF));
    // Asked again while the POST is out, the check now gets no answer at all: not one Turn off gets past.
    h.getAssistantTreasureMap.mockRejectedValue(new TypeError("Failed to fetch"));
    await act(async () => {
      await client.refetchQueries({ queryKey: KEY });
    });
    await waitFor(() => expect(screen.getByTestId("treasure-map-error")).toHaveTextContent("Couldn’t reach"));
    expect(buttons()).toContain(OFF);
    await act(async () => answer({ on: false, published: false, event: null, relays: [] }));
    await waitFor(() => expect(screen.getByTestId("treasure-map-report")).toHaveTextContent("Nothing changed"));
  });

  it("with no check, a Turn off's answer stays when the check after it finds no route (A8)", async () => {
    h.getAssistantTreasureMap.mockRejectedValue(new AssistantRouteError(SCORES_502, 502, true));
    mountPage();
    await waitFor(() => expect(screen.getByTestId("treasure-map-off")).toBeEnabled(), { timeout: 3000 });
    h.setAssistantTreasureMap.mockResolvedValue({
      on: false,
      published: true,
      event: null,
      relays: [{ url: SCORES, ok: true }],
    });
    h.getAssistantTreasureMap.mockRejectedValue(new TreasureMapUnavailableError());
    fireEvent.click(screen.getByTestId("treasure-map-off"));
    await waitFor(() => expect(screen.getByTestId("treasure-map-unavailable")).toBeInTheDocument());
    expect(screen.getByTestId("treasure-map-report")).toHaveTextContent(SCORES);
  });
});
