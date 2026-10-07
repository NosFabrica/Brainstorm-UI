// @vitest-environment jsdom
/**
 * NIP-30 custom emoji, drawn where an event's text is: a note, a note read on
 * its own page, a markdown body, a private message and its reactions. An
 * event without emoji tags reads exactly as before.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import type { DmMessage } from "@/lib/dm/store";
import { CHAT_KIND, REACTION_KIND } from "@/lib/dm/giftWrap";

vi.mock("@/hooks/useRelayAuthProblems", () => ({ useRelayAuthProblems: () => new Map() }));

import { EmojiText } from "./custom-emoji";
import { NoteContent } from "@/components/share/NoteContent";
import { MarkdownBody } from "@/components/share/MarkdownBody";
import { MessageBubble } from "@/components/messages/MessageBubble";

const URL = "https://example.com/soapbox.png";
const TAGS = [["emoji", "soapbox", URL]];

const emoji = () => screen.queryAllByTestId("custom-emoji") as HTMLImageElement[];

describe("EmojiText", () => {
  it("draws a tagged shortcode inline, named by its shortcode", () => {
    render(<EmojiText text="gm :soapbox:" tags={TAGS} />);
    expect(emoji()).toHaveLength(1);
    expect(emoji()[0]).toHaveAttribute("src", URL);
    expect(emoji()[0]).toHaveAttribute("alt", ":soapbox:");
  });

  it("is the plain text without emoji tags", () => {
    const { container } = render(<EmojiText text="gm :soapbox:" tags={[]} />);
    expect(container.textContent).toBe("gm :soapbox:");
    expect(emoji()).toHaveLength(0);
  });

  it("falls back to the shortcode when the picture will not load", () => {
    const { container } = render(<EmojiText text="gm :soapbox:" tags={TAGS} />);
    fireEvent.error(emoji()[0]);
    expect(emoji()).toHaveLength(0);
    expect(container.textContent).toBe("gm :soapbox:");
  });
});

describe("note bodies", () => {
  it("a feed note draws its emoji", () => {
    renderWithProviders(<NoteContent content="Hello :soapbox: world" tags={TAGS} />);
    expect(emoji()).toHaveLength(1);
  });

  it("a note read on its page draws them too", () => {
    renderWithProviders(<NoteContent content={"Title line\n\nHello :soapbox: world"} tags={TAGS} reading />);
    expect(emoji()).toHaveLength(1);
  });

  it("a note without the tag keeps the words", () => {
    renderWithProviders(<NoteContent content="Hello :soapbox: world" />);
    expect(emoji()).toHaveLength(0);
    expect(screen.getByText("Hello :soapbox: world")).toBeInTheDocument();
  });
});

describe("markdown bodies", () => {
  it("draws emoji in prose but never in code", () => {
    render(<MarkdownBody text={"Shipped :soapbox:\n\n`:soapbox:` is the code"} tags={TAGS} />);
    expect(emoji()).toHaveLength(1);
    expect(screen.getByText(":soapbox:", { selector: "code" })).toBeInTheDocument();
  });

  it("leaves an author's own image a picture, not an emoji", () => {
    render(<MarkdownBody text="![chart](https://example.com/chart.png)" tags={TAGS} />);
    expect(emoji()).toHaveLength(0);
    expect(screen.getByRole("img", { name: "chart" })).toBeInTheDocument();
  });
});

describe("private messages", () => {
  const ME = "m".repeat(64);
  const ANA = "a".repeat(64);
  const NOW = 1_800_000_000;
  const rumor = (id: string, kind: number, content: string, tags: string[][]) => ({
    id,
    kind,
    content,
    tags,
    pubkey: ANA,
    created_at: NOW,
  });
  const message = {
    id: "x",
    author: ANA,
    room: [ANA, ME].sort().join(","),
    kind: CHAT_KIND,
    createdAt: NOW,
    rumor: rumor("x", CHAT_KIND, "lunch :soapbox:?", TAGS),
  } as unknown as DmMessage;
  const reaction = {
    id: "r",
    author: ANA,
    room: message.room,
    kind: REACTION_KIND,
    createdAt: NOW,
    rumor: rumor("r", REACTION_KIND, ":soapbox:", [["e", "x"], ...TAGS]),
  } as unknown as DmMessage;

  it("draws the message's emoji and a custom-emoji reaction, and echoing it sends the emoji tag", () => {
    const onReact = vi.fn();
    render(
      <MessageBubble
        message={message}
        me={ME}
        group={false}
        profiles={new Map()}
        reactions={[reaction]}
        showAuthor={false}
        onReply={vi.fn()}
        onReact={onReact}
        onDetails={vi.fn()}
        onResend={vi.fn()}
        onDiscard={vi.fn()}
      />,
    );
    // One in the message, one on the reaction pill.
    expect(emoji()).toHaveLength(2);
    fireEvent.click(emoji()[1].closest("button")!);
    expect(onReact).toHaveBeenCalledWith(message, ":soapbox:", { code: "soapbox", url: URL });
  });
});
