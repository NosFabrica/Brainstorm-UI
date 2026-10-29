// @vitest-environment jsdom
/**
 * The stored Assistant is a cache of a publish, and only ever of the server's
 * `ta_pubkey`. A copy naming another key — what the shared kind-30078 pointer
 * left on whichever deployment didn't publish last (#269) — is no Assistant,
 * and is dropped with its cached kind 0.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const ME = "1".repeat(64);
const OURS = "a".repeat(64);
const THEIRS = "b".repeat(64);

vi.mock("@/accounts/display", () => ({ activePubkey: () => ME }));

import {
  ASSISTANT_UPDATED_EVENT,
  dropMismatchedAssistant,
  readAssistantDismissed,
  readAssistantFor,
  readAssistantProfile,
  readPublishedAssistant,
  setAssistantDismissed,
  writeAssistantProfile,
  writePublishedAssistant,
} from "./assistantStorage";

const store = (pubkey: string) =>
  writePublishedAssistant({ pubkey, npub: "", eventId: "e".repeat(64), publishedAt: 1_790_374_540_180 });

beforeEach(() => localStorage.clear());

describe("readAssistantFor", () => {
  it("is the stored Assistant when it is ta_pubkey", () => {
    store(OURS);
    expect(readAssistantFor(OURS)?.pubkey).toBe(OURS);
  });

  it("is none when the store names another key, and leaves the store alone", () => {
    store(THEIRS);
    expect(readAssistantFor(OURS)).toBeNull();
    expect(readPublishedAssistant()?.pubkey).toBe(THEIRS);
  });

  it("is none before the server has said which is ours", () => {
    store(OURS);
    expect(readAssistantFor(null)).toBeNull();
  });
});

describe("dropMismatchedAssistant", () => {
  it("drops another deployment's Assistant with its cached kind 0, and tells the page", () => {
    store(THEIRS);
    writeAssistantProfile({ name: "garden_typical_040d" });
    setAssistantDismissed(true);
    const heard = vi.fn();
    window.addEventListener(ASSISTANT_UPDATED_EVENT, heard);

    expect(dropMismatchedAssistant(OURS)).toBe(true);
    window.removeEventListener(ASSISTANT_UPDATED_EVENT, heard);

    expect(readPublishedAssistant()).toBeNull();
    expect(readAssistantProfile()).toBeNull();
    expect(heard).toHaveBeenCalledTimes(1);
    // The reader's own "Maybe later" was about the prompt, not that Assistant.
    expect(readAssistantDismissed()).toBe(true);
  });

  it("keeps ta_pubkey's own publish", () => {
    store(OURS);
    writeAssistantProfile({ name: "puzzle_speed_05db" });

    expect(dropMismatchedAssistant(OURS)).toBe(false);
    expect(readPublishedAssistant()?.pubkey).toBe(OURS);
    expect(readAssistantProfile()?.name).toBe("puzzle_speed_05db");
  });

  it("has nothing to drop in an empty store", () => {
    expect(dropMismatchedAssistant(OURS)).toBe(false);
  });
});
