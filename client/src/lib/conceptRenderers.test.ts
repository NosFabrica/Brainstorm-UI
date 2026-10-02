/**
 * Brainstorm's renderers, found along a concept's chain — and stepping aside
 * for the generic view when the governing copy dropped what they're built on.
 */
import { describe, expect, it } from "vitest";
import { resolveConcept, type HeaderEvent } from "./conceptResolution";
import { rendererFor } from "./conceptRenderers";

const AVI = "b83a28b7e4e5d20bd960c5faeb6625f95529166b8bdb045d42634a2f35919450";
const TA = "2".repeat(64);
const COMMUNITY = `39998:${AVI}:github-accounts`;
const keyOf = (c: string) => (c === COMMUNITY ? "github-account" : null);

const header = (pubkey: string, tags: string[][]): HeaderEvent => ({
  id: pubkey.slice(0, 8).padEnd(64, "0"),
  pubkey,
  kind: 39998,
  created_at: 1,
  tags: [["d", "github-accounts"], ["names", "GitHub Account", "GitHub Accounts"], ...tags],
});
const community = header(AVI, [["required", "github-username"]]);

describe("rendererFor", () => {
  it("the community concept's own renderer", () => {
    const r = resolveConcept({ community, communityCoordinate: COMMUNITY })!;
    expect(rendererFor(r, keyOf)?.key).toBe("github-account");
  });

  it("a copy pointing at it renders the same way, through the chain", () => {
    const copy = header(TA, [
      ["required", "github-username"],
      ["b", COMMUNITY, "pointer"],
    ]);
    const r = resolveConcept({ community, communityCoordinate: COMMUNITY, assistant: copy })!;
    expect(r.governing.coordinate).not.toBe(COMMUNITY);
    expect(rendererFor(r, keyOf)?.key).toBe("github-account");
  });

  it("a copy without the field the renderer is built on gets the generic view", () => {
    const copy = header(TA, [
      ["required", "handle"],
      ["b", COMMUNITY, "pointer"],
    ]);
    const r = resolveConcept({ community, communityCoordinate: COMMUNITY, assistant: copy })!;
    expect(rendererFor(r, keyOf)).toBeNull();
  });

  it("an unregistered concept gets the generic view", () => {
    const r = resolveConcept({ community, communityCoordinate: COMMUNITY })!;
    expect(rendererFor(r, () => null)).toBeNull();
  });

  it("GitHub links a valid username, and nothing else", () => {
    const r = resolveConcept({ community, communityCoordinate: COMMUNITY })!;
    const links = rendererFor(r, keyOf)!.links!;
    expect(links(() => "vcavallo")).toEqual([{ label: "github.com/vcavallo", href: "https://github.com/vcavallo" }]);
    expect(links(() => "../evil")).toEqual([]);
    expect(links(() => "a--b")).toEqual([]);
    expect(links(() => null)).toEqual([]);
  });
});
