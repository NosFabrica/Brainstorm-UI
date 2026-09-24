import { describe, it, expect } from "vitest";
import { parseNoteContent } from "@/lib/noteContent";
import { toNoteBlocks, parseInlineMarkdown } from "@/lib/noteBlocks";

const blocks = (s: string) => toNoteBlocks(parseNoteContent(s));
const texts = (ts: { type: string; value?: string }[]) => ts.map((t) => t.value ?? `<${t.type}>`).join("");

describe("toNoteBlocks", () => {
  it("splits paragraphs on blank lines and keeps single breaks inside one", () => {
    const b = blocks("First line\nsame paragraph\n\n\nSecond paragraph");
    expect(b.map((x) => x.type)).toEqual(["p", "p"]);
    expect(texts((b[0] as { tokens: never[] }).tokens)).toBe("First line\nsame paragraph");
  });

  it("reads headings, rules, quotes and fenced code", () => {
    const b = blocks("## Title\nBody\n\n---\n> quoted\n> more\n\n```\nconst x = 1;\n```");
    expect(b.map((x) => x.type)).toEqual(["h", "p", "hr", "quote", "code"]);
    expect(b[0]).toMatchObject({ level: 2 });
    expect(texts((b[3] as { tokens: never[] }).tokens)).toBe("quoted\nmore");
    expect(b[4]).toEqual({ type: "code", text: "const x = 1;" });
  });

  it("groups bullet and ordered lists, keeping the start number", () => {
    const b = blocks("- one\n- two\n\n3. three\n4. four");
    expect(b[0]).toMatchObject({ type: "ul" });
    expect((b[0] as { items: unknown[] }).items).toHaveLength(2);
    expect(b[1]).toMatchObject({ type: "ol", start: 3 });
  });

  it("keeps hashtags, links and mentions as tokens inside blocks", () => {
    const b = blocks("- see https://example.com/x #nostr");
    const item = (b[0] as { items: { type: string }[][] }).items[0];
    expect(item.map((t) => t.type)).toEqual(["text", "url", "text", "hashtag"]);
  });

  it("does not take a hashtag line for a heading", () => {
    expect(blocks("#bitcoin fixes this")[0].type).toBe("p");
  });
});

describe("prose pass (unmarked articles, e.g. RSS bridges)", () => {
  const para = (n: number) => "Lorem ipsum dolor sit amet, consectetur adipiscing elit. ".repeat(n).trim();
  const article = [
    "Headline without a full stop",
    "",
    "https://cdn.example/photo.jpg",
    "",
    "     Caption of the photo, no period",
    "Photo credit",
    para(5),
    para(2),
    "Section head",
    para(5),
    "Short line.",
  ].join("\n");

  it("gives each prose line its own paragraph and reads headline, caption and section head", () => {
    const b = toNoteBlocks(parseNoteContent(article));
    expect(b.map((x) => (x.type === "h" ? `h${x.level}` : x.type))).toEqual(["h1", "p", "caption", "p", "p", "h3", "p", "p"]);
    // Caption and credit read as one caption; the indent doesn't survive.
    expect(texts((b[2] as { tokens: never[] }).tokens).trim()).toBe("Caption of the photo, no period\nPhoto credit");
  });

  it("leaves short chatty notes alone", () => {
    const b = blocks("gm\nwhat are we building today\nsomething fun");
    expect(b).toHaveLength(1);
    expect(b[0].type).toBe("p");
  });

  it("does not promote a sentence to a section head", () => {
    const b = blocks([para(2), "This one ends properly.", para(2)].join("\n"));
    expect(b.every((x) => x.type === "p")).toBe(true);
  });
});

describe("layouts that are not prose (from real events)", () => {
  it("keeps whitespace art as one preformatted block, untouched", () => {
    const art = ["   ) ( (   (", "  (  ) () @@  )  (( (", "( ( ( ()( /---\\   (()( (", " __<__\\__(___)_))_((_(____))__"].join("\n");
    const b = blocks(art);
    expect(b).toEqual([{ type: "code", text: art }]);
  });

  it("takes a pasted git log / diff to the end as code, blank context lines included", () => {
    const log = ["commit 57b3c5bda648016747553f49b6107fd6c7d90235", "Author: A <a@b>", "", "diff --git a/x b/x", "@@ -1,3 +1,2 @@", " Global", "-\t\tDebug|x86", " ", "+\tRelease"].join("\n");
    const b = blocks(log);
    expect(b.map((x) => x.type)).toEqual(["code"]);
    expect((b[0] as { text: string }).text).toContain("-\t\tDebug|x86");
  });

  it("ends a list at an unindented line instead of swallowing the rest", () => {
    const b = blocks("- Calso: twitter\n- Zetti:\nProduziert von Zetti\nTimestamps:");
    expect(b.map((x) => x.type)).toEqual(["ul", "p"]);
    expect((b[0] as { items: unknown[] }).items).toHaveLength(2);
  });

  it("keeps a run of short lines together between prose paragraphs", () => {
    const long = "A long line of prose that goes on well past the hundred character mark, as descriptions often do, yes.";
    const b = blocks([long + " More.", "(00:00) Intro", "(02:43) Part two", "(05:45) Part three", long].join("\n"));
    expect(b.map((x) => x.type)).toEqual(["p", "p", "p"]);
    expect(texts((b[1] as { tokens: never[] }).tokens)).toBe("(00:00) Intro\n(02:43) Part two\n(05:45) Part three");
  });

  it("reads an emoji-marked short line as a section head in a long text", () => {
    const para = "Mornings are workshops and mentor sessions, afternoons are open build time with teachers floating. ";
    const b = blocks([para.repeat(3), "", "🧠 Why this exists", "", para.repeat(3)].join("\n"));
    expect(b.map((x) => (x.type === "h" ? `h${x.level}` : x.type))).toEqual(["p", "h3", "p"]);
  });
});

describe("parseInlineMarkdown", () => {
  it("parses strong, em and code", () => {
    expect(parseInlineMarkdown("a **b** *c* `d`")).toEqual([
      { type: "text", value: "a " },
      { type: "strong", children: [{ type: "text", value: "b" }] },
      { type: "text", value: " " },
      { type: "em", children: [{ type: "text", value: "c" }] },
      { type: "text", value: " " },
      { type: "code", value: "d" },
    ]);
  });

  it("leaves snake_case, arithmetic and lone markers alone", () => {
    for (const s of ["snake_case_name", "2 * 3 * 4", "** nope **", "file_name.txt and other_file", "__<_____\\__\\__(___)_))_((_(____))__"]) {
      expect(parseInlineMarkdown(s)).toEqual([{ type: "text", value: s }]);
    }
  });
});
