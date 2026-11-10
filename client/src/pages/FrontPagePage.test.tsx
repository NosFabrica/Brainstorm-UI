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
  fetchModels: () => Promise.resolve(["openai/gpt-4o-mini", "anthropic/claude-sonnet-4.5"]),
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
    state.print.mockReset();
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
    expect(screen.getByText("No. 4F2A9C")).toBeInTheDocument();
    expect(screen.getByText("3 quotes verified")).toBeInTheDocument();
    expect(screen.getByTestId("front-page-changes").textContent).toContain("evil.example");
    // Kept for this tab only.
    expect(sessionStorage.getItem(`frontPage:last:${"a".repeat(64)}`)).toContain("4F2A9C");
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
