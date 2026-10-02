// @vitest-environment node
/**
 * The link picker's templates: URL Templates is just another Dictionary
 * concept, read through its governing list for the reader.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { URL_TEMPLATES, ME } = vi.hoisted(() => ({
  URL_TEMPLATES: `39998:${"2".repeat(64)}:url-templates`,
  ME: "1".repeat(64),
}));
const MY_COPY = `39998:${ME}:url-templates`;

const loadDictionary = vi.fn();
const loadConceptItems = vi.fn();
vi.mock("@/services/dictionary", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  loadDictionary: (...a: unknown[]) => loadDictionary(...a),
  loadConceptItems: (...a: unknown[]) => loadConceptItems(...a),
}));
vi.mock("@/config/dictionary", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  URL_TEMPLATES_CONCEPT: URL_TEMPLATES,
}));

import { __resetTemplateCache, fetchAvailableTemplates } from "./linkTemplates";

const item = (id: string, template: string, name = "A link") => ({
  id: id.padEnd(64, "0"),
  pubkey: ME,
  kind: 9999,
  created_at: 1,
  content: "",
  tags: [
    ["z", MY_COPY],
    ["name", name],
    ["url-template", template],
  ],
});

beforeEach(() => {
  __resetTemplateCache();
  loadDictionary.mockReset();
  loadConceptItems.mockReset();
});

describe("fetchAvailableTemplates", () => {
  it("reads the reader's governing URL Templates list — their copy's chain", async () => {
    loadDictionary.mockResolvedValue([
      {
        communityCoordinate: URL_TEMPLATES,
        resolved: { chain: [MY_COPY, URL_TEMPLATES] },
        inDictionary: true,
        items: [],
      },
    ]);
    loadConceptItems.mockResolvedValue([item("a", "https://github.com/{username}", "GitHub profile")]);
    const out = await fetchAvailableTemplates({ pubkey: ME, taPubkey: null });
    expect(loadDictionary).toHaveBeenCalledWith({ pubkey: ME, taPubkey: null }, [URL_TEMPLATES], undefined, {
      items: false,
    });
    expect(loadConceptItems).toHaveBeenCalledWith([URL_TEMPLATES, MY_COPY]);
    expect(out.map((t) => t.name)).toEqual(["GitHub profile"]);
  });

  it("offers only well-formed templates", async () => {
    loadDictionary.mockResolvedValue([
      { communityCoordinate: URL_TEMPLATES, resolved: null, inDictionary: false, items: [] },
    ]);
    loadConceptItems.mockResolvedValue([item("a", "https://{host}/x"), item("b", "https://ok.example/{v}")]);
    const out = await fetchAvailableTemplates({ pubkey: null, taPubkey: null });
    expect(out.map((t) => t.template)).toEqual(["https://ok.example/{v}"]);
  });
});
