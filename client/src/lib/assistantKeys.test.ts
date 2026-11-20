// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  HOLDER_LABELS,
  compareKeys,
  keyName,
  keySuffix,
  withKeyCopied,
  withKeyGiven,
  withKeyRemoved,
  withKeyTaken,
} from "./assistantKeys";

const OR = "https://openrouter.ai/api/v1";
const ANT = "https://api.anthropic.com/v1";
const mineOnly = { key: "sk-or-v1-mine-1111", url: OR };
const shared = { key: "sk-ant-shared-2222", url: ANT };
const theirsOnly = { key: "sk-or-v1-theirs-3333", url: OR };

describe("the two lists, labelled", () => {
  it("matches on URL and key: both, only yours, only your Assistant's", () => {
    const rows = compareKeys([mineOnly, shared], [{ ...shared, url: `${ANT}/` }, theirsOnly]);
    expect(rows.map((r) => [r.key.key, r.holder])).toEqual([
      [mineOnly.key, "mine"],
      [shared.key, "both"],
      [theirsOnly.key, "assistant"],
    ]);
    expect(rows.map((r) => HOLDER_LABELS[r.holder])).toEqual([
      "Only yours",
      "Yours and your Assistant's",
      "Only your Assistant's",
    ]);
  });

  it("a key at another endpoint, or another key at the same one, is a different key", () => {
    const rows = compareKeys(
      [mineOnly],
      [
        { ...mineOnly, url: ANT },
        { ...mineOnly, key: "sk-or-v1-mine-9999" },
      ],
    );
    expect(rows.map((r) => r.holder)).toEqual(["mine", "assistant", "assistant"]);
  });

  it("names a key by provider and last four characters only", () => {
    expect(keySuffix(mineOnly)).toBe("1111");
    expect(keyName(mineOnly)).toBe("OpenRouter ····1111");
    expect(keyName({ key: "", url: "http://localhost:11434/v1" })).toBe("Ollama · no key");
    expect(keyName(mineOnly)).not.toContain("sk-or");
  });
});

describe("the Assistant's list, edited", () => {
  const theirs = [
    ["key", theirsOnly.key, theirsOnly.url],
    ["x-note", "kept"],
    ["key", "k", "http://example.com/v1"],
  ];

  it("gives a key at the end of its keys, keeping every other tag, and twice is once", () => {
    const given = withKeyGiven(theirs, mineOnly);
    expect(given).toEqual([
      ["key", theirsOnly.key, theirsOnly.url],
      ["key", mineOnly.key, OR],
      ["x-note", "kept"],
      // A key tag NIP-FA can't use (plain http with a key) is kept, never used.
      ["key", "k", "http://example.com/v1"],
    ]);
    expect(withKeyGiven(given, { ...mineOnly, url: `${OR}/` })).toBe(given);
  });

  it("takes a key back, keeping every other tag, and the same list when it didn't hold it", () => {
    expect(withKeyTaken(theirs, theirsOnly)).toEqual([
      ["x-note", "kept"],
      ["key", "k", "http://example.com/v1"],
    ]);
    expect(withKeyTaken(theirs, mineOnly)).toBe(theirs);
  });

  it("copies a key into the reader's, and removes it from theirs", () => {
    expect(withKeyCopied([mineOnly], theirsOnly)).toEqual([mineOnly, theirsOnly]);
    const same = [mineOnly];
    expect(withKeyCopied(same, { ...mineOnly, url: `${OR}/` })).toBe(same);
    expect(withKeyRemoved([mineOnly, shared], { ...shared, url: `${ANT}/` })).toEqual([mineOnly]);
  });
});
