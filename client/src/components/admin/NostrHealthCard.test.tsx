import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const PUBKEY = "a".repeat(64);
const ASSISTANT = "b".repeat(64);

let website = "javascript:alert(document.domain)";

vi.mock("@/services/nostr", () => ({
  checkNip85Health: () => new Promise(() => {}),
  getNip85RelayUrl: () => "wss://nip85.test.invalid",
  fetchProfileEvent: async (pubkey: string) => ({
    id: "e".repeat(64),
    kind: 0,
    pubkey,
    created_at: 1,
    tags: [],
    sig: "",
    content: JSON.stringify({ name: "someone", website }),
  }),
}));

const { NostrHealthCard } = await import("./NostrHealthCard");

function show() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <NostrHealthCard pubkey={PUBKEY} taPubkey={ASSISTANT} />
    </QueryClientProvider>,
  );
}

describe("NostrHealthCard", () => {
  it("shows a profile's website as text, never as a link, when it isn't a web address", async () => {
    website = "javascript:alert(document.domain)";
    show();
    await waitFor(() => expect(screen.getAllByText("javascript:alert(document.domain)")).toHaveLength(2));
    const shown = screen.getAllByText("javascript:alert(document.domain)");
    for (const el of shown) expect(el.closest("a")).toBeNull();
    expect(screen.queryByTestId("link-kind0-website")).toBeNull();
    expect(screen.queryByTestId("link-assistant-website")).toBeNull();
  });

  it("still links a web address", async () => {
    website = "https://brainstorm.world";
    show();
    expect(await screen.findByTestId("link-kind0-website")).toHaveAttribute("href", "https://brainstorm.world");
    expect(await screen.findByTestId("link-assistant-website")).toHaveAttribute("href", "https://brainstorm.world");
  });
});
