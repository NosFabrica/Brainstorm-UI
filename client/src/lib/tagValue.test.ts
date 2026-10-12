// @vitest-environment node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { tagValue } from "./tagValue";
import { tagValue as fromReaders } from "./resultReaders";

describe("tagValue", () => {
  const event = {
    tags: [
      ["title", "  "],
      ["title", " Morning at the lake "],
      ["summary", "Mist"],
    ],
  };

  it("is the first non-empty value of the first name the event carries, trimmed", () => {
    expect(tagValue(event, "title")).toBe("Morning at the lake");
    expect(tagValue(event, "name", "summary")).toBe("Mist");
    expect(tagValue(event, "alt")).toBeNull();
  });

  it("is still found where it always was", () => {
    expect(fromReaders).toBe(tagValue);
  });

  // lib/resultReaders reads a video through lib/nip71. While nip71 took `tagValue` from
  // resultReaders the two imported each other, and which loaded first decided what was defined.
  it("lets lib/nip71 read tags without importing the readers that import it", () => {
    const source = (name: string) => readFileSync(fileURLToPath(new URL(`./${name}`, import.meta.url)), "utf8");
    expect(source("nip71.ts")).not.toMatch(/from "@\/lib\/resultReaders"/);
    expect(source("tagValue.ts")).not.toMatch(/^import /m);
  });
});
