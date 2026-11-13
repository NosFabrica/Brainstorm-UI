import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { readTask } from "@/lib/scheduledTasks";
import { resetPrintJob } from "@/services/printJob";
import FrontPagePage from "./FrontPagePage";

const state = vi.hoisted(() => ({
  keys: { status: "ready", keys: [{ key: "sk-or-v1-x", url: "https://openrouter.ai/api/v1" }] } as Record<
    string,
    unknown
  >,
  hasMywot: true,
  isSearchObserver: true,
  models: [] as string[],
  modelsFor: null as null | ((url: string) => Promise<string[]>),
  user: { pubkey: "a".repeat(64), npub: "npub1lira", displayName: "Lira" },
  print: vi.fn(),
  site: { event: null, index: { v: 1, title: "", editions: [] }, servers: [], relays: [] } as Record<string, unknown>,
  publish: vi.fn(),
  fetchBlob: vi.fn(),
  schedule: { status: "none" } as Record<string, unknown>,
  scoring: "calculating" as "idle" | "calculating" | "publishing" | "ready" | "failed",
  scoringLoading: false,
  /** What the reader's kind 10040 says of Brainstorm; undefined until the relays answered. */
  trustProvider: "brainstorm" as "brainstorm" | "none" | "other" | undefined,
  /** When the search relay was last asked whether it ranks through the reader. */
  observerCheckedAt: 1,
  siteLoad: null as null | (() => Promise<unknown>),
  updateSchedule: vi.fn(),
  runnerSite: null as null | Record<string, unknown>,
  runnerSiteFor: vi.fn(),
}));

vi.mock("@/components/AppHeader", () => ({ AppHeader: () => null }));
vi.mock("@/components/Footer", () => ({ Footer: () => null }));
vi.mock("@/accounts/login-flow", () => ({ logout: vi.fn() }));
vi.mock("@/hooks/useActiveAccountDisplay", () => ({
  useActiveAccountDisplay: () => state.user,
}));
vi.mock("@/hooks/useAgentKeys", () => ({ useAgentKeys: () => ({ reveal: vi.fn(), ...state.keys }) }));
// The morning schedule card has its own tests (lib/scheduledTasks, services/observerSchedule).
vi.mock("@/hooks/useObserverSchedule", () => ({
  useObserverSchedule: () => ({ reveal: vi.fn(), refresh: vi.fn(), checkedAt: null, runners: [], ...state.schedule }),
}));
// A setting picked in the print view goes to the schedule; no relay is reached here.
vi.mock("@/services/observerSchedule", () => ({
  updateObserverSchedule: (...args: unknown[]) => state.updateSchedule(...args),
}));
vi.mock("@/hooks/useScoringStatus", () => ({
  useScoringStatus: () => ({ status: state.scoring, isLoading: state.scoringLoading }),
}));
vi.mock("@/hooks/useTrustProviderStatus", () => ({
  useTrustProviderStatus: () => ({ data: state.trustProvider, missingSignals: [] }),
}));
vi.mock("@/hooks/useHasMywot", () => ({
  useHasMywot: () => ({ hasMywot: state.hasMywot, taPubkey: "t", known: true, isLoading: false }),
}));
vi.mock("@/hooks/useCanSearchMywot", () => ({
  useCanSearchMywot: () => ({
    hasMywot: state.hasMywot,
    isSearchObserver: state.isSearchObserver,
    canUseMywot: state.hasMywot && state.isSearchObserver,
    observerCheckedAt: state.observerCheckedAt,
  }),
}));
vi.mock("@/services/frontPage", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchModels: (key: { url: string }) => (state.modelsFor ? state.modelsFor(key.url) : Promise.resolve(state.models)),
  // The page asks for the list with its prices; these endpoints aren't Routstr nodes.
  fetchModelList: async (key: { url: string }) => ({
    ids: await (state.modelsFor ? state.modelsFor(key.url) : Promise.resolve(state.models)),
    routstr: null,
  }),
  printFrontPage: (...args: unknown[]) => state.print(...args),
}));

// The site as `useObserverSite` hands it over (its own tests: hooks/useObserverSite):
// unknown until the staged read answers, and unknown still when it fails.
vi.mock("@/hooks/useObserverSite", async () => {
  const { useEffect, useState } = await import("react");
  return {
    useObserverSite: () => {
      const [view, setView] = useState<unknown>(null);
      useEffect(() => {
        let live = true;
        (state.siteLoad ? state.siteLoad() : Promise.resolve(state.site))
          .then((loaded) => {
            const site = loaded as {
              event: unknown;
              index: { editions: unknown[] };
              servers: string[];
              settled?: boolean;
            };
            if (live) {
              setView({
                editions: site.index.editions,
                servers: site.servers,
                exists: !!site.event,
                settled: site.settled ?? true,
              });
            }
          })
          .catch(() => undefined);
        return () => {
          live = false;
        };
      }, []);
      return view;
    },
  };
});

// The runner's site as `useRunnerSite` hands it over (its own tests: hooks/useRunnerSite).
vi.mock("@/hooks/useRunnerSite", () => ({
  useRunnerSite: (runner: string | null, reader: string | null) => {
    if (!runner) return null;
    state.runnerSiteFor(runner, reader);
    const site = (state.runnerSite ?? { event: null, index: { editions: [] }, servers: [] }) as {
      event: unknown;
      index: { editions: unknown[] };
      servers: string[];
    };
    // A new object on every render, as a store update makes one: same servers, new list.
    return {
      status: "ready",
      view: { editions: site.index.editions, servers: [...site.servers], exists: !!site.event, settled: true },
    };
  },
}));

vi.mock("@/services/observerSite", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  publishToObserver: (...args: unknown[]) => state.publish(...args),
  fetchBlob: (...args: unknown[]) => state.fetchBlob(...args),
}));

const hash = (c: string) => c.repeat(64);
const nowSec = () => Math.floor(Date.now() / 1000);
/** An edition on the site printed just now: today on any clock, whatever the hour the suite runs at. */
const todayEntry = (c: string, extra: Record<string, unknown> = {}) => {
  const day = new Date().toISOString().slice(0, 10);
  return { day, path: `/${day}.html`, sha256: hash(c), printedAt: nowSec(), ...extra };
};
const siteWith = (editions: Record<string, unknown>[], servers = ["https://files.example"]) => ({
  event: { kind: 35128 },
  index: { v: 1, title: "Lira's Observer", editions },
  servers,
  relays: [],
});

const printed = {
  status: "printed",
  html: "<!doctype html><html><body><h1>The Nostr Observer</h1></body></html>",
  corpus: { code: "4F2A9C", desks: { notes: [{}, {}] } },
  changes: [{ kind: "unwrapped", detail: "https://evil.example/x" }],
  quotes: 3,
  usage: { promptTokens: 1000, completionTokens: 500 },
  rounds: 1,
};

