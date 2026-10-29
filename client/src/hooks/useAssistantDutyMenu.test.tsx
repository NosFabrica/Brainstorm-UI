// @vitest-environment jsdom
/**
 * The Assistant's Duty Menu as Account Setup reads it: the server's offer
 * (docs/assistant/DUTY-MENU-ASK.md), a 404 as "no such step here", the menu
 * found on relays against the offer, and a publish whose signed event joins the
 * store only when it verifies.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { finalizeEvent, generateSecretKey, getPublicKey } from "nostr-tools";
import { DUTY_MENU_HEADER } from "@/config/assistants";

const sk = generateSecretKey();
const ASSISTANT = getPublicKey(sk);
const SCORES = "wss://scores.example/";
const ROWS = [
  ["30382:rank", SCORES],
  ["39998", "wss://dcosl.brainstorm.world/"],
];
const signedMenu = (rows: string[][]) =>
  finalizeEvent(
    {
      kind: 39999,
      created_at: 1_790_000_000,
      content: "",
      tags: [["d", "duty-menu"], ["z", DUTY_MENU_HEADER], ["p", ASSISTANT], ...rows.map(([k, r]) => ["duty", k, r])],
    },
    sk,
  );

const h = vi.hoisted(() => ({
  getAssistantDutyMenu: vi.fn(),
  publishAssistantDutyMenu: vi.fn(),
  stored: undefined as unknown,
  added: [] as unknown[],
}));
vi.mock("@/services/api", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  apiClient: {
    getAssistantDutyMenu: h.getAssistantDutyMenu,
    publishAssistantDutyMenu: h.publishAssistantDutyMenu,
  },
}));
vi.mock("@/hooks/useStoreReplaceable", () => ({
  useStoreReplaceable: (_kind: number, pubkey: string | null) => ({
    event: pubkey ? h.stored : undefined,
    loading: false,
    settled: !!pubkey,
  }),
}));
vi.mock("@/services/nostr", () => ({ fetchEventsByFilter: vi.fn(async () => []) }));
vi.mock("@/lib/eventStore", () => ({ eventStore: { add: (ev: unknown) => h.added.push(ev) } }));

import { DutyMenuUnavailableError } from "@/services/api";
import { useAssistantDutyMenu } from "./useAssistantDutyMenu";

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
);
const mount = () => renderHook(() => useAssistantDutyMenu("a".repeat(64)), { wrapper });

beforeEach(() => {
  vi.clearAllMocks();
  h.stored = undefined;
  h.added = [];
  h.getAssistantDutyMenu.mockResolvedValue({ assistant: ASSISTANT, rows: ROWS });
});

describe("useAssistantDutyMenu", () => {
  it("a server without the route isn't supported: no step", async () => {
    h.getAssistantDutyMenu.mockRejectedValue(new DutyMenuUnavailableError());
    const { result } = mount();
    await waitFor(() => expect(result.current.supported).toBe(false));
    expect(result.current.error).toBeNull();
    expect(result.current.status).toBeNull();
  });

  it("another failure is an error, and not a verdict either way", async () => {
    h.getAssistantDutyMenu.mockRejectedValue(new Error("boom"));
    const { result } = mount();
    // Retried once (only "no route" isn't), so the answer takes a moment.
    await waitFor(() => expect(result.current.error?.message).toBe("boom"), { timeout: 3000 });
    expect(result.current.supported).toBeUndefined();
  });

  it("with no menu found, it's missing", async () => {
    const { result } = mount();
    await waitFor(() => expect(result.current.supported).toBe(true));
    expect(result.current.offer.map((r) => r.key)).toEqual(["30382:rank", "39998"]);
    expect(result.current.status).toBe("missing");
  });

  it("a menu with the offer's rows is current; one without them is out of date", async () => {
    h.stored = signedMenu(ROWS);
    const current = mount();
    await waitFor(() => expect(current.result.current.status).toBe("current"));
    expect(current.result.current.publishedRows).toHaveLength(2);
    h.stored = signedMenu(ROWS.slice(0, 1));
    const stale = mount();
    await waitFor(() => expect(stale.result.current.status).toBe("out-of-date"));
  });

  it("a publish adds the server's signed menu to the store — only when it verifies", async () => {
    const event = signedMenu(ROWS);
    h.publishAssistantDutyMenu.mockResolvedValue({ event, relays: [{ url: SCORES, ok: true }] });
    const { result } = mount();
    await waitFor(() => expect(result.current.supported).toBe(true));
    await act(async () => {
      await result.current.publish();
    });
    expect(h.added).toEqual([event]);

    // Through JSON, as a server's answer arrives: no cached "verified" mark from signing it here.
    const forged = JSON.parse(JSON.stringify({ ...event, sig: "0".repeat(128) }));
    h.publishAssistantDutyMenu.mockResolvedValue({ event: forged, relays: [] });
    await act(async () => {
      await result.current.publish();
    });
    expect(h.added).toHaveLength(1);
  });
});
