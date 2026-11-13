/**
 * Settings › AI model › Your Assistant: the reader's keys beside their Assistant's, each
 * labelled by who holds it, and the two moves between them. Give: the Assistant's list
 * first, the reader's own only after (and only when asked). Take back: the reader's own
 * list first, so a key is never in neither. The server's 409, 404 and 502 each say what
 * they mean. No key is ever on screen beyond its last four characters.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { AssistantKeys as AssistantKeysValue } from "@/hooks/useAssistantAgentKeys";
import type { AgentKeysState } from "@/hooks/useAgentKeys";
import { withAgentKeys, type AgentKey } from "@/lib/agentKeys";

const editAssistantKeys = vi.fn();
const updateAgentKeys = vi.fn();
const toast = vi.fn();
vi.mock("@/services/assistantAgentKeys", () => ({
  editAssistantKeys: (...args: unknown[]) => editAssistantKeys(...args),
}));
vi.mock("@/services/agentKeys", () => ({ updateAgentKeys: (...args: unknown[]) => updateAgentKeys(...args) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));
vi.mock("@/accounts/signing", () => ({ activeAccount: () => ({ pubkey: "a".repeat(64) }) }));
vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { AssistantKeys, giveToAssistant, takeBackFromAssistant } from "./AssistantKeys";

const ASSISTANT = "b".repeat(64);
const OR = "https://openrouter.ai/api/v1";
const MINE: AgentKey = { key: "sk-or-v1-mine-0000-1111", url: OR };
const SHARED: AgentKey = { key: "sk-ant-shared-0000-2222", url: "https://api.anthropic.com/v1" };
const THEIRS: AgentKey = { key: "sk-or-v1-theirs-0000-3333", url: OR };

const wrote = vi.fn();
const reload = vi.fn();
const reveal = vi.fn();
const assistantState = (over: Partial<AssistantKeysValue> & { status: string }): AssistantKeysValue =>
  ({ reveal, reload, wrote, ...over }) as AssistantKeysValue;
const ready = (keys: AgentKey[]) =>
  assistantState({
    status: "ready",
    assistant: ASSISTANT,
    tags: withAgentKeys([], keys),
    keys,
    createdAt: 1794300000,
    id: "1".repeat(64),
  } as never);
const mine = (keys: AgentKey[]): AgentKeysState => ({ status: "ready", keys });

/** The edit the service was handed, run on `tags`. */
const lastChange = (tags: string[][]) =>
  (editAssistantKeys.mock.calls.at(-1)![1] as (t: string[][]) => string[][])(tags);
const lastMineChange = (keys: AgentKey[]) =>
  (updateAgentKeys.mock.calls.at(-1)![0] as (k: AgentKey[]) => AgentKey[])(keys);

beforeEach(() => {
  vi.clearAllMocks();
  editAssistantKeys.mockImplementation(async (_account: unknown, change: (t: string[][]) => string[][]) => ({
    status: "ok",
    assistant: ASSISTANT,
    tags: change(withAgentKeys([], [SHARED])),
    createdAt: 1794300100,
    id: "2".repeat(64),
  }));
  updateAgentKeys.mockResolvedValue({ success: true });
});

