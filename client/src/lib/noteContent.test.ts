/**
 * The note-content tokenizer — the one seam every note body renders through.
 * Born from a live bug: a note whose content is a data:image/gif;base64 URI
 * rendered as a wall of base64 text on the event page's More-from strip.
 */
import { describe, expect, it } from "vitest";
import { parseNoteContent } from "./noteContent";

describe("parseNoteContent", () => {
  it("renders an inline data:image URI as an image, never as base64 text", () => {
    const gif = "data:image/gif;base64,R0lGODlhPQBEAPeoAJosM//AwO/AwHVYZ/z595kzAP/s7P+goOXMv8+fhw==";
    const tokens = parseNoteContent(`look at this ${gif} masterpiece`);
    expect(tokens).toEqual([
      { type: "text", value: "look at this " },
      { type: "image", value: gif },
      { type: "text", value: " masterpiece" },
    ]);
  });

  it("ordinary text and web images keep their shapes", () => {
    const tokens = parseNoteContent("gm https://img.example/sunset.jpg");
    expect(tokens).toEqual([
      { type: "text", value: "gm " },
      { type: "image", value: "https://img.example/sunset.jpg" },
    ]);
  });
});