describe("FrontPagePage", () => {
  beforeEach(() => {
    resetPrintJob();
    window.history.replaceState(null, "", "/front-page");
    sessionStorage.clear();
    localStorage.clear();
    state.keys = { status: "ready", keys: [{ key: "sk-or-v1-x", url: "https://openrouter.ai/api/v1" }] };
    state.hasMywot = true;
    state.isSearchObserver = true;
    state.scoring = "calculating";
    state.models = ["openai/gpt-4o-mini", "anthropic/claude-sonnet-4.5"];
    state.modelsFor = null;
    state.user = { pubkey: "a".repeat(64), npub: "npub1lira", displayName: "Lira" };
    state.print.mockReset();
    state.site = { event: null, index: { v: 1, title: "", editions: [] }, servers: [], relays: [] };
    state.publish.mockReset().mockResolvedValue({
      url: "https://x.nsite.lol",
      naddr: "naddr1x",
      editions: [],
      servers: ["https://files.example"],
    });
    state.fetchBlob.mockReset().mockResolvedValue(null);
    state.schedule = { status: "none" };
    state.scoringLoading = false;
    state.trustProvider = "brainstorm";
    state.observerCheckedAt = 1;
    state.siteLoad = null;
    state.updateSchedule.mockReset().mockResolvedValue({ success: true });
    state.runnerSite = null;
    state.runnerSiteFor.mockReset();
  });

  it("when the provider lists no models, says what to type before Print is offered", async () => {
    state.models = [];
    renderWithProviders(<FrontPagePage />);
    expect(await screen.findByTestId("front-page-model-hint")).toHaveTextContent("Name a model to print");
    expect(screen.getByTestId("front-page-print")).toBeDisabled();
    fireEvent.change(screen.getByTestId("front-page-model-input"), { target: { value: "llama3.3" } });
    expect(screen.queryByTestId("front-page-model-hint")).toBeNull();
    expect(screen.getByTestId("front-page-print")).not.toBeDisabled();
  });

  describe("before the first paper", () => {
    const row = (which: "key" | "wot") => screen.getByTestId(`front-page-setup-${which}`);

    it("with neither, lists both steps to do, each with its action, and offers no Print", async () => {
      state.keys = { status: "none" };
      state.hasMywot = false;
      state.isSearchObserver = false;
      renderWithProviders(<FrontPagePage />);
      const card = screen.getByTestId("front-page-setup");
      // Once the site says there are no papers yet.
      await waitFor(() => expect(card).toHaveTextContent("Before your first paper"));
      expect(row("key")).toHaveAttribute("data-state", "todo");
      expect(row("key")).toHaveTextContent("AI key: To do");
      expect(screen.getByTestId("front-page-connect").getAttribute("href")).toBe("/settings?tab=assistants&view=ai");
      expect(screen.getByRole("link", { name: "Connect an AI key" })).toBeInTheDocument();
      expect(row("wot")).toHaveAttribute("data-state", "todo");
      expect(row("wot")).toHaveTextContent("Web of trust: To do");
      expect(screen.getByRole("link", { name: "Set up your web of trust" }).getAttribute("href")).toBe("/setup");
      expect(screen.queryByTestId("front-page-print")).toBeNull();
    });

    it("doesn't call it the first paper when the reader already has some", async () => {
      state.hasMywot = false;
      state.isSearchObserver = false;
      // An older paper: none today, so the print view and its checklist show.
      const day = "2026-01-05";
      state.site = {
        event: { tags: [] },
        index: { v: 1, title: "", editions: [{ day, path: `/${day}.html`, sha256: "b".repeat(64) }] },
        servers: ["https://files.example"],
        relays: [],
      };
      renderWithProviders(<FrontPagePage />);
      await waitFor(() => expect(screen.getByTestId("front-page-setup")).toHaveTextContent("To print your paper"));
      expect(screen.getByTestId("front-page-setup")).not.toHaveTextContent("Before your first paper");
      expect(screen.queryByTestId("front-page-frame")).toBeNull();
    });

    it("with today's paper on the site, shows it, and keeps what setup needs in Print again", async () => {
      state.hasMywot = false;
      state.isSearchObserver = false;
      state.site = siteWith([todayEntry("b")]);
      state.fetchBlob.mockResolvedValue(printed.html);
      renderWithProviders(<FrontPagePage />);
      expect(await screen.findByTestId("front-page-frame")).toBeInTheDocument();
      expect(screen.queryByTestId("front-page-setup")).toBeNull();
      fireEvent.click(screen.getByTestId("front-page-print-again"));
      const dialog = await screen.findByTestId("front-page-print-dialog");
      expect(within(dialog).getByTestId("front-page-setup")).toHaveTextContent("To print your paper");
      expect(within(dialog).queryByTestId("front-page-print")).toBeNull();
    });

    it("with the key only, says which provider and still asks for the web of trust", () => {
      state.hasMywot = false;
      state.isSearchObserver = false;
      renderWithProviders(<FrontPagePage />);
      expect(row("key")).toHaveAttribute("data-state", "done");
      expect(row("key")).toHaveTextContent("AI key: Done");
      // The done row stays a link, to change the key.
      const change = screen.getByRole("link", { name: "AI key: using OpenRouter. Change" });
      expect(change).toHaveTextContent("Using OpenRouter");
      expect(change.getAttribute("href")).toBe("/settings?tab=assistants&view=ai");
      expect(screen.queryByTestId("front-page-connect")).toBeNull();
      expect(row("wot")).toHaveAttribute("data-state", "todo");
      expect(screen.getByTestId("front-page-setup-wot-action").getAttribute("href")).toBe("/setup");
      expect(screen.queryByTestId("front-page-print")).toBeNull();
    });

    it("with the web of trust only, asks for a key and keeps the web of trust a link", () => {
      state.keys = { status: "none" };
      renderWithProviders(<FrontPagePage />);
      expect(row("key")).toHaveAttribute("data-state", "todo");
      expect(screen.getByTestId("front-page-connect")).toBeInTheDocument();
      expect(row("wot")).toHaveAttribute("data-state", "done");
      expect(row("wot")).toHaveTextContent("Web of trust: Done");
      expect(screen.getByRole("link", { name: "Web of trust: ready. Change" }).getAttribute("href")).toBe("/setup");
      expect(screen.queryByTestId("front-page-print")).toBeNull();
    });

    it("with both, shows no checklist and offers Print", async () => {
      renderWithProviders(<FrontPagePage />);
      expect(screen.queryByTestId("front-page-setup")).toBeNull();
      expect(await screen.findByTestId("front-page-print")).toBeInTheDocument();
    });

    it("while the rankings are still arriving, shows the web of trust in progress, not done, and no Print", () => {
      state.isSearchObserver = false;
      renderWithProviders(<FrontPagePage />);
      expect(row("key")).toHaveAttribute("data-state", "done");
      expect(row("wot")).toHaveAttribute("data-state", "pending");
      expect(row("wot")).toHaveTextContent("Web of trust: In progress");
      expect(row("wot")).toHaveAttribute("data-reason", "calculating");
      expect(row("wot")).toHaveTextContent("Calculating…");
      expect(within(row("wot")).getByRole("status")).toHaveTextContent(
        "Your rankings are on their way. This takes a few minutes.",
      );
      expect(screen.queryByTestId("front-page-setup-wot-action")).toBeNull();
      expect(screen.queryByTestId("front-page-setup-wot-change")).toBeNull();
      expect(screen.queryByTestId("front-page-print")).toBeNull();
    });

    it("says what the rankings are waiting for: publishing, or search catching up", () => {
      state.isSearchObserver = false;
      state.scoring = "publishing";
      const { unmount } = renderWithProviders(<FrontPagePage />);
      expect(row("wot")).toHaveAttribute("data-state", "pending");
      expect(row("wot")).toHaveTextContent("Publishing…");
      unmount();
      state.scoring = "ready";
      renderWithProviders(<FrontPagePage />);
      expect(row("wot")).toHaveAttribute("data-reason", "indexing");
      expect(row("wot")).toHaveTextContent("Almost ready");
      expect(within(row("wot")).getByRole("status")).toHaveTextContent("Search picks them up in a few minutes.");
    });

    it("asks for a calculation that never ran instead of waiting for it forever", () => {
      state.isSearchObserver = false;
      state.scoring = "idle";
      renderWithProviders(<FrontPagePage />);
      expect(row("wot")).toHaveAttribute("data-state", "todo");
      expect(row("wot")).toHaveAttribute("data-reason", "uncalculated");
      expect(row("wot")).toHaveTextContent("Your rankings haven't been calculated yet.");
      const calculate = screen.getByRole("link", { name: "Calculate your web of trust" });
      expect(calculate.getAttribute("href")).toBe("/dashboard");
      expect(screen.queryByTestId("front-page-setup-wot-status")).toBeNull();
    });

    it("offers a retry for a calculation that failed", () => {
      state.isSearchObserver = false;
      state.scoring = "failed";
      renderWithProviders(<FrontPagePage />);
      expect(row("wot")).toHaveAttribute("data-state", "todo");
      expect(row("wot")).toHaveTextContent("The last calculation didn't finish.");
      expect(screen.getByRole("link", { name: "Retry your web of trust calculation" }).getAttribute("href")).toBe(
        "/dashboard",
      );
    });

    it("with the key locked, keeps Unlock on the key row beside the rest of setup", () => {
      const reveal = vi.fn();
      state.keys = { status: "locked", reveal };
      state.hasMywot = false;
      state.isSearchObserver = false;
      renderWithProviders(<FrontPagePage />);
      expect(row("key")).toHaveAttribute("data-state", "locked");
      expect(row("key")).toHaveTextContent("AI key: To do");
      const unlock = screen.getByRole("button", { name: "Unlock your AI key" });
      expect(unlock).toHaveAttribute("data-testid", "front-page-unlock");
      fireEvent.click(unlock);
      expect(reveal).toHaveBeenCalledTimes(1);
      expect(row("wot")).toHaveAttribute("data-state", "todo");
      expect(screen.queryByTestId("front-page-print")).toBeNull();
    });

    it("calls it neither paper while the site is unknown, nor when it couldn't be read (audit, 2026-11-12)", async () => {
      state.keys = { status: "none" };
      state.siteLoad = () => new Promise(() => {});
      const { unmount } = renderWithProviders(<FrontPagePage />);
      expect(screen.getByTestId("front-page-setup")).toHaveTextContent("To print your paper");
      expect(screen.getByTestId("front-page-setup")).not.toHaveTextContent("Before your first paper");
      unmount();
      state.siteLoad = () => Promise.reject(new Error("no relay answered"));
      renderWithProviders(<FrontPagePage />);
      await new Promise((r) => setTimeout(r, 0));
      expect(screen.getByTestId("front-page-setup")).not.toHaveTextContent("Before your first paper");
    });

    it("waits for the scoring status before offering a calculation (audit, 2026-11-12)", () => {
      state.isSearchObserver = false;
      state.scoring = "idle";
      state.scoringLoading = true;
      renderWithProviders(<FrontPagePage />);
      expect(screen.getByTestId("front-page-checking")).toBeInTheDocument();
      expect(screen.queryByTestId("front-page-setup-wot-calculate")).toBeNull();
    });

    it("with scores published but no 10040 naming Brainstorm, leads to activation (audit, 2026-11-12)", () => {
      state.isSearchObserver = false;
      state.scoring = "ready";
      for (const declared of ["none", "other"] as const) {
        state.trustProvider = declared;
        const { unmount } = renderWithProviders(<FrontPagePage />);
        expect(row("wot")).toHaveAttribute("data-state", "todo");
        expect(row("wot")).toHaveAttribute("data-reason", "activate");
        expect(row("wot")).not.toHaveTextContent("Almost ready");
        const activate = screen.getByRole("link", { name: "Activate Brainstorm for your web of trust" });
        expect(activate.getAttribute("href")).toBe("/setup/activate");
        expect(activate).toHaveTextContent("Activate");
        unmount();
      }
      // Named, or not known yet: still waiting for search.
      for (const declared of ["brainstorm", undefined] as const) {
        state.trustProvider = declared;
        const { unmount } = renderWithProviders(<FrontPagePage />);
        expect(row("wot")).toHaveAttribute("data-reason", "indexing");
        unmount();
      }
    });

    it("a signer that failed to read the key offers Retry, not Connect (audit, 2026-11-12)", () => {
      const reveal = vi.fn();
      state.keys = { status: "failed", error: "Your signer didn't answer.", reveal };
      renderWithProviders(<FrontPagePage />);
      expect(row("key")).toHaveAttribute("data-state", "failed");
      expect(screen.queryByTestId("front-page-connect")).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Retry reading your AI key" }));
      expect(reveal).toHaveBeenCalledTimes(1);
    });

    it("clears a turned-away print's in-progress row once search is asked again (audit, 2026-11-12)", async () => {
      state.print.mockResolvedValue({ status: "not-ready", reason: "projection-pending" });
      const { rerender } = renderWithProviders(<FrontPagePage />);
      await waitFor(() => expect(screen.getByTestId("front-page-print")).not.toBeDisabled());
      fireEvent.click(screen.getByTestId("front-page-print"));
      await waitFor(() => expect(row("wot")).toHaveAttribute("data-state", "pending"));
      // The search relay answers again, and says it ranks through them.
      state.observerCheckedAt = Date.now() + 1000;
      rerender(<FrontPagePage />);
      await waitFor(() => expect(screen.queryByTestId("front-page-setup")).toBeNull());
    });

    it("a print the relay turns away marks the web of trust in progress", async () => {
      state.print.mockResolvedValue({ status: "not-ready", reason: "projection-pending" });
      renderWithProviders(<FrontPagePage />);
      expect(screen.queryByTestId("front-page-setup")).toBeNull();
      await waitFor(() => expect(screen.getByTestId("front-page-print")).not.toBeDisabled());
      fireEvent.click(screen.getByTestId("front-page-print"));
      await waitFor(() => expect(row("wot")).toHaveAttribute("data-state", "pending"));
      expect(row("key")).toHaveAttribute("data-state", "done");
    });
  });

  it("picks the best listed model, prints, and shows the paper sandboxed with what was removed", async () => {
    state.print.mockResolvedValue(printed);
    renderWithProviders(<FrontPagePage />);
    await waitFor(() => expect(screen.getByTestId("front-page-print")).not.toBeDisabled());
    fireEvent.click(screen.getByTestId("front-page-print"));

    const frame = await screen.findByTestId("front-page-frame");
    expect(frame.getAttribute("sandbox")).toBe("allow-popups allow-popups-to-escape-sandbox");
    expect(frame.getAttribute("srcdoc")).toContain("The Nostr Observer");
    expect(state.print.mock.calls[0][0]).toMatchObject({
      model: "anthropic/claude-sonnet-4.5",
      observer: "a".repeat(64),
      readerName: "Lira",
    });
    // Today's paper takes the print view's place: a toolbar with the day and its actions, no
    // line of counts (they are not what the reader came for).
    expect(screen.getByTestId("front-page-today")).toContainElement(frame);
    expect(screen.queryByTestId("front-page-print-view")).toBeNull();
    expect(screen.queryByTestId("front-page-hero")).toBeNull();
    expect(screen.queryByTestId("front-page-facts")).toBeNull();
    // The counts, edition number, model and what the check removed sit behind the info button.
    expect(screen.queryByText("No. 4F2A9C")).toBeNull();
    fireEvent.click(screen.getByTestId("front-page-info"));
    const info = await screen.findByTestId("front-page-info-panel");
    expect(info.textContent).toContain("Posts2");
    expect(info.textContent).toContain("Quotes verified3");
    expect(info.textContent).toContain("No. 4F2A9C");
    expect(info.textContent).toContain("anthropic/claude-sonnet-4.5");
    expect(screen.getByTestId("front-page-changes").textContent).toContain("evil.example");
    // Kept for this tab only.
    expect(sessionStorage.getItem(`frontPage:last:${"a".repeat(64)}`)).toContain("4F2A9C");
  });

  it("shows today's paper from the site as the page, and Print again says it was already printed", async () => {
    state.site = siteWith([todayEntry("b", { posts: 12 })]);
    state.fetchBlob.mockResolvedValue(printed.html);
    renderWithProviders(<FrontPagePage />);

    const frame = await screen.findByTestId("front-page-frame");
    expect(screen.getByTestId("front-page-today")).toContainElement(frame);
    expect(frame.getAttribute("srcdoc")).toContain("The Nostr Observer");
    expect(screen.queryByTestId("front-page-facts")).toBeNull();
    fireEvent.click(screen.getByTestId("front-page-info"));
    expect(await screen.findByTestId("front-page-info-panel")).toHaveTextContent("Posts12");
    // Nothing around the paper: no hero, and the schedule card sits in Print again.
    expect(screen.queryByTestId("front-page-hero")).toBeNull();
    expect(screen.queryByTestId("front-page-schedule")).toBeNull();
    // Nothing before today: no way to past editions.
    expect(screen.queryByTestId("front-page-past")).toBeNull();
    fireEvent.click(screen.getByTestId("front-page-print-again"));
    const dialog = await screen.findByTestId("front-page-print-dialog");
    expect(within(dialog).getByTestId("front-page-schedule")).toHaveTextContent("Not scheduled");
    const hint = await screen.findByTestId("front-page-printed-today");
    expect(hint).toHaveTextContent("Already printed today");
    await waitFor(() => expect(screen.getByTestId("front-page-print")).not.toBeDisabled());
    // Says what it opens, out of context too; the tick is decoration.
    const open = screen.getByRole("button", { name: "Open today's paper" });
    expect(open).toBe(screen.getByTestId("front-page-printed-today-open"));
    for (const svg of hint.querySelectorAll("svg")) expect(svg).toHaveAttribute("aria-hidden", "true");
    fireEvent.click(screen.getByTestId("front-page-printed-today-open"));
    await waitFor(() => expect(screen.queryByTestId("front-page-print-dialog")).toBeNull());
    expect(state.print).not.toHaveBeenCalled();
  });

  it("reads 'today' on the schedule's clock when there is a readable schedule", async () => {
    const now = Date.now();
    // A fixed-offset zone where it is now `hour` o'clock (IANA's Etc/GMT signs are inverted).
    const zoneAt = (hour: number) => {
      let offset = hour - new Date(now).getUTCHours();
      if (offset > 14) offset -= 24;
      if (offset < -12) offset += 24;
      return offset === 0 ? "UTC" : offset > 0 ? `Etc/GMT-${offset}` : `Etc/GMT+${-offset}`;
    };
    // 23 hours ago: earlier today where it is now 23:xx, yesterday where it is noon.
    const printedAt = Math.floor(now / 1000) - 23 * 3600;
    const day = new Date(printedAt * 1000).toISOString().slice(0, 10);
    state.site = {
      event: { tags: [] },
      index: { v: 1, title: "", editions: [{ day, path: `/${day}.html`, sha256: "b".repeat(64), printedAt }] },
      servers: ["https://files.example"],
      relays: [],
    };
    const scheduleIn = (zone: string) => {
      const doc = {
        public: [],
        private: [
          ["task", "observer"],
          ["cron", "0 6 * * *", zone],
        ],
      };
      return { status: "ready", doc, schedule: readTask(doc), eventId: "e1", createdAt: 1 };
    };

    state.fetchBlob.mockResolvedValue(printed.html);

    // Where it is 23:xx, that paper is today's: it is the page, and the hint agrees.
    state.schedule = scheduleIn(zoneAt(23));
    const late = renderWithProviders(<FrontPagePage />);
    expect(await screen.findByTestId("front-page-frame")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("front-page-print-again"));
    expect(await screen.findByTestId("front-page-printed-today")).toHaveTextContent("Already printed today");
    late.unmount();

    // Where it is noon, it is yesterday's: the print view, no hint, and the paper is a past edition.
    state.schedule = scheduleIn(zoneAt(12));
    renderWithProviders(<FrontPagePage />);
    expect(await screen.findByTestId("front-page-past-editions-open")).toHaveTextContent(/Past editions\s*1$/);
    await waitFor(() => expect(screen.getByTestId("front-page-print")).not.toBeDisabled());
    expect(screen.getByTestId("front-page-print-view")).toBeInTheDocument();
    expect(screen.queryByTestId("front-page-printed-today")).toBeNull();
    expect(screen.queryByTestId("front-page-frame")).toBeNull();
  });

  it("with only older papers, shows the print view, never the last paper as today's", async () => {
    state.site = siteWith([
      { day: "2026-11-10", path: "/2026-11-10.html", sha256: hash("2"), printedAt: 1_794_300_000 },
    ]);
    state.fetchBlob.mockResolvedValue(printed.html);
    renderWithProviders(<FrontPagePage />);
    expect(await screen.findByTestId("front-page-past-editions-open")).toBeInTheDocument();
    expect(screen.getByTestId("front-page-hero")).toBeInTheDocument();
    expect(screen.getByTestId("front-page-schedule")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("front-page-print")).not.toBeDisabled());
    expect(screen.queryByTestId("front-page-frame")).toBeNull();
    expect(screen.queryByTestId("front-page-printed-today")).toBeNull();
    expect(state.fetchBlob).not.toHaveBeenCalled();
  });

  it("with no papers at all, shows the print view with no way to past editions", async () => {
    renderWithProviders(<FrontPagePage />);
    await waitFor(() => expect(screen.getByTestId("front-page-print")).not.toBeDisabled());
    expect(screen.getByTestId("front-page-print-view")).toBeInTheDocument();
    expect(screen.queryByTestId("front-page-past-editions-open")).toBeNull();
    expect(screen.queryByTestId("front-page-frame")).toBeNull();
  });

  it("a returning reader prints again from a dialog", async () => {
    sessionStorage.setItem(
      `frontPage:last:${"a".repeat(64)}`,
      JSON.stringify({
        html: printed.html,
        code: "OLD001",
        printedAt: Date.now(),
        events: 5,
        quotes: 1,
        rounds: 1,
        usage: null,
        changes: [],
      }),
    );
    state.print.mockResolvedValue(printed);
    renderWithProviders(<FrontPagePage />);

    expect(screen.getByTestId("front-page-header")).toBeInTheDocument();
    expect(screen.queryByTestId("front-page-print")).toBeNull();
    fireEvent.click(screen.getByTestId("front-page-print-again"));
    const dialog = await screen.findByTestId("front-page-print-dialog");
    await waitFor(() => expect(screen.getByTestId("front-page-print")).not.toBeDisabled());
    expect(dialog).toContainElement(screen.getByTestId("front-page-print"));
    fireEvent.click(screen.getByTestId("front-page-print"));
    await waitFor(() => expect(state.print).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByTestId("front-page-print-dialog")).toBeNull());
    // One paper surface: no separate full-screen reader.
    expect(screen.queryByTestId("front-page-fullscreen")).toBeNull();
  });

  it("offers Publish for this tab's paper from before a reload that never reached the site (audit, 2026-11-12)", async () => {
    localStorage.setItem(`frontPage:observerNotice:${"a".repeat(64)}`, "1");
    const paper = {
      html: printed.html,
      code: "OLD001",
      printedAt: Date.now(),
      rounds: 1,
      usage: null,
      changes: [],
    };
    sessionStorage.setItem(`frontPage:last:${"a".repeat(64)}`, JSON.stringify(paper));
    renderWithProviders(<FrontPagePage />);
    const offer = await screen.findByTestId("front-page-publish-offer");
    expect(offer).toHaveTextContent("Not on your Observer yet");
    fireEvent.click(within(offer).getByTestId("front-page-publish-offer-ok"));
    await waitFor(() => expect(state.publish).toHaveBeenCalledTimes(1));
    expect(state.publish.mock.calls[0][0]).toMatchObject({ code: "OLD001", printedAt: paper.printedAt });
    expect(await screen.findByTestId("front-page-publish-status")).toHaveTextContent("On your Observer");
    expect(screen.queryByTestId("front-page-publish-offer")).toBeNull();
    // Published: the tab's copy says so, and a reload doesn't offer it again.
    expect(JSON.parse(sessionStorage.getItem(`frontPage:last:${"a".repeat(64)}`)!).published).toBe(true);
  });

  it("doesn't offer a paper the tab marked published, or one the site already holds", async () => {
    sessionStorage.setItem(
      `frontPage:last:${"a".repeat(64)}`,
      JSON.stringify({
        html: printed.html,
        code: "P1",
        printedAt: Date.now(),
        rounds: 1,
        usage: null,
        changes: [],
        published: true,
      }),
    );
    renderWithProviders(<FrontPagePage />);
    await screen.findByTestId("front-page-header");
    expect(screen.queryByTestId("front-page-publish-offer")).toBeNull();
  });

  it("a refused page is never shown; the violations are", async () => {
    state.print.mockResolvedValue({
      status: "refused",
      violations: [{ kind: "QUOTE", detail: "not found verbatim in any source event", excerpt: "made up" }],
      changes: [],
    });
    renderWithProviders(<FrontPagePage />);
    await waitFor(() => expect(screen.getByTestId("front-page-print")).not.toBeDisabled());
    fireEvent.click(screen.getByTestId("front-page-print"));
    expect(await screen.findByTestId("front-page-refused")).toBeInTheDocument();
    expect(screen.getByText("made up")).toBeInTheDocument();
    expect(screen.queryByTestId("front-page-frame")).toBeNull();
  });

  it("asks once, before the first publish, that the Observer is public; then publishes the clean paper", async () => {
    state.print.mockResolvedValue({
      ...printed,
      html: '<html><body><h2 class="lead-head">Relays went quiet</h2></body></html>',
    });
    renderWithProviders(<FrontPagePage />);
    await waitFor(() => expect(screen.getByTestId("front-page-print")).not.toBeDisabled());
    expect(screen.getByTestId("front-page-publish-switch")).toHaveAttribute("data-state", "checked");
    fireEvent.click(screen.getByTestId("front-page-print"));

    // Nothing goes out before the reader says yes.
    const notice = await screen.findByTestId("front-page-observer-notice");
    expect(notice).toHaveTextContent("public");
    expect(state.publish).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("front-page-observer-notice-ok"));
    expect(screen.queryByTestId("front-page-observer-notice")).toBeNull();
    expect(localStorage.getItem(`frontPage:observerNotice:${"a".repeat(64)}`)).toBe("1");

    await waitFor(() => expect(state.publish).toHaveBeenCalledTimes(1));
    expect(state.publish.mock.calls[0][0]).toMatchObject({
      pubkey: "a".repeat(64),
      name: "Lira",
      headline: "Relays went quiet",
      code: "4F2A9C",
      posts: 2,
      quotesVerified: 3,
      model: "anthropic/claude-sonnet-4.5",
    });
    expect(await screen.findByTestId("front-page-publish-status")).toHaveTextContent("On your Observer");

    fireEvent.click(screen.getByTestId("front-page-info"));
    const links = await screen.findByTestId("front-page-observer-links");
    expect(links.querySelector("a")?.getAttribute("href")).toMatch(/observer\.nsite\.lol$/);
  });

  it("with publishing turned off, prints without publishing and remembers the choice", async () => {
    state.print.mockResolvedValue(printed);
    renderWithProviders(<FrontPagePage />);
    await waitFor(() => expect(screen.getByTestId("front-page-print")).not.toBeDisabled());
    fireEvent.click(screen.getByTestId("front-page-publish-switch"));
    expect(localStorage.getItem(`frontPage:publish:${"a".repeat(64)}`)).toBe("off");
    fireEvent.click(screen.getByTestId("front-page-print"));
    await screen.findByTestId("front-page-frame");
    expect(state.publish).not.toHaveBeenCalled();
  });

  it("“Not now” publishes nothing, and asks again next time", async () => {
    state.print.mockResolvedValue(printed);
    renderWithProviders(<FrontPagePage />);
    await waitFor(() => expect(screen.getByTestId("front-page-print")).not.toBeDisabled());
    fireEvent.click(screen.getByTestId("front-page-print"));
    fireEvent.click(await screen.findByTestId("front-page-observer-notice-later"));
    expect(screen.queryByTestId("front-page-observer-notice")).toBeNull();
    expect(state.publish).not.toHaveBeenCalled();
    expect(localStorage.getItem(`frontPage:observerNotice:${"a".repeat(64)}`)).toBeNull();
  });

  it("turning publishing off while the paper is written keeps that paper private", async () => {
    localStorage.setItem(`frontPage:observerNotice:${"a".repeat(64)}`, "1");
    let finish: (v: unknown) => void = () => {};
    state.print.mockReturnValue(new Promise((r) => (finish = r)));
    renderWithProviders(<FrontPagePage />);
    await waitFor(() => expect(screen.getByTestId("front-page-print")).not.toBeDisabled());
    fireEvent.click(screen.getByTestId("front-page-print"));
    fireEvent.click(screen.getByTestId("front-page-publish-switch"));
    finish(printed);
    await screen.findByTestId("front-page-frame");
    expect(state.publish).not.toHaveBeenCalled();
  });

  it("with no Blossom server list, publishes nothing and points to where servers are added", async () => {
    localStorage.setItem(`frontPage:observerNotice:${"a".repeat(64)}`, "1");
    const { PublishError } = await import("@/services/observerSite");
    state.print.mockResolvedValue(printed);
    state.publish.mockRejectedValueOnce(new PublishError("no servers", "no-servers"));
    renderWithProviders(<FrontPagePage />);
    await waitFor(() => expect(screen.getByTestId("front-page-print")).not.toBeDisabled());
    fireEvent.click(screen.getByTestId("front-page-print"));
    const add = await screen.findByTestId("front-page-publish-add-server");
    expect(add.getAttribute("href")).toBe("/settings?tab=messages&focus=file-servers");
  });

  it("an account switch starts the page over: no paper, site or publish of the last account's", async () => {
    localStorage.setItem(`frontPage:observerNotice:${"a".repeat(64)}`, "1");
    state.print.mockResolvedValue(printed);
    const view = renderWithProviders(<FrontPagePage />);
    await waitFor(() => expect(screen.getByTestId("front-page-print")).not.toBeDisabled());
    fireEvent.click(screen.getByTestId("front-page-print"));
    await screen.findByTestId("front-page-frame");
    await waitFor(() => expect(state.publish).toHaveBeenCalledTimes(1));

    state.user = { pubkey: "b".repeat(64), npub: "npub1other", displayName: "Other" };
    view.rerender(<FrontPagePage />);
    expect(screen.queryByTestId("front-page-frame")).toBeNull();
    expect(screen.queryByTestId("front-page-publish-status")).toBeNull();
    expect(screen.getByTestId("front-page-hero")).toBeInTheDocument();
  });

  it("never sends the last provider's model to a new key while its list loads", async () => {
    const view = renderWithProviders(<FrontPagePage />);
    await waitFor(() => expect(screen.getByTestId("front-page-print")).not.toBeDisabled());
    state.modelsFor = () => new Promise(() => {});
    state.keys = { status: "ready", keys: [{ key: "sk-ant-x", url: "https://api.anthropic.com/v1" }] };
    view.rerender(<FrontPagePage />);
    // The new key's list hasn't come: there is no model to print with, so no Print.
    expect(screen.getByTestId("front-page-print")).toBeDisabled();
  });

  it("a failed publish keeps the paper and offers Retry", async () => {
    localStorage.setItem(`frontPage:observerNotice:${"a".repeat(64)}`, "1");
    state.print.mockResolvedValue(printed);
    state.publish.mockRejectedValueOnce(new Error("boom"));
    renderWithProviders(<FrontPagePage />);
    await waitFor(() => expect(screen.getByTestId("front-page-print")).not.toBeDisabled());
    fireEvent.click(screen.getByTestId("front-page-print"));
    expect(await screen.findByTestId("front-page-publish-retry")).toBeInTheDocument();
    expect(screen.getByTestId("front-page-frame")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("front-page-publish-retry"));
    await waitFor(() => expect(state.publish).toHaveBeenCalledTimes(2));
  });

  it("lists past editions newest first and reads one in the paper's place, with Download", async () => {
    state.site = siteWith([
      todayEntry("3", { code: "NOW003", headline: "Today's lead" }),
      { day: "2026-11-09", path: "/2026-11-09.html", sha256: hash("1"), code: "OLD001" },
      {
        day: "2026-11-10",
        path: "/2026-11-10.html",
        sha256: hash("2"),
        code: "NEW002",
        headline: "Relays went quiet",
        printedAt: 1_794_300_000,
      },
    ]);
    state.fetchBlob.mockImplementation((sha: string) =>
      Promise.resolve(`<html><body><p>edition ${sha.slice(0, 1)}</p></body></html>`),
    );
    renderWithProviders(<FrontPagePage />);

    // Today's paper is the page; only it is fetched.
    await waitFor(() => expect(screen.getByTestId("front-page-frame").getAttribute("srcdoc")).toContain("edition 3"));
    expect(state.fetchBlob).toHaveBeenCalledTimes(1);
    expect(state.fetchBlob).toHaveBeenCalledWith(hash("3"), ["https://files.example"], expect.anything());

    fireEvent.click(screen.getByTestId("front-page-past"));
    const list = await screen.findByTestId("front-page-past-editions");
    const rows = within(list).getAllByTestId(/^front-page-past-edition-\d/);
    expect(rows.map((r) => r.getAttribute("data-testid"))).toEqual([
      "front-page-past-edition-2026-11-10",
      "front-page-past-edition-2026-11-09",
    ]);
    // Today's isn't listed among them.
    expect(within(list).queryByText("Today's lead")).toBeNull();
    expect(rows[0]).toHaveTextContent("Relays went quiet");
    expect(rows[1]).toHaveTextContent("Edition No. OLD001");

    fireEvent.click(rows[1]);
    const view = await screen.findByTestId("front-page-past-view");
    expect(window.location.search).toBe("?day=2026-11-09");
    await waitFor(() =>
      expect(within(view).getByTestId("front-page-frame").getAttribute("srcdoc")).toContain("edition 1"),
    );
    expect(screen.getAllByTestId("front-page-frame")).toHaveLength(1);
    expect(screen.queryByTestId("front-page-past-editions")).toBeNull();
    expect(screen.queryByTestId("front-page-today")).toBeNull();
    expect(screen.getByTestId("front-page-download")).not.toBeDisabled();
    // Print again is today's; a past edition offers the way back instead.
    expect(screen.queryByTestId("front-page-print-again")).toBeNull();
    fireEvent.click(screen.getByTestId("front-page-info"));
    expect(await screen.findByTestId("front-page-info-panel")).toHaveTextContent("No. OLD001");
    fireEvent.click(screen.getByTestId("front-page-back-today"));
    await waitFor(() => expect(screen.getByTestId("front-page-today")).toBeInTheDocument());
    expect(window.location.search).toBe("");
    expect(screen.getByTestId("front-page-frame").getAttribute("srcdoc")).toContain("edition 3");
  });

  it("the browser's Back from a past edition returns to today", async () => {
    state.site = siteWith([
      todayEntry("3"),
      { day: "2026-11-10", path: "/2026-11-10.html", sha256: hash("2"), headline: "Quiet day" },
    ]);
    state.fetchBlob.mockImplementation((sha: string) => Promise.resolve(`<p>edition ${sha.slice(0, 1)}</p>`));
    renderWithProviders(<FrontPagePage />);
    fireEvent.click(await screen.findByTestId("front-page-past"));
    fireEvent.click(await screen.findByTestId("front-page-past-edition-2026-11-10"));
    expect(await screen.findByTestId("front-page-past-view")).toBeInTheDocument();
    act(() => window.history.back());
    await waitFor(() => expect(screen.getByTestId("front-page-today")).toBeInTheDocument());
    expect(window.location.search).toBe("");
  });

  it("opens the day a link names, and says so when there is no edition for it", async () => {
    state.site = siteWith([{ day: "2026-11-10", path: "/2026-11-10.html", sha256: hash("2"), headline: "Quiet" }]);
    state.fetchBlob.mockResolvedValue("<p>edition 2</p>");
    window.history.replaceState(null, "", "/front-page?day=2026-11-10");
    const first = renderWithProviders(<FrontPagePage />);
    const view = await screen.findByTestId("front-page-past-view");
    await waitFor(() =>
      expect(within(view).getByTestId("front-page-frame").getAttribute("srcdoc")).toContain("edition 2"),
    );
    // Opened from a link: Back to today replaces it, to the print view (nothing today).
    fireEvent.click(screen.getByTestId("front-page-back-today"));
    expect(await screen.findByTestId("front-page-print-view")).toBeInTheDocument();
    first.unmount();

    window.history.replaceState(null, "", "/front-page?day=2026-01-01");
    renderWithProviders(<FrontPagePage />);
    expect(await screen.findByTestId("front-page-day-missing")).toBeInTheDocument();
    expect(screen.getByTestId("front-page-back-today")).toBeInTheDocument();
  });

  it("opens a past edition from the print view's link", async () => {
    state.site = siteWith([{ day: "2026-11-10", path: "/2026-11-10.html", sha256: hash("2"), headline: "Quiet day" }]);
    state.fetchBlob.mockResolvedValue("<html><body><p>edition 2</p></body></html>");
    renderWithProviders(<FrontPagePage />);
    fireEvent.click(await screen.findByTestId("front-page-past-editions-open"));
    fireEvent.click(await screen.findByTestId("front-page-past-edition-2026-11-10"));
    const view = await screen.findByTestId("front-page-past-view");
    await waitFor(() =>
      expect(within(view).getByTestId("front-page-frame").getAttribute("srcdoc")).toContain("edition 2"),
    );
    expect(screen.getByTestId("front-page-back-today")).toBeInTheDocument();
  });

  it("with no servers to ask, asks none and remembers no failure", async () => {
    state.site = siteWith([todayEntry("2", { printedAt: undefined })], []);
    renderWithProviders(<FrontPagePage />);
    expect(await screen.findByTestId("front-page-frame-missing")).toBeInTheDocument();
    expect(state.fetchBlob).not.toHaveBeenCalled();
  });

  it("with no servers known yet, the edition is loading, not missing (audit, 2026-11-12)", async () => {
    state.site = { ...siteWith([todayEntry("2", { printedAt: undefined })], []), settled: false };
    renderWithProviders(<FrontPagePage />);
    expect(await screen.findByTestId("front-page-frame-loading")).toBeInTheDocument();
    expect(screen.queryByTestId("front-page-frame-missing")).toBeNull();
    expect(state.fetchBlob).not.toHaveBeenCalled();
  });

  describe("a print that outlives the page", () => {
    /** The print, held open: the test reports its events and finishes it. */
    function heldPrint() {
      const held = {
        finish: (_: unknown) => {},
        emit: (_: unknown) => {},
      };
      state.print.mockImplementation(
        (opts: { onEvent?: (e: unknown) => void }) =>
          new Promise((resolve) => {
            held.finish = resolve;
            held.emit = (e) => opts.onEvent?.(e);
          }),
      );
      return held;
    }

    it("keeps running when the reader leaves, and shows today's paper when they come back", async () => {
      const held = heldPrint();
      const first = renderWithProviders(<FrontPagePage />);
      await waitFor(() => expect(screen.getByTestId("front-page-print")).not.toBeDisabled());
      fireEvent.click(screen.getByTestId("front-page-print"));
      expect(await screen.findByTestId("front-page-progress")).toBeInTheDocument();
      expect(screen.getByTestId("front-page-keep-browsing")).toHaveTextContent(
        "You can keep browsing Brainstorm. Keep this tab open.",
      );
      // Elsewhere in the app: the page is gone, the print is not.
      first.unmount();
      const signal = (state.print.mock.calls[0][0] as { signal: AbortSignal }).signal;
      expect(signal.aborted).toBe(false);
      await act(async () => held.finish(printed));

      renderWithProviders(<FrontPagePage />);
      const frame = await screen.findByTestId("front-page-frame");
      expect(frame.getAttribute("srcdoc")).toContain("The Nostr Observer");
      expect(screen.getByTestId("front-page-today")).toBeInTheDocument();
      expect(state.print).toHaveBeenCalledTimes(1);
    });

    it("comes back to a print still running: its progress, not a second print", async () => {
      heldPrint();
      const first = renderWithProviders(<FrontPagePage />);
      await waitFor(() => expect(screen.getByTestId("front-page-print")).not.toBeDisabled());
      fireEvent.click(screen.getByTestId("front-page-print"));
      first.unmount();
      renderWithProviders(<FrontPagePage />);
      expect(screen.getByTestId("front-page-progress")).toBeInTheDocument();
      expect(screen.getByTestId("front-page-print")).toBeDisabled();
    });

    it("says Thinking, then Writing: the headline, with the details behind a disclosure", async () => {
      const held = heldPrint();
      renderWithProviders(<FrontPagePage />);
      await waitFor(() => expect(screen.getByTestId("front-page-print")).not.toBeDisabled());
      fireEvent.click(screen.getByTestId("front-page-print"));
      const write = (event: unknown) => act(async () => held.emit({ type: "write", round: 1, event }));
      await write({ type: "sent", streamed: true });
      await waitFor(() =>
        expect(screen.getByTestId("front-page-write-line")).toHaveTextContent("Waiting for the model…"),
      );
      await write({ type: "first-byte" });
      await write({ type: "reasoning", text: "The relay outage leads." });
      await waitFor(() => expect(screen.getByTestId("front-page-write-line")).toHaveTextContent("Thinking…"));
      expect(screen.getByTestId("front-page-progress-status")).toHaveTextContent("Thinking…");
      await write({ type: "content", text: "<h1>The Nostr Observer</h1><h2>Relays went quiet</h2>" });
      await waitFor(() =>
        expect(screen.getByTestId("front-page-write-line")).toHaveTextContent("Writing: Relays went quiet"),
      );

      const toggle = screen.getByTestId("front-page-details-toggle");
      expect(toggle).toHaveAttribute("aria-expanded", "false");
      expect(screen.queryByTestId("front-page-details")).toBeNull();
      fireEvent.click(toggle);
      expect(toggle).toHaveAttribute("aria-expanded", "true");
      const details = screen.getByTestId("front-page-details");
      expect(details).toHaveAttribute("aria-live", "off");
      expect(details).toHaveTextContent("OpenRouter · anthropic/claude-sonnet-4.5");
      expect(details).not.toHaveTextContent("sk-or-v1-x");
      expect(details).toHaveTextContent("Request sent");
      expect(details).toHaveTextContent("Section: Relays went quiet");
      expect(screen.getByTestId("front-page-thinking")).toHaveTextContent("The relay outage leads.");
      // Only the status line is a live region.
      expect(screen.getByTestId("front-page-progress-status")).toHaveAttribute("aria-live", "polite");
    });
  });

  describe("relative days", () => {
    it("names today's paper Today, with the full date for screen readers and in the details", async () => {
      state.site = siteWith([todayEntry("b")]);
      state.fetchBlob.mockResolvedValue(printed.html);
      renderWithProviders(<FrontPagePage />);
      await screen.findByTestId("front-page-frame");
      expect(screen.getByTestId("front-page-day")).toHaveTextContent("Today");
      const heading = screen.getByRole("heading", { level: 1 });
      const year = String(new Date().getFullYear());
      expect(heading).toHaveTextContent(year);
      fireEvent.click(screen.getByTestId("front-page-info"));
      expect(await screen.findByTestId("front-page-info-panel")).toHaveTextContent(year);
    });

    it("names past editions by relative day in the list and the toolbar", async () => {
      const yesterday = Math.floor(Date.now() / 1000) - 86_400;
      const day = new Date(yesterday * 1000).toISOString().slice(0, 10);
      state.site = siteWith([
        { day, path: `/${day}.html`, sha256: hash("2"), printedAt: yesterday, headline: "Quiet" },
      ]);
      state.fetchBlob.mockResolvedValue("<html><body>old</body></html>");
      renderWithProviders(<FrontPagePage />);
      fireEvent.click(await screen.findByTestId("front-page-past-editions-open"));
      const row = await screen.findByTestId(`front-page-past-edition-${day}`);
      expect(within(row).getByTestId("front-page-past-edition-day")).toHaveTextContent("Yesterday");
      fireEvent.click(row);
      await screen.findByTestId("front-page-past-view");
      expect(screen.getByTestId("front-page-day")).toHaveTextContent("Yesterday");
    });
  });
});

