/**
 * Settings › Assistants › AI model: what a reader sees of their saved keys (never the
 * key itself), and that the form only offers Save once there is something to save.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { AgentKeysState } from "@/hooks/useAgentKeys";

const state = vi.fn<() => AgentKeysState>();
const reveal = vi.fn();
const updateAgentKeys = vi.fn();
const testAgentKey = vi.fn();
const startOpenRouterConnect = vi.fn();

vi.mock("@/hooks/useAgentKeys", () => ({ useAgentKeys: () => ({ ...state(), reveal }) }));
vi.mock("@/services/agentKeys", () => ({
  updateAgentKeys: (...args: unknown[]) => updateAgentKeys(...args),
  testAgentKey: (...args: unknown[]) => testAgentKey(...args),
}));
vi.mock("@/services/openRouterOAuth", () => ({
  startOpenRouterConnect: () => startOpenRouterConnect(),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

import { clearHandoff, handOff, peekHandoff } from "@/lib/openRouterOAuth";
import { AiModelTab } from "./AiModelTab";

const SECRET = "sk-or-v1-0123456789abcdef";

beforeEach(() => {
  vi.clearAllMocks();
  updateAgentKeys.mockResolvedValue({ success: true });
  testAgentKey.mockResolvedValue({ status: "ok", models: null });
  clearHandoff();
});

describe("AiModelTab", () => {
  it("lists saved keys masked, the first one preferred", () => {
    state.mockReturnValue({
      status: "ready",
      keys: [
        { key: SECRET, url: "https://openrouter.ai/api/v1" },
        { key: "", url: "http://localhost:11434/v1" },
      ],
    });
    render(<AiModelTab />);

    const rows = screen.getAllByTestId("ai-model-key-row");
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText("OpenRouter")).toBeTruthy();
    expect(within(rows[0]).getByTestId("ai-model-preferred")).toBeTruthy();
    expect(within(rows[1]).queryByTestId("ai-model-preferred")).toBeNull();
    expect(within(rows[1]).getByTestId("ai-model-make-preferred")).toBeTruthy();
    expect(document.body.textContent).not.toContain(SECRET);
    expect(document.body.textContent).toContain("sk-or-…cdef");
  });

  it("asks before decrypting a locked account's keys", () => {
    state.mockReturnValue({ status: "locked" });
    render(<AiModelTab />);

    fireEvent.click(screen.getByTestId("ai-model-reveal"));
    expect(reveal).toHaveBeenCalled();
    expect(screen.queryByTestId("ai-model-add")).toBeNull();
  });

  it("offers Save for OpenRouter only once a key is typed, and saves it", async () => {
    state.mockReturnValue({ status: "none" });
    render(<AiModelTab />);

    const save = screen.getByTestId("ai-model-save") as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    expect(screen.getByTestId("ai-model-preset-url").textContent).toBe("https://openrouter.ai/api/v1");

    fireEvent.change(screen.getByTestId("ai-model-key"), { target: { value: SECRET } });
    expect(save.disabled).toBe(false);
    fireEvent.click(save);

    await vi.waitFor(() => expect(updateAgentKeys).toHaveBeenCalledTimes(1));
    const change = updateAgentKeys.mock.calls[0][0] as (keys: unknown[]) => unknown[];
    expect(change([])).toEqual([{ key: SECRET, url: "https://openrouter.ai/api/v1" }]);
  });

  it("doesn't offer editing over keys it can't read", () => {
    state.mockReturnValue({ status: "unreadable" });
    render(<AiModelTab />);

    expect(screen.getByTestId("ai-model-unreadable")).toBeTruthy();
    expect(screen.queryByTestId("ai-model-add")).toBeNull();
  });

  it("offers Connect with OpenRouter for OpenRouter only", async () => {
    state.mockReturnValue({ status: "none" });
    startOpenRouterConnect.mockResolvedValue(true);
    render(<AiModelTab />);

    fireEvent.click(screen.getByTestId("ai-model-openrouter-connect"));
    await vi.waitFor(() => expect(startOpenRouterConnect).toHaveBeenCalledTimes(1));
  });

  it("fills and tests a key OpenRouter handed over, and leaves saving to the user", async () => {
    handOff({ key: SECRET });
    state.mockReturnValue({ status: "none" });
    render(<AiModelTab />);

    expect((screen.getByTestId("ai-model-key") as HTMLInputElement).value).toBe(SECRET);
    await vi.waitFor(() =>
      expect(testAgentKey).toHaveBeenCalledWith({ key: SECRET, url: "https://openrouter.ai/api/v1" }),
    );
    expect((await screen.findByTestId("ai-model-test-result")).textContent).toContain("It works");
    expect(updateAgentKeys).not.toHaveBeenCalled();
    expect(peekHandoff()).toBeNull();
    expect((screen.getByTestId("ai-model-save") as HTMLButtonElement).disabled).toBe(false);
  });

  it("says why when OpenRouter didn't hand a key over", () => {
    handOff({ error: "declined" });
    state.mockReturnValue({ status: "none" });
    render(<AiModelTab />);

    expect(screen.getByTestId("ai-model-test-result").textContent).toContain("didn't give Brainstorm a key");
    expect(testAgentKey).not.toHaveBeenCalled();
  });
});
