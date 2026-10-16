import { describe, expect, it } from "vitest";
import { contentWarningOf } from "./nip36";

const ev = (...tags: string[][]) => ({ tags });

describe("contentWarningOf — a creator's own mark that a post is sensitive", () => {
  it("is read from the content-warning tag, with its reason when it gives one", () => {
    expect(contentWarningOf(ev(["content-warning", "nudity"]))).toEqual({ reason: "nudity" });
    expect(contentWarningOf(ev(["content-warning"]))).toEqual({});
    expect(contentWarningOf(ev(["content-warning", "  "]))).toEqual({});
  });

  it("is read from labels in the content-warning namespace, and no other", () => {
    expect(
      contentWarningOf(
        ev(
          ["L", "content-warning"],
          ["l", "nudity", "content-warning"],
          ["l", "violence", "content-warning"],
          ["l", "vine-archive", "archive.divine.video"],
        ),
      ),
    ).toEqual({ reason: "nudity, violence" });
    expect(contentWarningOf(ev(["l", "vine-archive", "archive.divine.video"]))).toBeNull();
  });

  it("prefers the tag's own reason to the labels", () => {
    expect(contentWarningOf(ev(["content-warning", "graphic"], ["l", "violence", "content-warning"]))).toEqual({
      reason: "graphic",
    });
  });

  it("is null when the event carries neither", () => {
    expect(contentWarningOf(ev(["t", "nsfw"]))).toBeNull();
    expect(contentWarningOf(ev())).toBeNull();
  });
});