describe("FrontPagePage: settings and the Assistant through the schedule", () => {
  const ASSISTANT = "b".repeat(64);
  const OR = "https://openrouter.ai/api/v1";
  const scheduleWith = (privateTags: string[][], publicTags: string[][] = []) => {
    const doc = { public: publicTags, private: [["task", "observer"], ...privateTags] };
    return {
      status: "ready",
      doc,
      schedule: readTask(doc),
      eventId: "e1",
      createdAt: 1,
      runners: publicTags.filter((t) => t[0] === "p").map((t) => t[1]),
    };
  };

  beforeEach(() => {
    resetPrintJob();
    window.history.replaceState(null, "", "/front-page");
    sessionStorage.clear();
    localStorage.clear();
    state.keys = {
      status: "ready",
      keys: [
        { key: "sk-or-v1-first-1111", url: OR },
        { key: "sk-or-v1-second-a3f9", url: OR },
      ],
    };
    state.hasMywot = true;
    state.isSearchObserver = true;
    state.models = ["openai/gpt-4o-mini", "anthropic/claude-sonnet-4.5"];
    state.modelsFor = null;
    state.print.mockReset();
    state.site = { event: null, index: { v: 1, title: "", editions: [] }, servers: [], relays: [], reached: true };
    state.fetchBlob.mockReset().mockResolvedValue(null);
    state.schedule = { status: "none" };
    state.trustProvider = "brainstorm";
    state.siteLoad = null;
    state.updateSchedule.mockReset().mockResolvedValue({ success: true });
    state.runnerSite = null;
    state.runnerSiteFor.mockReset();
    state.user = { pubkey: "a".repeat(64), npub: "npub1lira", displayName: "Lira" };
  });

  it("prints with the key and model the schedule names", async () => {
    state.schedule = scheduleWith([
      ["param", "key", OR, "a3f9"],
      ["param", "model", "openai/gpt-4o-mini"],
    ]);
    state.print.mockResolvedValue(printed);
    renderWithProviders(<FrontPagePage />);
    await waitFor(() => expect(screen.getByTestId("front-page-print")).not.toBeDisabled());
    expect(screen.getByTestId("front-page-key")).toHaveTextContent("OpenRouter ····a3f9");
    fireEvent.click(screen.getByTestId("front-page-print"));
    await waitFor(() => expect(state.print).toHaveBeenCalled());
    expect(state.print.mock.calls[0][0]).toMatchObject({ model: "openai/gpt-4o-mini" });
    expect(state.print.mock.calls[0][0].key).toMatchObject({ key: "sk-or-v1-second-a3f9" });
    // Reading the settings writes nothing.
    expect(state.updateSchedule).not.toHaveBeenCalled();
  });

  it("writes a model picked here back to the schedule, so every app shares it", async () => {
    state.models = [];
    renderWithProviders(<FrontPagePage />);
    const input = await screen.findByTestId("front-page-model-input");
    fireEvent.change(input, { target: { value: "llama3.3" } });
    // Not per keystroke: once the field is left.
    expect(state.updateSchedule).not.toHaveBeenCalled();
    await act(async () => fireEvent.blur(input));
    expect(state.updateSchedule).toHaveBeenCalledTimes(1);
    const change = state.updateSchedule.mock.calls[0][0] as (d: unknown) => { private: string[][] };
    expect(change({ public: [], private: [["task", "observer"]] }).private).toContainEqual([
      "param",
      "model",
      "llama3.3",
    ]);
  });

  it("writes a typed model once when Enter is pressed and the field then left (audit, 2026-11-12)", async () => {
    state.models = [];
    renderWithProviders(<FrontPagePage />);
    const input = await screen.findByTestId("front-page-model-input");
    fireEvent.change(input, { target: { value: "llama3.3" } });
    await act(async () => fireEvent.keyDown(input, { key: "Enter" }));
    await act(async () => fireEvent.blur(input));
    expect(state.updateSchedule).toHaveBeenCalledTimes(1);
  });

  it("holds the pickers while a setting is being saved (audit, 2026-11-12)", async () => {
    state.models = [];
    let finish: (v: unknown) => void = () => undefined;
    state.updateSchedule.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    renderWithProviders(<FrontPagePage />);
    const input = await screen.findByTestId("front-page-model-input");
    expect(screen.getByTestId("front-page-key")).not.toBeDisabled();
    fireEvent.change(input, { target: { value: "llama3.3" } });
    await act(async () => fireEvent.blur(input));
    expect(screen.getByTestId("front-page-setting-saving")).toBeInTheDocument();
    expect(screen.getByTestId("front-page-key")).toBeDisabled();
    expect(input).toHaveAttribute("readonly");
    await act(async () => finish({ success: true }));
    expect(screen.getByTestId("front-page-key")).not.toBeDisabled();
    expect(input).not.toHaveAttribute("readonly");
  });

  it("says when a picked setting couldn't be saved for the other apps", async () => {
    state.models = [];
    state.updateSchedule.mockResolvedValue({ success: false, error: "Only 1 of your 3 write relays answered." });
    renderWithProviders(<FrontPagePage />);
    const input = await screen.findByTestId("front-page-model-input");
    fireEvent.change(input, { target: { value: "llama3.3" } });
    await act(async () => fireEvent.blur(input));
    expect(await screen.findByTestId("front-page-setting-error")).toHaveTextContent("Used here only");
  });

  it("remembers a model per account, and drops one remembered before accounts (audit, 2026-11-12)", async () => {
    state.models = [];
    // From before the key named its account: nobody can tell whose it is.
    localStorage.setItem(`frontPage:model:${OR}`, "legacy/model");
    const view = renderWithProviders(<FrontPagePage />);
    const input = (await screen.findByTestId("front-page-model-input")) as HTMLInputElement;
    expect(input.value).toBe("");
    expect(localStorage.getItem(`frontPage:model:${OR}`)).toBeNull();

    fireEvent.change(input, { target: { value: "model-of-a" } });
    expect(localStorage.getItem(`frontPage:model:${"a".repeat(64)}:${OR}`)).toBe("model-of-a");
    await act(async () => fireEvent.blur(input));
    // The migration writes only this account's own remembered model.
    const change = state.updateSchedule.mock.calls[0][0] as (d: unknown) => { private: string[][] };
    expect(change({ public: [], private: [["task", "observer"]] }).private).not.toContainEqual([
      "param",
      "model",
      "legacy/model",
    ]);

    // Another account on this browser doesn't see it, nor sign it into its schedule.
    state.updateSchedule.mockClear();
    state.user = { pubkey: "b".repeat(64), npub: "npub1other", displayName: "Other" };
    view.rerender(<FrontPagePage />);
    const theirs = (await screen.findByTestId("front-page-model-input")) as HTMLInputElement;
    expect(theirs.value).toBe("");
  });

  it("with no runner, reads only the reader's own site", async () => {
    renderWithProviders(<FrontPagePage />);
    await screen.findByTestId("front-page-print-view");
    expect(state.runnerSiteFor).not.toHaveBeenCalled();
  });

  it("reads the Assistant's site when the schedule names it, and shows today's paper from it", async () => {
    state.schedule = scheduleWith([["cron", "0 6 * * *", "UTC", "1"]], [["p", ASSISTANT]]);
    state.runnerSite = { ...siteWith([todayEntry("c")]), reached: true };
    state.fetchBlob.mockResolvedValue(printed.html);
    renderWithProviders(<FrontPagePage />);
    const frame = await screen.findByTestId("front-page-frame");
    expect(frame.getAttribute("srcdoc")).toContain("The Nostr Observer");
    expect(state.runnerSiteFor).toHaveBeenCalledWith(ASSISTANT, "a".repeat(64));
    expect(state.fetchBlob.mock.calls[0][0]).toBe(hash("c"));
  });

  it("a new copy of the same servers doesn't restart an edition's download (audit, 2026-11-12)", async () => {
    state.schedule = scheduleWith([["cron", "0 6 * * *", "UTC", "1"]], [["p", ASSISTANT]]);
    state.runnerSite = { ...siteWith([todayEntry("c")]), reached: true };
    state.fetchBlob.mockReturnValue(new Promise(() => {}));
    const view = renderWithProviders(<FrontPagePage />);
    await waitFor(() => expect(state.fetchBlob).toHaveBeenCalledTimes(1));
    view.rerender(<FrontPagePage />);
    view.rerender(<FrontPagePage />);
    expect(state.fetchBlob).toHaveBeenCalledTimes(1);
    expect((state.fetchBlob.mock.calls[0][2] as { signal: AbortSignal }).signal.aborted).toBe(false);
  });

  it("never reads a runner's site with a conflict", async () => {
    state.schedule = scheduleWith(
      [],
      [
        ["p", ASSISTANT],
        ["p", "c".repeat(64)],
      ],
    );
    renderWithProviders(<FrontPagePage />);
    await screen.findByTestId("front-page-print-view");
    expect(state.runnerSiteFor).not.toHaveBeenCalled();
  });
});
