/**
 * The Assistant tags, written: what each action publishes, in what order, and
 * that taking a tag back is a dispute (polarity -1), never a delete.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ASSISTANT_TAGS } from "@/config/assistants";
import { parseCoordinate } from "@/lib/dlistFields";

const h = vi.hoisted(() => ({ applyTagToProfile: vi.fn() }));
vi.mock("@/services/tags", () => ({ applyTagToProfile: h.applyTagToProfile }));

import { changeAssistantTag, disownAssistant, tagAsAssistant } from "./assistants";

const TARGET = "a".repeat(64);
const DEF_ID = "d".repeat(64);
const [BRAINSTORM, TAPESTRY] = ASSISTANT_TAGS;
const author = (coordinate: string) => parseCoordinate(coordinate)!.pubkey;
const calls = () => h.applyTagToProfile.mock.calls.map(([args]) => [args.tag.slug, args.polarity] as [string, number]);

beforeEach(() => {
  h.applyTagToProfile.mockReset();
  h.applyTagToProfile.mockResolvedValue({ published: [] });
});

describe("tagAsAssistant", () => {
  it("applies the configured tag, pointing at its definition when it has been read", async () => {
    await tagAsAssistant(TARGET, "brainstorm", { brainstorm: DEF_ID });
    expect(h.applyTagToProfile).toHaveBeenCalledWith({
      tag: { authorPubkey: author(BRAINSTORM.coordinate), slug: BRAINSTORM.slug, eventId: DEF_ID },
      targetPubkey: TARGET,
      polarity: 1,
    });
  });

  it("fails when the tagging only got part way", async () => {
    h.applyTagToProfile.mockResolvedValue({
      published: [],
      failedAt: { kind: 39999, what: "assertion", error: "nope" },
    });
    await expect(tagAsAssistant(TARGET, "tapestry", {})).rejects.toThrow("nope");
  });
});

describe("changeAssistantTag", () => {
  it("applies the new tag, then disputes the old one", async () => {
    expect(await changeAssistantTag(TARGET, "brainstorm", "tapestry", {})).toEqual({});
    expect(calls()).toEqual([
      [TAPESTRY.slug, 1],
      [BRAINSTORM.slug, -1],
    ]);
  });

  it("leaves the old tag alone when the new one didn't go out", async () => {
    h.applyTagToProfile.mockRejectedValueOnce(new Error("no relay"));
    await expect(changeAssistantTag(TARGET, "brainstorm", "tapestry", {})).rejects.toThrow("no relay");
    expect(calls()).toEqual([[TAPESTRY.slug, 1]]);
  });

  it("reports an old tag it couldn't dispute, rather than throwing after the new one went out", async () => {
    const problem = new Error("declined");
    h.applyTagToProfile.mockResolvedValueOnce({ published: [] }).mockRejectedValueOnce(problem);
    expect(await changeAssistantTag(TARGET, "brainstorm", "tapestry", {})).toEqual({ undisputed: problem });
  });
});

describe("disownAssistant", () => {
  it("disputes every tag the profile carries — polarity -1, no delete", async () => {
    expect(await disownAssistant(TARGET, ["brainstorm", "tapestry"], {})).toEqual({ failed: [], error: undefined });
    expect(calls()).toEqual([
      [BRAINSTORM.slug, -1],
      [TAPESTRY.slug, -1],
    ]);
  });

  it("goes on past a failure and names what didn't go out", async () => {
    const problem = new Error("no relay");
    h.applyTagToProfile.mockRejectedValueOnce(problem);
    expect(await disownAssistant(TARGET, ["brainstorm", "tapestry"], {})).toEqual({
      failed: ["brainstorm"],
      error: problem,
    });
    expect(calls()).toHaveLength(2);
  });
});
