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
  print: vi.fn(),
}));

vi.mock("@/components/AppHeader", () => ({ AppHeader: () => null }));
vi.mock("@/components/Footer", () => ({ Footer: () => null }));
vi.mock("@/accounts/login-flow", () => ({ logout: vi.fn() }));
vi.mock("@/hooks/useActiveAccountDisplay", () => ({
  useActiveAccountDisplay: () => ({ pubkey: "a".repeat(64), npub: "npub1lira", displayName: "Lira" }),
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
  fetchModels: () => Promise.resolve(state.models),
  printFrontPage: (...args: unknown[]) => state.print(...args),
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
    state.print.mockReset();
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

    fireEvent.click(screen.getByTestId("front-page-fullscreen"));
    const view = screen.getByTestId("front-page-fullscreen-view");
    expect(view.querySelector("iframe")?.getAttribute("sandbox")).toBe("allow-popups allow-popups-to-escape-sandbox");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByTestId("front-page-fullscreen-view")).toBeNull();
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
});
