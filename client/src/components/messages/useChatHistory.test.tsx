import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useChatHistory } from "./useChatHistory";
import type { DmEngine, DmEngineState } from "@/services/dm/engine";

const state = (relayState = "idle") =>
  ({
    status: "ready",
    liveSettled: true,
    history: { relays: [{ url: "wss://a/", state: relayState, reachedUntil: 100, completeTo: 100 }] },
  }) as unknown as DmEngineState;

const engineStub = () =>
  ({ advanceAll: vi.fn(() => true) }) as unknown as DmEngine & { advanceAll: ReturnType<typeof vi.fn> };

type Props = { room: string; visible: boolean | null };
const render = (engine: DmEngine, initialProps: Props) =>
  renderHook(({ room, visible }: Props) => useChatHistory(engine, state(), room, 0, visible), { initialProps });

describe("useChatHistory", () => {
  it("a chat that opens with the markers in view waits for Continue", () => {
    const engine = engineStub();
    const hook = render(engine, { room: "A", visible: null });
    hook.rerender({ room: "A", visible: true });
    expect(hook.result.current.phase).toBe("paused");
    hook.rerender({ room: "B", visible: true });
    hook.rerender({ room: "A", visible: true });
    expect(hook.result.current.phase).toBe("paused");
    expect(engine.advanceAll).not.toHaveBeenCalled();

    act(() => hook.result.current.resume());
    expect(engine.advanceAll).toHaveBeenCalledTimes(1);
    expect(hook.result.current.phase).toBe("auto");
  });

  it("scrolling up to the markers still pages on its own", () => {
    const engine = engineStub();
    const hook = render(engine, { room: "A", visible: false });
    expect(engine.advanceAll).not.toHaveBeenCalled();
    hook.rerender({ room: "A", visible: true });
    expect(engine.advanceAll).toHaveBeenCalledTimes(1);
    expect(hook.result.current.phase).toBe("auto");
  });

  it("a paused chat the reader scrolls away from pages when they come back up", () => {
    const engine = engineStub();
    const hook = render(engine, { room: "A", visible: true });
    expect(hook.result.current.phase).toBe("paused");
    hook.rerender({ room: "A", visible: false });
    expect(hook.result.current.phase).toBe("idle");
    hook.rerender({ room: "A", visible: true });
    expect(engine.advanceAll).toHaveBeenCalledTimes(1);
  });

  it("a paused chat whose relays are all done says it's the start", () => {
    const engine = engineStub();
    const hook = renderHook(() => useChatHistory(engine, state("done"), "A", 0, true));
    expect(hook.result.current.phase).toBe("end");
  });
});
