// @vitest-environment jsdom
/**
 * Settings › Brainstorm Assistant shows the server's `ta_pubkey` and nothing
 * else. Staging's card used to show production's Assistant, follow it, and
 * POST a profile for it, because the shared kind-30078 pointer had seeded
 * this browser's storage with it (#269). The link and the age come from the
 * Assistant's live kind 0, not from what was cached.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { nip19, type NostrEvent } from "nostr-tools";

const ME = "1".repeat(64);
const OURS = "a".repeat(64);
const THEIRS = "b".repeat(64);
const DAY = 24 * 60 * 60;

const kind0 = (pubkey: string, id: string, ageDays: number, content: Record<string, string>): NostrEvent => ({
  id,
  pubkey,
  kind: 0,
  created_at: Math.floor(Date.now() / 1000) - ageDays * DAY,
  tags: [],
  content: JSON.stringify(content),
  sig: "",
});

const h = vi.hoisted(() => ({
  mywot: { hasMywot: false, taPubkey: null as string | null, known: false, isLoading: true },
  live: {} as Record<string, { event: unknown; profile: unknown; loading: boolean }>,
  publishBrainstormAssistantProfile: vi.fn(async () => ({})),
  publishDefaultAssistantProfile: vi.fn(async () => ({})),
  followUser: vi.fn(async () => {}),
  refreshProfileEvent: vi.fn(async () => null),
}));
vi.mock("@/accounts/display", () => ({ activePubkey: () => ME }));
vi.mock("@/hooks/useActiveAccountDisplay", () => ({ useActiveAccountDisplay: () => ({ pubkey: ME }) }));
vi.mock("@/hooks/useHasMywot", () => ({ useHasMywot: () => h.mywot }));
vi.mock("@/hooks/useLiveProfile", () => ({
  useLiveProfile: (pubkey?: string) =>
    (pubkey && h.live[pubkey]) || { event: undefined, profile: undefined, loading: false },
}));
vi.mock("@/services/api", () => ({
  apiClient: {
    publishBrainstormAssistantProfile: h.publishBrainstormAssistantProfile,
    publishDefaultAssistantProfile: h.publishDefaultAssistantProfile,
  },
}));
vi.mock("@/services/socialActions", () => ({ followUser: h.followUser }));
vi.mock("@/services/nostr", () => ({ refreshProfileEvent: h.refreshProfileEvent }));

import { BrainstormAssistantCard } from "./BrainstormAssistantCard";
import { readPublishedAssistant, writeAssistantProfile, writePublishedAssistant } from "@/lib/assistantStorage";

function liveKind0(event: NostrEvent) {
  h.live[event.pubkey] = { event, profile: JSON.parse(event.content), loading: false };
}

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <BrainstormAssistantCard variant="settings" />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  h.live = {};
  Object.assign(h.mywot, { taPubkey: OURS, hasMywot: true, known: true, isLoading: false });
  h.publishBrainstormAssistantProfile.mockClear();
  h.followUser.mockClear();
});

describe("BrainstormAssistantCard", () => {
  it("never shows, follows or POSTs for another deployment's Assistant left in storage", async () => {
    writePublishedAssistant({ pubkey: THEIRS, npub: "", eventId: "c".repeat(64), publishedAt: 1_790_374_540_180 });
    writeAssistantProfile({ name: "garden_typical_040d" });
    // Theirs has no picture: the old card POSTed this backend's profile defaults for it.
    liveKind0(kind0(THEIRS, "c".repeat(64), 30, { name: "garden_typical_040d" }));

    show();

    await waitFor(() => expect(readPublishedAssistant()).toBeNull());
    expect(screen.queryByTestId("text-assistant-npub-settings")).toBeNull();
    expect(screen.queryByText("garden_typical_040d")).toBeNull();
    expect(h.followUser).not.toHaveBeenCalled();
    expect(h.publishBrainstormAssistantProfile).not.toHaveBeenCalled();
  });

  it("shows ta_pubkey once its kind 0 is out, linking and dating that kind 0 — without following it", async () => {
    const live = kind0(OURS, "d".repeat(64), 3, {
      name: "puzzle_speed_05db",
      picture: "https://example.invalid/p.webp",
      banner: "https://example.invalid/b.webp",
    });
    liveKind0(live);

    show();

    expect(await screen.findByTestId("text-assistant-npub-settings")).toHaveTextContent(
      nip19.npubEncode(OURS).slice(0, 12),
    );
    expect(screen.getByTestId("link-assistant-view-event-settings")).toHaveAttribute(
      "href",
      `https://njump.me/${live.id}`,
    );
    expect(screen.getByTestId("text-assistant-published-settings")).toHaveTextContent("3d ago");
    expect(readPublishedAssistant()?.pubkey).toBe(OURS);
    expect(h.followUser).not.toHaveBeenCalled();
    expect(h.publishBrainstormAssistantProfile).not.toHaveBeenCalled();
  });

  it("takes the link and the age from the live kind 0, not from the cached publish", async () => {
    writePublishedAssistant({
      pubkey: OURS,
      npub: "",
      eventId: "0".repeat(64),
      publishedAt: Date.now() - 90 * DAY * 1000,
    });
    const live = kind0(OURS, "d".repeat(64), 2, { name: "puzzle_speed_05db", picture: "p", banner: "b" });
    liveKind0(live);

    show();

    expect(await screen.findByTestId("link-assistant-view-event-settings")).toHaveAttribute(
      "href",
      `https://njump.me/${live.id}`,
    );
    expect(screen.getByTestId("text-assistant-published-settings")).toHaveTextContent("2d ago");
  });

  it("posts the profile defaults only for ta_pubkey's own kind 0", async () => {
    writePublishedAssistant({ pubkey: OURS, npub: "", eventId: "d".repeat(64), publishedAt: Date.now() });
    liveKind0(kind0(OURS, "d".repeat(64), 1, { name: "puzzle_speed_05db" }));

    show();

    await waitFor(() => expect(h.publishBrainstormAssistantProfile).toHaveBeenCalledTimes(1));
    expect(h.followUser).not.toHaveBeenCalled();
  });

  it("can't publish before the server has said which Assistant is ours", () => {
    Object.assign(h.mywot, { taPubkey: null, hasMywot: false, known: false, isLoading: true });

    show();

    expect(screen.getByRole("button", { name: /publish/i })).toBeDisabled();
  });
});
