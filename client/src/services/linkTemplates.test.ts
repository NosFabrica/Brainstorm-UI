// @vitest-environment node
/**
 * URL templates, sifted: of the events read (a header's pinned ids, or the
 * items of the URL Templates list), only the well-formed templates count.
 */
import { describe, expect, it } from "vitest";
import { templatesById } from "./linkTemplates";

const ME = "1".repeat(64);
const MY_COPY = `39998:${ME}:url-templates`;

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

describe("templatesById", () => {
  it("keeps only well-formed templates, by id", () => {
    const out = templatesById([item("a", "https://{host}/x"), item("b", "https://ok.example/{v}", "OK")]);
    expect([...out.keys()]).toEqual(["b".padEnd(64, "0")]);
    expect([...out.values()].map((t) => [t.name, t.template])).toEqual([["OK", "https://ok.example/{v}"]]);
  });
});
