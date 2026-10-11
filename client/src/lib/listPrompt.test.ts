/**
 * The instructions an AI gets for authoring a list: the live URL templates by
 * id, the grammar's newer conventions, and a format List Management can read
 * back — its own example included.
 */
import { describe, expect, it } from "vitest";
import { listAuthoringPrompt } from "./listPrompt";
import { parseListImport } from "./listImport";

const GITHUB = {
  id: "f19f39daf75388ff0f19cc37dde5ae1b90124b0d60e35659160c48dc690deca4",
  pubkey: "2".repeat(64),
  name: "GitHub profile",
  template: "https://github.com/{username}",
};

describe("listAuthoringPrompt", () => {
  const prompt = listAuthoringPrompt([GITHUB], "wss://dcosl.brainstorm.world");

  it("lists the URL templates that exist, by id, and the relay to cite", () => {
    expect(prompt).toContain(`${GITHUB.id} — GitHub profile — https://github.com/{username}`);
    expect(prompt).toContain('"wss://dcosl.brainstorm.world"');
    expect(prompt).toContain("never invent an id");
  });

  it("teaches the newer conventions: facts, field types, display roles, the list's icon", () => {
    for (const tag of ['["display", "fact"', '["field-type"', '"location"', '"media"', '["image", "<https URL>"]'])
      expect(prompt).toContain(tag);
  });

  it("says when there are no templates, and ends ready for the request", () => {
    expect(listAuthoringPrompt([], "wss://hub")).toContain("(none yet");
    expect(prompt.trimEnd().endsWith("The list I want:")).toBe(true);
  });

  it("shows a format the import reads back", () => {
    const block = /\{\n {2}"d"[\s\S]*?\n\}/.exec(prompt)?.[0] ?? "";
    expect(parseListImport(block)).toMatchObject({ ok: true, value: { d: "books" } });
  });
});
