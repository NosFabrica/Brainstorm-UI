// @vitest-environment jsdom
/**
 * Publishing the Assistant is checked against the server's `ta_pubkey`: a
 * cached Assistant that isn't it never counts as already published, and a
 * publish that comes back under another key is neither cached nor followed
 * (#269).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const ME = "1".repeat(64);
const OURS = "a".repeat(64);
const THEIRS = "b".repeat(64);
const EVENT = "e".repeat(64);

const h = vi.hoisted(() => ({
  publishDefaultAssistantProfile: vi.fn(),
  followUser: vi.fn(async () => {}),
}));
vi.mock("@/accounts/display", () => ({ activePubkey: () => ME }));
vi.mock("@/services/api", () => ({
  apiClient: { publishDefaultAssistantProfile: h.publishDefaultAssistantProfile },
}));
vi.mock("@/services/socialActions", () => ({ followUser: h.followUser }));

import { ensureAssistantPublished } from "./assistantPublish";
import { readPublishedAssistant, writePublishedAssistant } from "./assistantStorage";

const store = (pubkey: string) => writePublishedAssistant({ pubkey, npub: "", eventId: EVENT, publishedAt: 1 });
const serverPublishes = (pubkey: string) =>
  h.publishDefaultAssistantProfile.mockResolvedValue({ data: { assistant_pubkey: pubkey, event_id: EVENT } });

beforeEach(() => {
  localStorage.clear();
  h.publishDefaultAssistantProfile.mockReset();
  h.followUser.mockClear();
});

describe("ensureAssistantPublished", () => {
  it("publishes when the store holds another deployment's Assistant, instead of skipping", async () => {
    store(THEIRS);
    serverPublishes(OURS);

    const result = await ensureAssistantPublished({ taPubkey: OURS, follow: false });

    expect(result.alreadyPublished).toBe(false);
    expect(h.publishDefaultAssistantProfile).toHaveBeenCalledTimes(1);
    expect(readPublishedAssistant()?.pubkey).toBe(OURS);
    expect(h.followUser).not.toHaveBeenCalled();
  });

  it("skips when ta_pubkey is already cached as published", async () => {
    store(OURS);

    const result = await ensureAssistantPublished({ taPubkey: OURS, follow: true });

    expect(result).toMatchObject({ alreadyPublished: true, state: { pubkey: OURS } });
    expect(h.publishDefaultAssistantProfile).not.toHaveBeenCalled();
    expect(h.followUser).not.toHaveBeenCalled();
  });

  it("an explicit publish of ta_pubkey caches it and follows it", async () => {
    serverPublishes(OURS);

    await ensureAssistantPublished({ taPubkey: OURS, follow: true, skipIfPublished: false });

    expect(readPublishedAssistant()?.pubkey).toBe(OURS);
    expect(h.followUser).toHaveBeenCalledWith(OURS);
  });

  it("a publish under any other key is an error: nothing cached, nobody followed", async () => {
    serverPublishes(THEIRS);

    await expect(ensureAssistantPublished({ taPubkey: OURS, follow: true, skipIfPublished: false })).rejects.toThrow(
      /different key/,
    );

    expect(readPublishedAssistant()).toBeNull();
    expect(h.followUser).not.toHaveBeenCalled();
  });
});
