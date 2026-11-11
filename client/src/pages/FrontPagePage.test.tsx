import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
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
}));

vi.mock("@/components/AppHeader", () => ({ AppHeader: () => null }));
vi.mock("@/components/Footer", () => ({ Footer: () => null }));
vi.mock("@/accounts/login-flow", () => ({ logout: vi.fn() }));
vi.mock("@/hooks/useActiveAccountDisplay", () => ({
  useActiveAccountDisplay: () => state.user,
}));
vi.mock("@/hooks/useAgentKeys", () => ({ useAgentKeys: () => ({ ...state.keys, reveal: vi.fn() }) }));
vi.mock("@/hooks/useHasMywot", () => ({
  useHasMywot: () => ({ hasMywot: state.hasMywot, taPubkey: "t", known: true, isLoading: false }),
}));
vi.mock("@/hooks/useCanSearchMywot", () => ({
  useCanSearchMywot: () => ({
    hasMywot: state.hasMywot,
    isSearchObserver: state.isSearchObserver,
    canUseMywot: state.hasMywot && state.isSearchObserver,
  }),
}));
vi.mock("@/services/frontPage", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchModels: (key: { url: string }) => (state.modelsFor ? state.modelsFor(key.url) : Promise.resolve(state.models)),
  printFrontPage: (...args: unknown[]) => state.print(...args),
}));

vi.mock("@/services/observerSite", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  loadObserverSite: () => Promise.resolve(state.site),
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

  it("without an AI key, points to the AI model settings and offers no Print", () => {
    state.keys = { status: "none" };
    renderWithProviders(<FrontPagePage />);
    expect(screen.getByTestId("front-page-blocked-no-key")).toBeInTheDocument();
    expect(screen.getByTestId("front-page-connect").getAttribute("href")).toBe("/settings?tab=assistants&view=ai");
    expect(screen.queryByTestId("front-page-print")).toBeNull();
  });

  it("while the rankings are still arriving, says so and offers no Print", () => {
    state.isSearchObserver = false;
    renderWithProviders(<FrontPagePage />);
    expect(screen.getByTestId("front-page-blocked-pending")).toBeInTheDocument();
    expect(screen.queryByTestId("front-page-print")).toBeNull();
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
