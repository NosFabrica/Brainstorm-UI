import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { readTask } from "@/lib/scheduledTasks";
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
  useObserverSchedule: () => ({ reveal: vi.fn(), refresh: vi.fn(), checkedAt: null, ...state.schedule }),
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
  printFrontPage: (...args: unknown[]) => state.print(...args),
}));

vi.mock("@/services/observerSite", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  loadObserverSite: () => (state.siteLoad ? state.siteLoad() : Promise.resolve(state.site)),
  publishToObserver: (...args: unknown[]) => state.publish(...args),
  fetchBlob: (...args: unknown[]) => state.fetchBlob(...args),
}));

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
      const day = new Date().toISOString().slice(0, 10);
      state.site = {
        event: { tags: [] },
        index: { v: 1, title: "", editions: [{ day, path: `/${day}.html`, sha256: "b".repeat(64) }] },
        servers: ["https://files.example"],
        relays: [],
      };
      renderWithProviders(<FrontPagePage />);
      await waitFor(() => expect(screen.getByTestId("front-page-setup")).toHaveTextContent("To print your paper"));
      expect(screen.getByTestId("front-page-setup")).not.toHaveTextContent("Before your first paper");
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
    // Reader-first: the hero gives way to a header with one quiet line of facts.
    expect(screen.queryByTestId("front-page-hero")).toBeNull();
    expect(screen.getByTestId("front-page-facts").textContent).toBe("2 posts · 3 quotes verified · 1 removed");
    // The edition number, model and what the check removed sit behind the info button.
    expect(screen.queryByText("No. 4F2A9C")).toBeNull();
    fireEvent.click(screen.getByTestId("front-page-info"));
    const info = await screen.findByTestId("front-page-info-panel");
    expect(info.textContent).toContain("No. 4F2A9C");
    expect(info.textContent).toContain("anthropic/claude-sonnet-4.5");
    expect(screen.getByTestId("front-page-changes").textContent).toContain("evil.example");
    // Kept for this tab only.
    expect(sessionStorage.getItem(`frontPage:last:${"a".repeat(64)}`)).toContain("4F2A9C");
  });

  it("says today's paper was already printed, with a way to read it, and still lets the reader print", async () => {
    const day = new Date().toISOString().slice(0, 10);
    state.site = {
      event: { tags: [] },
      index: {
        v: 1,
        title: "",
        editions: [
          // Printed now: today on any clock, whatever the hour the suite runs at.
          { day, path: `/${day}.html`, sha256: "b".repeat(64), printedAt: Math.floor(Date.now() / 1000) },
        ],
      },
      servers: ["https://files.example"],
      relays: [],
    };
    state.fetchBlob.mockResolvedValue(printed.html);
    renderWithProviders(<FrontPagePage />);

    expect(screen.getByTestId("front-page-schedule")).toHaveTextContent("Not scheduled");
    fireEvent.click(await screen.findByTestId("front-page-print-again"));
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

    state.schedule = scheduleIn(zoneAt(23));
    const late = renderWithProviders(<FrontPagePage />);
    fireEvent.click(await screen.findByTestId("front-page-print-again"));
    expect(await screen.findByTestId("front-page-printed-today")).toHaveTextContent("Already printed today");
    late.unmount();

    state.schedule = scheduleIn(zoneAt(12));
    renderWithProviders(<FrontPagePage />);
    fireEvent.click(await screen.findByTestId("front-page-print-again"));
    await waitFor(() => expect(screen.getByTestId("front-page-print")).not.toBeDisabled());
    expect(screen.queryByTestId("front-page-printed-today")).toBeNull();
  });

  it("a returning reader prints again from a dialog, and reads full screen", async () => {
    sessionStorage.setItem(
      `frontPage:last:${"a".repeat(64)}`,
      JSON.stringify({
        html: printed.html,
        code: "OLD001",
        printedAt: 1,
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

    const opener = screen.getByTestId("front-page-fullscreen");
    opener.focus();
    fireEvent.click(opener);
    const view = await screen.findByTestId("front-page-fullscreen-view");
    expect(view.getAttribute("role")).toBe("dialog");
    expect(view.querySelector("iframe")?.getAttribute("sandbox")).toBe("allow-popups allow-popups-to-escape-sandbox");
    // Focus moves into the reader and is held there.
    await waitFor(() => expect(view.contains(document.activeElement)).toBe(true));
    fireEvent.keyDown(view, { key: "Escape" });
    await waitFor(() => expect(screen.queryByTestId("front-page-fullscreen-view")).toBeNull());
    // ... and comes back to the button that opened it.
    await waitFor(() => expect(document.activeElement).toBe(opener));
  });

  it("clicking into the full-screen paper hands focus back so Esc still closes; tabbing in keeps it there", async () => {
    sessionStorage.setItem(
      `frontPage:last:${"a".repeat(64)}`,
      JSON.stringify({
        html: printed.html,
        code: "OLD001",
        printedAt: 1,
        events: 5,
        quotes: 1,
        rounds: 1,
        usage: null,
        changes: [],
      }),
    );
    renderWithProviders(<FrontPagePage />);
    fireEvent.click(screen.getByTestId("front-page-fullscreen"));
    const view = await screen.findByTestId("front-page-fullscreen-view");
    const frame = view.querySelector("iframe")!;

    // A click into the frame: focus lands on the frame and the window blurs.
    frame.focus();
    expect(document.activeElement).toBe(frame);
    fireEvent.blur(window);
    await waitFor(() => expect(document.activeElement).toBe(view));
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    await waitFor(() => expect(screen.queryByTestId("front-page-fullscreen-view")).toBeNull());

    // A keyboard user tabbing into the paper keeps focus there, to reach its links.
    fireEvent.click(screen.getByTestId("front-page-fullscreen"));
    const again = await screen.findByTestId("front-page-fullscreen-view");
    const frame2 = again.querySelector("iframe")!;
    fireEvent.keyDown(window, { key: "Tab" });
    frame2.focus();
    fireEvent.blur(window);
    await new Promise((r) => setTimeout(r, 20));
    expect(document.activeElement).toBe(frame2);
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

  it("reads earlier editions back from the Observer site, switched by day tabs", async () => {
    const hash = (c: string) => c.repeat(64);
    state.site = {
      event: { kind: 35128 },
      index: {
        v: 1,
        title: "Lira's Observer",
        editions: [
          {
            day: "2026-11-10",
            path: "/2026-11-10.html",
            sha256: hash("2"),
            code: "NEW002",
            posts: 40,
            quotesVerified: 2,
          },
          { day: "2026-11-09", path: "/2026-11-09.html", sha256: hash("1"), code: "OLD001" },
        ],
      },
      servers: ["https://files.example"],
      relays: [],
    };
    state.fetchBlob.mockImplementation((sha: string) =>
      Promise.resolve(`<html><body><p>edition ${sha.slice(0, 1)}</p></body></html>`),
    );
    renderWithProviders(<FrontPagePage />);

    const tabs = await screen.findByTestId("front-page-day-tabs");
    expect(tabs.querySelectorAll("[role=tab]")).toHaveLength(2);
    const frame = await screen.findByTestId("front-page-frame");
    expect(frame.getAttribute("srcdoc")).toContain("edition 2");
    expect(state.fetchBlob).toHaveBeenCalledWith(hash("2"), ["https://files.example"], expect.anything());
    expect(screen.getByTestId("front-page-facts").textContent).toBe("40 posts · 2 quotes verified");

    const older = screen.getByTestId("front-page-day-2026-11-09");
    fireEvent.mouseDown(older);
    fireEvent.click(older);
    await waitFor(() => expect(screen.getByTestId("front-page-frame").getAttribute("srcdoc")).toContain("edition 1"));
  });

  it("with no servers to ask, asks none and remembers no failure", async () => {
    state.site = {
      event: { kind: 35128 },
      index: { v: 1, title: "", editions: [{ day: "2026-11-10", path: "/2026-11-10.html", sha256: "2".repeat(64) }] },
      servers: [],
      relays: [],
    };
    renderWithProviders(<FrontPagePage />);
    expect(await screen.findByTestId("front-page-frame-missing")).toBeInTheDocument();
    expect(state.fetchBlob).not.toHaveBeenCalled();
  });
});