describe("the two lists", () => {
  it("labels each key by who holds it, showing only provider and last four characters", () => {
    render(<AssistantKeys mine={mine([MINE, SHARED])} assistant={ready([SHARED, THEIRS])} />);
    const rows = screen.getAllByTestId("ai-model-assistant-row");
    expect(rows.map((r) => within(r).getByTestId("ai-model-assistant-holder").textContent)).toEqual([
      "Only yours",
      "Yours and your Assistant's",
      "Only your Assistant's",
    ]);
    expect(within(rows[0]).getByText("····1111")).toBeTruthy();
    expect(within(rows[0]).getByTestId("ai-model-assistant-give")).toBeTruthy();
    expect(within(rows[1]).getByTestId("ai-model-assistant-take-back")).toBeTruthy();
    expect(within(rows[2]).getByTestId("ai-model-assistant-take-back")).toBeTruthy();
    for (const k of [MINE, SHARED, THEIRS]) expect(document.body.textContent).not.toContain(k.key.slice(0, 12));
    expect(screen.getByTestId("ai-model-assistant-note").textContent).toMatch(/revoke it at the provider/);
    expect(screen.getByTestId("ai-model-assistant-note").textContent).toMatch(/its own key with a spending limit/);
  });

  it("offers setting up the Assistant when there is none", () => {
    render(<AssistantKeys mine={mine([MINE])} assistant={assistantState({ status: "no-assistant" })} />);
    expect(screen.getByTestId("ai-model-assistant-setup").getAttribute("href")).toBe("/setup");
    expect(screen.queryByTestId("ai-model-assistant-row")).toBeNull();
  });

  it("says it isn't available yet when the server has no endpoint, and the tab stays", () => {
    render(<AssistantKeys mine={mine([MINE])} assistant={assistantState({ status: "unavailable" })} />);
    expect(screen.getByTestId("ai-model-assistant-unavailable").textContent).toMatch(/isn't available yet/);
  });

  it("offers Retry when the Assistant's relays didn't answer", () => {
    render(<AssistantKeys mine={mine([MINE])} assistant={assistantState({ status: "relays" })} />);
    fireEvent.click(screen.getByTestId("ai-model-assistant-retry"));
    expect(reload).toHaveBeenCalled();
  });

  it("asks before decrypting with a locked key", () => {
    render(<AssistantKeys mine={mine([MINE])} assistant={assistantState({ status: "locked" })} />);
    fireEvent.click(screen.getByTestId("ai-model-assistant-unlock"));
    expect(reveal).toHaveBeenCalled();
  });
});

describe("Give to Assistant", () => {
  it("adds the key to the Assistant's list and keeps it in the reader's", async () => {
    render(<AssistantKeys mine={mine([MINE])} assistant={ready([])} />);
    fireEvent.click(screen.getByTestId("ai-model-assistant-give"));
    await act(async () => fireEvent.click(screen.getByTestId("ai-model-assistant-give-confirm")));

    expect(editAssistantKeys).toHaveBeenCalledTimes(1);
    expect(lastChange([])).toEqual([["key", MINE.key, OR]]);
    expect(updateAgentKeys).not.toHaveBeenCalled();
    expect(wrote).toHaveBeenCalledWith(ASSISTANT, expect.any(Array), 1794300100, "2".repeat(64));
    // The edit builds on the version the screen holds, should the server's read lag behind it.
    expect(editAssistantKeys.mock.calls[0][2]).toEqual({
      assistant: ASSISTANT,
      tags: [],
      id: "1".repeat(64),
      createdAt: 1794300000,
    });
    await waitFor(() => expect(toast).toHaveBeenCalledWith({ title: "Given" }));
  });

  it('with "and remove it from mine", removes it from the reader\'s only after the Assistant has it', async () => {
    render(<AssistantKeys mine={mine([MINE, SHARED])} assistant={ready([SHARED])} />);
    fireEvent.click(screen.getByTestId("ai-model-assistant-give"));
    fireEvent.click(screen.getByTestId("ai-model-assistant-remove-mine"));
    await act(async () => fireEvent.click(screen.getByTestId("ai-model-assistant-give-confirm")));

    expect(editAssistantKeys).toHaveBeenCalledTimes(1);
    expect(updateAgentKeys).toHaveBeenCalledTimes(1);
    expect(editAssistantKeys.mock.invocationCallOrder[0]).toBeLessThan(updateAgentKeys.mock.invocationCallOrder[0]);
    expect(lastMineChange([MINE, SHARED])).toEqual([SHARED]);
  });

  it("removes nothing from the reader's when the Assistant didn't take it (409 twice, 404, 502)", async () => {
    for (const [outcome, words] of [
      [{ status: "conflict" }, /changed while this was saving/],
      [{ status: "no-assistant" }, /don't have an Assistant/],
      [{ status: "unavailable" }, /can't hand keys to your Assistant yet/],
      [{ status: "relays" }, /relays didn't answer/],
      [{ status: "busy" }, /couldn't save your Assistant's keys just now/],
    ] as const) {
      editAssistantKeys.mockResolvedValueOnce(outcome);
      const result = await giveToAssistant(MINE, { removeFromMine: true }, wrote);
      expect(result.ok).toBe(false);
      expect(result.problem).toMatch(words);
    }
    expect(updateAgentKeys).not.toHaveBeenCalled();
    expect(wrote).not.toHaveBeenCalled();
  });

  it("says nothing when the reader dismissed the unlock", async () => {
    editAssistantKeys.mockResolvedValueOnce({ status: "cancelled" });
    expect(await giveToAssistant(MINE, { removeFromMine: false }, wrote)).toMatchObject({ ok: false, problem: null });
  });

  it("offers Retry when the server's lock store was down (503), and Retry runs it again", async () => {
    editAssistantKeys.mockResolvedValueOnce({ status: "busy" });
    render(<AssistantKeys mine={mine([MINE])} assistant={ready([])} />);
    fireEvent.click(screen.getByTestId("ai-model-assistant-give"));
    await act(async () => fireEvent.click(screen.getByTestId("ai-model-assistant-give-confirm")));
    const shown = toast.mock.calls.at(-1)![0] as { title: string; action?: { props: { onClick: () => void } } };
    expect(shown.title).toBe("Couldn't save");
    expect(shown.action).toBeDefined();
    await act(async () => shown.action!.props.onClick());
    expect(editAssistantKeys).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(toast).toHaveBeenCalledWith({ title: "Given" }));
  });

  it("offers no Retry for what a retry won't change", async () => {
    editAssistantKeys.mockResolvedValueOnce({ status: "no-assistant" });
    expect((await giveToAssistant(MINE, { removeFromMine: false }, wrote)).retry).toBe(false);
  });
});

describe("Take back", () => {
  it("copies the key into the reader's list first, then posts the Assistant's without it", async () => {
    render(<AssistantKeys mine={mine([])} assistant={ready([THEIRS])} />);
    fireEvent.click(screen.getByTestId("ai-model-assistant-take-back"));
    expect(screen.getByTestId("ai-model-assistant-take-dialog").textContent).toMatch(/revoke it at the provider/);
    await act(async () => fireEvent.click(screen.getByTestId("ai-model-assistant-take-confirm")));

    expect(updateAgentKeys).toHaveBeenCalledTimes(1);
    expect(lastMineChange([])).toEqual([THEIRS]);
    expect(editAssistantKeys).toHaveBeenCalledTimes(1);
    expect(updateAgentKeys.mock.invocationCallOrder[0]).toBeLessThan(editAssistantKeys.mock.invocationCallOrder[0]);
    expect(lastChange(withAgentKeys([["note", "kept"]], [THEIRS, SHARED]))).toEqual([
      ["key", SHARED.key, SHARED.url],
      ["note", "kept"],
    ]);
    await waitFor(() => expect(toast).toHaveBeenCalledWith({ title: "Taken back" }));
  });

  it("leaves the Assistant's list alone when the reader's couldn't be saved", async () => {
    updateAgentKeys.mockResolvedValueOnce({ success: false, error: "Too few of your relays answered." });
    const result = await takeBackFromAssistant(THEIRS, wrote);
    expect(result).toEqual({ ok: false, problem: "Too few of your relays answered." });
    expect(editAssistantKeys).not.toHaveBeenCalled();
  });

  it("says the key is in both when the Assistant's list couldn't be changed", async () => {
    editAssistantKeys.mockResolvedValueOnce({ status: "relays" });
    const result = await takeBackFromAssistant(THEIRS, wrote);
    expect(result.ok).toBe(false);
    expect(result.problem).toMatch(/It's in your keys now, but your Assistant still has it/);
  });
});
