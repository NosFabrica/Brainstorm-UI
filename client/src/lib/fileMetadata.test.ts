import { describe, expect, it } from "vitest";
import { fileMime, isMediaFile, isSoundtrackFile } from "./fileMetadata";

const file = (m: string, tags: string[][] = []) => ({
  kind: 1063,
  tags: [["url", "https://x.test/f"], ["m", m], ...tags],
});

describe("a kind-1063 file's mime", () => {
  // Audit: a mime type is case-insensitive, and publishers pad it ("Image/JPEG", " video/mp4").
  it("is read trimmed and in lower case, so a capitalised one is still media", () => {
    expect(fileMime(file(" Image/JPEG "))).toBe("image/jpeg");
    expect(isMediaFile(file("Image/JPEG"))).toBe(true);
    expect(isMediaFile(file(" VIDEO/MP4"))).toBe(true);
    expect(isMediaFile(file("application/vnd.android.package-archive"))).toBe(false);
  });

  it("a soundtrack in capitals is still a soundtrack", () => {
    expect(isSoundtrackFile(file("Audio/WAV", [["allow_audio_reuse", "true"]]))).toBe(true);
  });
});
