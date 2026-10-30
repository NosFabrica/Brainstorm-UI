/**
 * /setup/treasure-map: the duties the reader's Map gives their Brainstorm
 * Assistant and which are live, what its Treasure Map should list beside what
 * it lists, and Tapestry's three buttons — or, on a server without the route,
 * nothing to press.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import type { AssistantTreasureMap } from "@/hooks/useAssistantTreasureMap";
import type { DutyLine } from "@/lib/assistantTreasureMap";
import { AssistantRouteError } from "@/services/api";

const SCORES = "wss://scores.example/";
const DCOSL = "wss://dcosl.brainstorm.world/";
const rank = { key: "30382:rank", relay: SCORES };
const line = (l: Partial<DutyLine>): DutyLine => ({
  key: "30382:rank",
  status: "live",
  relay: SCORES,
  reason: null,
  lastLandedAt: null,
  entries: [rank],
  ...l,
});
const DUTIES = [
  line({}),
  line({ key: "30392", status: "offered", reason: "not-scheduled", entries: [] }),
  line({ key: "39998", status: "offered", relay: DCOSL, reason: "not-published-here", entries: [] }),
  line({ key: "30382:hops", status: "elsewhere", relay: null, entries: [] }),
];

const h = vi.hoisted(() => ({ map: null as unknown as AssistantTreasureMap, args: [] as unknown[] }));
vi.mock("wouter", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  useLocation: () => ["/setup/treasure-map", vi.fn()],
}));
vi.mock("@/hooks/useActiveAccountDisplay", () => ({
  useActiveAccountDisplay: () => ({ pubkey: "a".repeat(64), npub: "npub1lira", displayName: "Lira" }),
}));
vi.mock("@/accounts/login-flow", () => ({ logout: vi.fn() }));
vi.mock("@/components/AppHeader", () => ({ AppHeader: () => null }));
vi.mock("@/hooks/useAssistantTreasureMap", () => ({
  useAssistantTreasureMap: (...args: unknown[]) => {
    h.args = args;
    return h.map;
  },
}));

import TreasureMapSetupPage from "./TreasureMapSetupPage";

function show(map: Partial<AssistantTreasureMap>) {
  h.map = {
    supported: true,
    assistant: "b".repeat(64),
    on: false,
    duties: DUTIES,
    shouldSay: [rank],
    published: null,
    found: [],
    status: "missing",
    settled: true,
    missed: [],
    checkingRelays: false,
    error: null,
    offUnchecked: false,
    set: vi.fn(async (on: boolean) => ({ on, published: true, event: null, relays: [] })),
    publishing: false,
    ...map,
  };
  renderWithProviders(<TreasureMapSetupPage />);
}

describe("TreasureMapSetupPage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows each duty the Map gives the Assistant, and why one isn't active", () => {
    show({});
    const duties = screen.getByTestId("treasure-map-duties");
    expect(duties).toHaveTextContent(
      "Scores · 30382:rank · Offered but not active · Live, but your Assistant's Treasure Map doesn't list it yet.",
    );
    expect(duties).toHaveTextContent(
      "Lists · 30392 · Offered but not active · Not kept up to date: no updates are scheduled.",
    );
    expect(duties).toHaveTextContent("Concepts · 39998 · Offered but not active · Brainstorm doesn't publish these");
    expect(duties).toHaveTextContent("30382:hops · Your Treasure Map gives this to another Assistant.");
    expect(screen.getByTestId("treasure-map-should")).toHaveTextContent("Scores · 30382:rank · wss://scores.example/");
  });

  it("while off with nothing listed: says so, and offers only Turn on", () => {
    show({});
    expect(screen.getByTestId("treasure-map-published-none")).toHaveTextContent("lists none of its duties");
    expect(screen.getByTestId("treasure-map-state")).toHaveTextContent("set to list none of its duties.");
    expect(screen.queryByTestId("treasure-map-status")).toBeNull();
    expect(screen.getByTestId("treasure-map-on")).toBeEnabled();
    expect(screen.queryByTestId("treasure-map-off")).toBeNull();
    expect(screen.queryByTestId("treasure-map-update")).toBeNull();
  });

  it("while on and up to date: the duty is active, Done, and Update now has nothing to do", () => {
    show({ on: true, status: "current", found: [rank], published: { kind: 10040 } as never });
    expect(screen.getByTestId("treasure-map-duties")).toHaveTextContent("30382:rank · Active · wss://scores.example/");
    expect(screen.getByTestId("treasure-map-published")).toHaveTextContent("Scores · 30382:rank");
    expect(screen.getByTestId("treasure-map-status")).toHaveTextContent("up to date");
    expect(screen.getByTestId("treasure-map-update")).toBeDisabled();
    expect(screen.getByTestId("treasure-map-off")).toBeEnabled();
    expect(screen.getByText("Show your Assistant's raw Treasure Map")).toBeInTheDocument();
  });

  it("flags a listed duty that isn't live, and offers Turn off while off", () => {
    const followers = { key: "30382:followers", relay: SCORES };
    show({ status: "out-of-date", found: [rank, followers], published: { kind: 10040 } as never });
    expect(screen.getByTestId("treasure-map-published")).toHaveTextContent(
      "30382:followers · wss://scores.example/ · Your Assistant's Treasure Map lists this, but it isn't live.",
    );
    expect(screen.getByTestId("treasure-map-state")).toHaveTextContent("but the version found still lists some");
    expect(screen.getByTestId("treasure-map-off")).toBeEnabled();
  });

  it("waits while the published version is still being read", () => {
    show({ status: null, settled: false });
    expect(screen.getByTestId("treasure-map-published-none")).toHaveTextContent("Checking…");
    expect(screen.getByTestId("treasure-map-on")).toBeDisabled();
  });

  it("Turn on sends on, and reports each relay", async () => {
    const set = vi.fn(async (on: boolean) => ({
      on,
      published: true,
      event: null,
      relays: [
        { url: SCORES, ok: true },
        { url: "wss://slow.example", ok: false, message: "timeout" },
      ],
    }));
    show({ set });
    fireEvent.click(screen.getByTestId("treasure-map-on"));
    await waitFor(() => expect(screen.getByTestId("treasure-map-report")).toHaveTextContent("wss://slow.example"));
    expect(screen.getByTestId("treasure-map-report")).toHaveTextContent("timeout");
    expect(set).toHaveBeenCalledWith(true);
  });

  it("Turn off sends off; a press that changes nothing says so", async () => {
    const set = vi.fn(async (on: boolean) => ({ on, published: false, event: null, relays: [] }));
    show({ on: true, status: "current", found: [rank], set });
    fireEvent.click(screen.getByTestId("treasure-map-off"));
    await waitFor(() => expect(screen.getByTestId("treasure-map-report")).toHaveTextContent("Nothing changed"));
    expect(set).toHaveBeenCalledWith(false);
  });

  it("says where the newest version is missing, and offers Update now though it's up to date", () => {
    show({ on: true, status: "current", found: [rank], published: { kind: 10040 } as never, missed: [SCORES] });
    expect(screen.getByTestId("treasure-map-missed")).toHaveTextContent(
      "The newest version hasn’t reached wss://scores.example/ yet: updating your Assistant's Treasure Map sends it there.",
    );
    expect(screen.getByTestId("treasure-map-update")).toBeEnabled();
  });

  it("asks the relays a press reads, and says so while they answer", () => {
    show({ on: true, status: "current", found: [rank], published: { kind: 10040 } as never, checkingRelays: true });
    // The page asks the relays, and asks again for a failing check as it opens.
    expect(h.args[1]).toEqual({ probeRelays: true, askAgain: true });
    expect(screen.getByTestId("treasure-map-checking-relays")).toHaveTextContent(
      "Checking which relays have the newest version",
    );
    expect(screen.queryByTestId("treasure-map-missed")).toBeNull();
    expect(screen.getByTestId("treasure-map-update")).toBeDisabled();
  });

  it("while off, a relay that missed the newest version keeps Turn off", () => {
    show({ status: "missing", missed: [SCORES] });
    expect(screen.getByTestId("treasure-map-missed")).toHaveTextContent(
      "removing your Assistant's duties from its Treasure Map sends it there.",
    );
    expect(screen.getByTestId("treasure-map-off")).toBeEnabled();
  });

  const unchecked = { supported: undefined, assistant: null, status: null, settled: false } as const;
  const TOO_MANY = "Your Treasure Map names more than 64 keys, too many to check.";

  it("when the check fails in a way Turn off gets past, says the server's words and offers it", async () => {
    const set = vi.fn(async (on: boolean) => ({ on, published: false, event: null, relays: [] }));
    show({ ...unchecked, error: new AssistantRouteError(TOO_MANY, 422, true), offUnchecked: true, set });
    expect(screen.getByTestId("treasure-map-error")).toHaveTextContent(TOO_MANY);
    expect(screen.getByTestId("treasure-map-error")).not.toHaveTextContent("Couldn’t reach");
    // No check was ever loaded, so nothing on the page is "from the last check".
    expect(screen.queryByTestId("treasure-map-error-last")).toBeNull();
    expect(screen.queryByTestId("treasure-map-on")).toBeNull();
    expect(screen.queryByTestId("treasure-map-duties")).toBeNull();
    fireEvent.click(screen.getByTestId("treasure-map-off"));
    await waitFor(() => expect(screen.getByTestId("treasure-map-report")).toHaveTextContent("Nothing changed"));
    expect(set).toHaveBeenCalledWith(false);
  });

  it("when the request got no answer, says so, and offers nothing a press couldn't get past", () => {
    show({ ...unchecked, error: new TypeError("Failed to fetch") });
    expect(screen.getByTestId("treasure-map-error")).toHaveTextContent(
      "Couldn’t reach your Assistant right now. Failed to fetch",
    );
    expect(screen.queryByTestId("treasure-map-off")).toBeNull();
  });

  it("when the server answered without its own sentence, says what failed and with what, not that it wasn't reached", () => {
    show({
      ...unchecked,
      error: new AssistantRouteError("Couldn't check your Assistant's Treasure Map (500)", 500, false),
    });
    expect(screen.getByTestId("treasure-map-error")).toHaveTextContent(
      /^Couldn't check your Assistant's Treasure Map \(500\)\.$/,
    );
  });

  it("an answer that isn't the route's own, such as a 403, isn't 'couldn't reach' either", () => {
    show({ ...unchecked, error: new Error("Request forbidden (403)") });
    expect(screen.getByTestId("treasure-map-error")).toHaveTextContent(/^Request forbidden \(403\)\.$/);
  });

  it("with a check from before, a failed re-check keeps its panels, and the buttons follow them", () => {
    show({ error: new AssistantRouteError(TOO_MANY, 422, true), offUnchecked: true });
    // The server's sentence as it came, then the line on what is from the check.
    expect(screen.getByTestId("treasure-map-error")).toHaveTextContent(`${TOO_MANY} Your Assistant’s duties`);
    // Only the duties and what it should list come from the check.
    expect(screen.getByTestId("treasure-map-error-last")).toHaveTextContent(
      "Your Assistant’s duties, and what its Treasure Map should list, are from the last check that worked.",
    );
    expect(screen.getByTestId("treasure-map-duties")).toBeInTheDocument();
    // Off with nothing listed: there's nothing to remove.
    expect(screen.queryByTestId("treasure-map-off")).toBeNull();
    expect(screen.getByTestId("treasure-map-on")).toBeEnabled();
  });

  it("with a check from before, a failure that ends without a full stop still reads as sentences", () => {
    show({ error: new AssistantRouteError("Couldn't check your Assistant's Treasure Map (500)", 500, false) });
    expect(screen.getByTestId("treasure-map-error")).toHaveTextContent(
      "Couldn't check your Assistant's Treasure Map (500). Your Assistant’s duties, and what its Treasure Map should list, are from the last check that worked.",
    );
    cleanup();
    show({ error: new TypeError("Failed to fetch") });
    expect(screen.getByTestId("treasure-map-error")).toHaveTextContent(
      "Couldn’t reach your Assistant right now. Failed to fetch. Your Assistant’s duties",
    );
    cleanup();
    // The 15 s ran out: no answer either.
    show({ error: new DOMException("signal timed out", "TimeoutError") });
    expect(screen.getByTestId("treasure-map-error")).toHaveTextContent(
      "Couldn’t reach your Assistant right now. Signal timed out. Your Assistant’s duties",
    );
  });

  it("on a server without the route, says it can't yet and offers nothing", () => {
    show({ supported: false });
    expect(screen.getByTestId("treasure-map-unavailable")).toHaveTextContent(
      "can’t keep your Assistant’s Treasure Map yet",
    );
    expect(screen.queryByTestId("treasure-map-on")).toBeNull();
  });
});
