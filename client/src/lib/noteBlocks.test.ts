import { describe, it, expect } from "vitest";
import { parseNoteContent } from "@/lib/noteContent";
import { toNoteBlocks, parseInlineMarkdown, type NoteBlock } from "@/lib/noteBlocks";
import type { NoteToken } from "@/lib/noteContent";

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
    expect(b).toEqual([{ type: "code", text: art, art: true }]);
  });

  it("takes a pasted git log / diff to the end as code, blank context lines included", () => {
    const log = ["commit 57b3c5bda648016747553f49b6107fd6c7d90235", "Author: A <a@b>", "", "diff --git a/x b/x", "@@ -1,3 +1,3 @@", " Global", "-\t\tDebug|x86", " ", "+\tRelease"].join("\n");
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

describe("review regressions", () => {
  const para = "A paragraph long enough to count as prose in a long note, going on past sixty characters easily. ";
  it("a fenced diff stays inside its fence; prose after it stays prose", () => {
    const b = blocks("Fix below\n\n```diff\ndiff --git a/x b/x\n+ok\n```\n\nThanks for reviewing.");
    expect(b.map((x) => x.type)).toEqual(["p", "code", "p"]);
    expect(b[1]).toEqual({ type: "code", text: "diff --git a/x b/x\n+ok" });
  });

  it("one-line ```code``` is inline code, not a fence that eats the line", () => {
    const b = blocks("run ```npm install``` first\nthen go");
    expect(b.map((x) => x.type)).toEqual(["p"]);
    expect(parseInlineMarkdown("```npm install```")).toEqual([{ type: "code", value: "npm install" }]);
  });

  it("a fenced table keeps its fences out of the code", () => {
    const b = blocks("Intro\n\n```\nname    value\nfoo     1\nbar     2\n```\n\nAfter.");
    expect(b[1]).toEqual({ type: "code", text: "name    value\nfoo     1\nbar     2" });
  });

  it("a sentence that starts with commit <sha> is prose", () => {
    const b = blocks(`commit 1a2b3c4d broke the relay, here's what happened\n\n${para}\n\n${para}`);
    expect(b.every((x) => x.type === "p")).toBe(true);
  });

  it("a pasted diff ends where the prose after it starts", () => {
    const b = blocks("diff --git a/x b/x\n@@ -1 +1 @@\n-a\n+b\n\nThat was the fix.");
    expect(b.map((x) => x.type)).toEqual(["code", "p"]);
  });

  it("emoji reactions are text, not art", () => {
    expect(blocks("🎉🎉🎉🎉🎉\n🔥🔥🔥🔥🔥\n❤️❤️❤️❤️")[0].type).toBe("p");
  });

  it("code shows the source verbatim, not the tokens rebuilt", () => {
    const src = "```\n[docs](https://example.com/a)\nhttps://njump.me/npub180cvv07tjdrrgpa0j7j7tmnyl2yr6yr7l8j4s3evf6u64th6gkwsyjh6w6\n```";
    expect(toNoteBlocks(parseNoteContent(src), { source: src })[0]).toEqual({
      type: "code",
      text: "[docs](https://example.com/a)\nhttps://njump.me/npub180cvv07tjdrrgpa0j7j7tmnyl2yr6yr7l8j4s3evf6u64th6gkwsyjh6w6",
    });
  });

  it("reads h4-h6 and + bullets, as marketplace descriptions write them", () => {
    const b = blocks("#### Size guide\n+ small\n+ large");
    expect(b[0]).toMatchObject({ type: "h", level: 3 });
    expect(b[1]).toMatchObject({ type: "ul" });
  });

  it("an Arabic or CJK question is a sentence, not a heading", () => {
    for (const q of ["من هم مؤيدي البيتكوين؟", "这是什么？"]) {
      const b = blocks([para.repeat(3), q, para.repeat(3)].join("\n\n"));
      expect(b.every((x) => x.type === "p"), q).toBe(true);
    }
  });

  it("an attributed quote on the first line is not a headline", () => {
    const q = "«قانون برای درست‌کاران وضع نشده، بلکه برای قانون‌شکنان و نافرمانان است.» (پولس قدیس)";
    const b = blocks([q, para.repeat(4), para.repeat(4)].join("\n\n"));
    expect(b[0].type).toBe("p");
  });

  it("a lowercase chat line between long paragraphs is not a heading", () => {
    const b = blocks([para.repeat(3), "lol anyway", para.repeat(3)].join("\n\n"));
    expect(b.every((x) => x.type === "p")).toBe(true);
  });

  it("unclosed emphasis markers stay linear, not quadratic", () => {
    const t = performance.now();
    parseInlineMarkdown("**a ".repeat(10000));
    parseInlineMarkdown("__a ".repeat(10000));
    expect(performance.now() - t).toBeLessThan(250);
  });
});

describe("final audit regressions", () => {
  it("a list indented as a whole stays one level", () => {
    const b = blocks("  - apples\n  - pears\n  - plums");
    expect((b[0] as { items: unknown[]; nested?: unknown }).items).toHaveLength(3);
    expect((b[0] as { nested?: unknown }).nested).toBeUndefined();
  });

  it("a line under a sub-item belongs to that sub-item", () => {
    const b = blocks("- Setup\n  - install deps\n    (needs node 20)");
    const l = b[0] as { items: { value?: string }[][]; nested?: { items: { value?: string }[][] }[] };
    expect(l.items[0].map((t) => t.value).join("")).toBe("Setup");
    expect(l.nested?.[0].items[0].map((t) => t.value).join("")).toBe("install deps\n(needs node 20)");
  });

  it("__word__ is still bold; only Python's names are exempt", () => {
    expect(parseInlineMarkdown("this is __really__ important")[1]).toEqual({ type: "strong", children: [{ type: "text", value: "really" }] });
  });

  it("a reply and a list typed after a pasted git log stay prose", () => {
    const b = blocks("commit 57b3c5bda648016747553f49b6107fd6c7d90235\nAuthor: A <a@b>\n\n    fix\n\n@bob can you look at this please\n- also this list");
    expect(b.map((x) => x.type)).toEqual(["code", "p", "ul"]);
    expect((b[0] as { text: string }).text).toContain("    fix");
  });

  it("a hunk runs exactly as far as its header counts, blank context lines included", () => {
    const b = blocks("diff --git a/x b/x\n@@ -1,3 +1,3 @@\n a\n\n-b\n+c\n- list item after the hunk");
    expect(b.map((x) => x.type)).toEqual(["code", "ul"]);
  });

  it("an indented item nests under the item above it", () => {
    const b = blocks("1. Install\n2. Enable\n  - on boot\n3. Done");
    expect(b).toHaveLength(1);
    const l = b[0] as { type: string; items: unknown[]; nested?: ({ items: unknown[] } | undefined)[] };
    expect(l.type).toBe("ol");
    expect(l.items).toHaveLength(3);
    expect(l.nested?.[1]?.items).toHaveLength(1);
  });

  it("vocalized Arabic verse is text, not art", () => {
    const v = "بِسْمِ ٱللَّٰهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ";
    expect(blocks([v, v, v].join("\n"))[0].type).toBe("p");
  });
});

describe("markdown notes (real: a test note, bridged GitHub comments)", () => {
  it("reads a GFM table: header, rows, alignment", () => {
    const b = blocks("| table | test |\n| ------------ | ------------: |\n| TABLE | TEST |\n\nafter");
    expect(b[0]).toMatchObject({ type: "table", align: [undefined, "right"] });
    const t = b[0] as { head: { value?: string }[][]; rows: { value?: string }[][][] };
    expect(t.head.map((c) => c.map((x) => x.value).join(""))).toEqual(["table", "test"]);
    expect(t.rows[0].map((c) => c.map((x) => x.value).join(""))).toEqual(["TABLE", "TEST"]);
    expect(b[1].type).toBe("p");
  });

  it("an aligned table is a table, not ASCII art", () => {
    const b = blocks("| name     | value |\n|----------|-------|\n| foo      | 1     |\n| bar      | 2     |");
    expect(b.map((x) => x.type)).toEqual(["table"]);
  });

  it("a line underlined with === is a heading", () => {
    const b = blocks("Properties for Decentralized Lists\n=====\n\nWe augment the list NIP.");
    expect(b.map((x) => x.type)).toEqual(["h", "p"]);
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

  it("ASCII art's underscore runs never turn bold (art itself renders as a code block)", () => {
    expect(parseInlineMarkdown("__<_____\\__\\__(___)_))_((_(____))__").every((x) => x.type === "text")).toBe(true);
  });

  it("leaves snake_case, arithmetic and lone markers alone", () => {
    for (const s of ["snake_case_name", "2 * 3 * 4", "** nope **", "file_name.txt and other_file", "call __init__ and __main__ here"]) {
      expect(parseInlineMarkdown(s)).toEqual([{ type: "text", value: s }]);
    }
  });
});

describe("fuzz", () => {
  // Seeded, so a failure reproduces. Pieces are the shapes real notes mix.
  const PIECES = ["a", "Bc", "word ", " ", "   ", "\t", "\n", "\n\n", "# ", "#### ", "- ", "+ ", "* ", "1. ", "> ", "\n| a | b |\n|---|:--:|\n", "\n```\n", "\n```js\n", "```x```", "---", "**", "__", "_", "*", "`",
    "@@ -1 +1 @@", "diff --git a/x b/x", "commit 1a2b3c4d", "https://ex.am/p?q=1", "#tag", "🎉", "🇨🇭", "ção", "日本", "|  |", "(__)", "\r\n"];
  const letters = (s: string) => (s.match(/\p{L}/gu) || []).sort().join("");
  /** Multiset containment of two sorted letter strings. */
  const within = (small: string, big: string) => {
    const count = new Map<string, number>();
    for (const c of big) count.set(c, (count.get(c) ?? 0) + 1);
    for (const c of small) {
      const n = count.get(c) ?? 0;
      if (!n) return false;
      count.set(c, n - 1);
    }
    return true;
  };
  const blockText = (b: NoteBlock): string => {
    const t = (ts: NoteToken[]) => ts.map((x) => (x.type === "mention" ? x.bech32 : x.value)).join("");
    switch (b.type) {
      case "code": return b.text;
      case "table": return [...b.head, ...b.rows.flat()].map(t).join("\n");
      case "hr": return "";
      case "ul": case "ol": return [...b.items.map(t), ...(b.nested ?? []).flatMap((n) => (n ? n.items.map(t) : []))].join("\n");
      default: return t(b.tokens);
    }
  };
  it("never throws and never loses a letter", () => {
    let seed = 42;
    const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    for (let n = 0; n < 400; n++) {
      let src = "";
      const len = 5 + Math.floor(rand() * 120);
      for (let i = 0; i < len; i++) src += PIECES[Math.floor(rand() * PIECES.length)];
      const tokens = parseNoteContent(src);
      const out = toNoteBlocks(tokens, { source: src });
      // Every letter survives except a fence's language tag ("```js"), which
      // may go when the line opens a fence — and nothing is invented.
      const got = letters(out.map(blockText).join("\n"));
      const why = JSON.stringify(src) + " => " + JSON.stringify(out);
      expect(within(letters(src.replace(/^([ \t]*```)[\w+#.-]*[ \t]*$/gm, "$1")), got), why).toBe(true);
      expect(within(got, letters(src)), why).toBe(true);
      for (const b of out) if ("tokens" in b) for (const tk of b.tokens) if (tk.type === "text") parseInlineMarkdown(tk.value);
    }
  });
});
