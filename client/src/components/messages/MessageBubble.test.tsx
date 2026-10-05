// @vitest-environment jsdom
/**
 * A message on a phone: holding it opens one menu — react, reply, copy, info —
 * the way every messenger does it. A tap no longer slides buttons in beside
 * the bubble (which squeezed it, shifted the thread, and pushed long bubbles
 * past the screen edge). Pointer hover keeps its buttons on desktop.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import type { DmMessage } from "@/lib/dm/store";
import { CHAT_KIND } from "@/lib/dm/giftWrap";

vi.mock("@/hooks/useRelayAuthProblems", () => ({ useRelayAuthProblems: () => new Map() }));

import { MessageBubble } from "./MessageBubble";

const ME = "m".repeat(64);
const ANA = "a".repeat(64);
const NOW = 1_800_000_000;
const message: DmMessage = {
  id: "x",
  author: ANA,
  room: [ANA, ME].sort().join(","),
  kind: CHAT_KIND,
  createdAt: NOW,
  rumor: { content: "lunch tomorrow?", kind: CHAT_KIND, tags: [], pubkey: ANA, created_at: NOW, id: "x" },
} as unknown as DmMessage;

const handlers = () => ({
  onReply: vi.fn(),
  onReact: vi.fn(),
  onDetails: vi.fn(),
  onResend: vi.fn(),
  onDiscard: vi.fn(),
});

function show(h = handlers()) {
  render(
    <MessageBubble
      message={message}
      me={ME}
      group={false}
      profiles={new Map()}
      reactions={[]}
      showAuthor={false}
      {...h}
    />,
  );
  return { h, bubble: screen.getByText("lunch tomorrow?") };
}

/** A finger held on the bubble for `ms`. */
function hold(el: Element, ms: number) {
  fireEvent.pointerDown(el, { pointerType: "touch", clientX: 10, clientY: 10 });
  act(() => {
    vi.advanceTimersByTime(ms);
  });
  fireEvent.pointerUp(el, { pointerType: "touch", clientX: 10, clientY: 10 });
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("MessageBubble on touch", () => {
  it("holding a message opens its menu, and Reply answers it", () => {
    const { h, bubble } = show();
    hold(bubble, 500);
    const sheet = screen.getByTestId("dm-message-sheet");
    fireEvent.click(within(sheet).getByRole("button", { name: "Reply" }));
    expect(h.onReply).toHaveBeenCalledWith(message);
  });

  it("reacts and copies from the menu", async () => {
    const writeText = vi.fn(async () => {});
    Object.assign(navigator, { clipboard: { writeText } });
    const { h, bubble } = show();
    hold(bubble, 500);
    fireEvent.click(within(screen.getByTestId("dm-message-sheet")).getByRole("button", { name: "React with 😂" }));
    expect(h.onReact).toHaveBeenCalledWith(message, "😂");

    hold(bubble, 500);
    fireEvent.click(within(screen.getByTestId("dm-message-sheet")).getByRole("button", { name: "Copy text" }));
    expect(writeText).toHaveBeenCalledWith("lunch tomorrow?");
  });

  it("a tap, or a hold cut short by scrolling, opens nothing", () => {
    const { bubble } = show();
    hold(bubble, 120);
    fireEvent.click(bubble);
    expect(screen.queryByTestId("dm-message-sheet")).toBeNull();

    fireEvent.pointerDown(bubble, { pointerType: "touch", clientX: 10, clientY: 10 });
    fireEvent.pointerMove(bubble, { pointerType: "touch", clientX: 10, clientY: 40 });
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(screen.queryByTestId("dm-message-sheet")).toBeNull();
  });

  it("keeps the hover buttons for a mouse", () => {
    show();
    expect(screen.getByRole("button", { name: "Reply" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Message details" })).toBeInTheDocument();
  });
});
