/**
 * URL templates drafted with a list: which go out, how their ids are swapped
 * in, and what stops them — chiefly one that already exists.
 */
import { describe, expect, it } from "vitest";
import type { CopyDraft } from "./conceptCopy";
import { newListDraft } from "./listDraft";
import {
  draftTemplateId,
  draftTemplateProblems,
  resolveDraftTemplates,
  templatesToPublish,
  type DraftTemplate,
} from "./templateDrafts";

const A = "a".repeat(64);
const B = "b".repeat(64);
const REAL = "f".repeat(64);

const withTemplates = (templates: DraftTemplate[], bound = true): CopyDraft => ({
  ...newListDraft(),
  singular: "Place",
  plural: "Places",
  fields: [{ name: "btcmap-id", enabled: true, requirement: "required", origin: "custom" }],
  templates,
  links: templates.map((t) => ({ templateId: t.id, relay: "", bindings: [["id", bound ? "btcmap-id" : ""]] })),
});
const btcmap = (id = A, name = "BTC Map place"): DraftTemplate => ({
  id,
  name,
  template: "https://btcmap.org/merchant/{id}",
});

describe("draftTemplateId", () => {
  it("is 64 hex, so a link to a draft parses like any other", () => {
    expect(draftTemplateId()).toMatch(/^[0-9a-f]{64}$/);
    expect(draftTemplateId()).not.toBe(draftTemplateId());
  });
});

describe("templatesToPublish", () => {
  it("only the drafts a written link uses", () => {
    expect(templatesToPublish(withTemplates([btcmap()]))).toHaveLength(1);
    expect(templatesToPublish(withTemplates([btcmap()], false))).toEqual([]);
    expect(templatesToPublish({ ...withTemplates([btcmap()]), links: [] })).toEqual([]);
  });
});

describe("resolveDraftTemplates", () => {
  it("swaps the real id into the links and drops the published draft", () => {
    const after = resolveDraftTemplates(withTemplates([btcmap(A), btcmap(B, "Other")]), new Map([[A, REAL]]));
    expect(after.links.map((l) => l.templateId)).toEqual([REAL, B]);
    expect(after.templates.map((t) => t.id)).toEqual([B]);
  });
});

describe("draftTemplateProblems", () => {
  const existing = [
    { id: REAL, pubkey: "p", name: "BTC Map merchant", template: "https://btcmap.org/merchant/{place}" },
  ];

  it("a draft that builds the same links as an existing template: use that one", () => {
    expect(draftTemplateProblems(withTemplates([btcmap()]), existing)).toEqual([
      'BTC Map place is the same as the existing "BTC Map merchant": use that one.',
    ]);
  });

  it("unnamed, malformed, or drafted twice", () => {
    expect(draftTemplateProblems(withTemplates([btcmap(A, "")]), [])).toEqual([
      "Name the new URL template https://btcmap.org/merchant/{id}.",
    ]);
    const http: DraftTemplate = { id: A, name: "Plain", template: "http://x.com/{id}" };
    expect(draftTemplateProblems(withTemplates([http]), [])).toEqual([
      "Plain isn't a usable template: start with https:// and the site, then use {placeholders}.",
    ]);
    expect(draftTemplateProblems(withTemplates([btcmap(A), btcmap(B, "Again")]), [])).toEqual([
      "Again is drafted twice: keep one.",
    ]);
  });

  it("nothing to say about a draft no link uses", () => {
    expect(draftTemplateProblems(withTemplates([btcmap()], false), existing)).toEqual([]);
  });
});
