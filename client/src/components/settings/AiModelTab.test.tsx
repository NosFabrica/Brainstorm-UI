/**
 * Settings › Assistants › AI model: what a reader sees of their saved keys (never the
 * key itself), that a key tests itself as it is typed, and that Save is offered only
 * for something the provider didn't reject.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
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
const OPENROUTER = "https://openrouter.ai/api/v1";

beforeEach(() => {
  vi.clearAllMocks();
  updateAgentKeys.mockResolvedValue({ success: true });
  testAgentKey.mockResolvedValue({ status: "ok", models: 3 });
  clearHandoff();
});

afterEach(() => {
  vi.useRealTimers();
});

function pick(id: string) {
  fireEvent.click(screen.getByTestId("ai-model-other-providers"));
  fireEvent.click(screen.getByTestId(`ai-model-tile-${id}`));
}

describe("AiModelTab", () => {
  it("lists saved keys masked, the first one starred and named in the hero", () => {
    state.mockReturnValue({
      status: "ready",
      keys: [
        { key: SECRET, url: OPENROUTER },
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
    expect(screen.getByTestId("ai-model-status").textContent).toContain("Using OpenRouter");
    // A key-less local runner says where it runs instead of a blank second line.
    expect(within(rows[1]).getByText("Local · no key")).toBeTruthy();
    expect(document.body.textContent).not.toContain(SECRET);
    expect(document.body.textContent).toContain("sk-or-…cdef");
  });

  it("makes a key preferred from its star", async () => {
    state.mockReturnValue({
      status: "ready",
      keys: [
        { key: SECRET, url: OPENROUTER },
        { key: "sk-ant-0123456789", url: "https://api.anthropic.com/v1" },
      ],
    });
    render(<AiModelTab />);

    fireEvent.click(within(screen.getAllByTestId("ai-model-key-row")[1]).getByTestId("ai-model-make-preferred"));
    await vi.waitFor(() => expect(updateAgentKeys).toHaveBeenCalledTimes(1));
    const change = updateAgentKeys.mock.calls[0][0] as (keys: unknown[]) => { url: string }[];
    expect(
      change([
        { key: SECRET, url: OPENROUTER },
        { key: "sk-ant-0123456789", url: "https://api.anthropic.com/v1" },
      ])[0].url,
    ).toBe("https://api.anthropic.com/v1");
  });

  it("starts empty with a Connect OpenRouter call to action", async () => {
    state.mockReturnValue({ status: "none" });
    startOpenRouterConnect.mockResolvedValue(true);
    render(<AiModelTab />);

    expect(screen.getByTestId("ai-model-status").textContent).toContain("Not connected");
    expect(screen.queryByTestId("ai-model-add")).toBeNull();
    fireEvent.click(screen.getByTestId("ai-model-openrouter-connect"));
    await vi.waitFor(() => expect(startOpenRouterConnect).toHaveBeenCalledTimes(1));
  });

  it("asks before decrypting a locked account's keys", () => {
    state.mockReturnValue({ status: "locked" });
    render(<AiModelTab />);

    fireEvent.click(screen.getByTestId("ai-model-reveal"));
    expect(reveal).toHaveBeenCalled();
    expect(screen.queryByTestId("ai-model-other-providers")).toBeNull();
    expect(screen.queryByTestId("ai-model-add")).toBeNull();
  });

  it("tests a typed key once typing stops, then offers Save", async () => {
    vi.useFakeTimers();
    state.mockReturnValue({ status: "none" });
    render(<AiModelTab />);
    pick("openrouter");

    const save = screen.getByTestId("ai-model-save") as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    expect(screen.getByTestId("ai-model-get-key").getAttribute("href")).toBe("https://openrouter.ai/keys");

    fireEvent.change(screen.getByTestId("ai-model-key"), { target: { value: SECRET } });
    expect(testAgentKey).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(700);
    });
    expect(testAgentKey).toHaveBeenCalledWith({ key: SECRET, url: OPENROUTER });
    expect(screen.getByTestId("ai-model-test-result").textContent).toBe("Works · 3 models");
    expect(save.disabled).toBe(false);

    vi.useRealTimers();
    fireEvent.click(save);
    await vi.waitFor(() => expect(updateAgentKeys).toHaveBeenCalledTimes(1));
    const change = updateAgentKeys.mock.calls[0][0] as (keys: unknown[]) => unknown[];
    expect(change([])).toEqual([{ key: SECRET, url: OPENROUTER }]);
  });

  it("folds the grid away once a provider is picked, and Change brings it back empty", () => {
    state.mockReturnValue({ status: "none" });
    render(<AiModelTab />);
    pick("openai");

    expect(screen.queryByTestId("ai-model-provider")).toBeNull();
    fireEvent.change(screen.getByTestId("ai-model-key"), { target: { value: "sk-typed" } });
    fireEvent.click(screen.getByTestId("ai-model-change"));

    expect(screen.getByTestId("ai-model-provider")).toBeTruthy();
    expect(screen.queryByTestId("ai-model-key")).toBeNull();
    expect(screen.getByTestId("ai-model-tile-openai").getAttribute("aria-checked")).toBe("false");
    fireEvent.click(screen.getByTestId("ai-model-tile-openai"));
    expect((screen.getByTestId("ai-model-key") as HTMLInputElement).value).toBe("");
  });

  it("won't save a key the provider rejected", async () => {
    testAgentKey.mockResolvedValue({ status: "rejected" });
    state.mockReturnValue({ status: "none" });
    render(<AiModelTab />);
    pick("openai");

    const field = screen.getByTestId("ai-model-key");
    fireEvent.paste(field);
    fireEvent.change(field, { target: { value: "sk-wrong" } });
    expect(await screen.findByText("Key rejected")).toBeTruthy();
    expect((screen.getByTestId("ai-model-save") as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows the main six first, the rest behind More providers, local runners apart", () => {
    state.mockReturnValue({ status: "none" });
    render(<AiModelTab />);
    fireEvent.click(screen.getByTestId("ai-model-other-providers"));

    for (const id of [
      "openrouter",
      "anthropic",
      "openai",
      "gemini",
      "routstr",
      "ppq",
      "ollama",
      "lmstudio",
      "custom",
    ]) {
      expect(screen.getByTestId(`ai-model-tile-${id}`)).toBeTruthy();
    }
    expect(screen.queryByTestId("ai-model-tile-groq")).toBeNull();
    fireEvent.click(screen.getByTestId("ai-model-more-open"));
    expect(within(screen.getByTestId("ai-model-more")).getByTestId("ai-model-tile-groq")).toBeTruthy();
    // Two letters each, so OpenRouter, OpenAI and Ollama no longer share an "O".
    expect(screen.getByTestId("ai-model-tile-openrouter").textContent).toContain("OR");
    expect(screen.getByTestId("ai-model-tile-openai").textContent).toContain("OA");
    expect(screen.getByTestId("ai-model-tile-ollama").textContent).toContain("OL");
  });

  it("tests a local runner as soon as it is picked, with no key field", async () => {
    state.mockReturnValue({ status: "none" });
    render(<AiModelTab />);
    pick("ollama");

    expect(screen.queryByTestId("ai-model-key")).toBeNull();
    expect(screen.getByTestId("ai-model-local")).toBeTruthy();
    await vi.waitFor(() => expect(testAgentKey).toHaveBeenCalledWith({ key: "", url: "http://localhost:11434/v1" }));
  });

  it("doesn't offer editing over keys it can't read", () => {
    state.mockReturnValue({ status: "unreadable" });
    render(<AiModelTab />);

    expect(screen.getByTestId("ai-model-unreadable")).toBeTruthy();
    expect(screen.queryByTestId("ai-model-other-providers")).toBeNull();
  });

  it("fills and tests a key OpenRouter handed over, and leaves saving to the user", async () => {
    handOff({ key: SECRET });
    state.mockReturnValue({ status: "none" });
    render(<AiModelTab />);

    expect((screen.getByTestId("ai-model-key") as HTMLInputElement).value).toBe(SECRET);
    await vi.waitFor(() => expect(testAgentKey).toHaveBeenCalledWith({ key: SECRET, url: OPENROUTER }));
    expect((await screen.findByTestId("ai-model-test-result")).textContent).toContain("Works");
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
