/**
 * What the reader shows of an article's Markdown, and what it lifts out first.
 *
 * NIPs — as kind-30817 specs and as the kind-30818 wiki mirrors of them — open
 * with their own title (`# Title`, or underlined with `===`), which the page
 * already shows above the byline, and then a front matter written as
 * backticked tokens: the spec's own id, its status (`draft` `optional`), and
 * lines naming the kinds and tags it defines — `` `kind` `37570` "TSM Service
 * Announcement" `` — closed by a rule. That is the spec's details, not its
 * prose. The page shows the title once and the details as chips; the body
 * starts where the reading does.
 */
export interface SpecKind {
  kind: string;
  /** As the author wrote it beside the number, when they did. */
  label?: string;
}

export interface SpecTag {
  name: string;
  label?: string;
}

export interface PreparedBody {
  body: string;
  /** The spec's status words, in the order written: draft, optional, final… */
  status: string[];
  /** The kinds the spec defines, from its front matter. */
  kinds: SpecKind[];
  /** The tags the spec defines, from its front matter. */
  tags: SpecTag[];
}

/** NIP-01's vocabulary for a spec's standing, plus the words specs actually use. */
const STATUS_WORDS = new Set(["draft", "optional", "mandatory", "final", "deprecated", "unrecommended", "proposed", "stable", "experimental", "recommended"]);

/** Whitespace and case aside — "(TSM )" in a tag is "(TSM)" in the body. */
const loose = (s: string) => s.replace(/\s+/g, "").toLowerCase();

/** Every backticked token on a line, in order. */
const tokens = (line: string) => [...line.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
/** A trailing "label" in quotes, when the line has one. */
const quoted = (line: string) => line.match(/"([^"]+)"\s*$/)?.[1];
/** A line that is nothing but backticked tokens, optionally followed by a quoted label. */
const TOKEN_LINE = /^\s*(?:`[^`]+`\s*)+(?:"[^"]*")?\s*$/;

export function prepareArticleBody(markdown: string, title: string, opts: { identifier?: string } = {}): PreparedBody {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  let i = 0;
  const skipBlank = () => { while (i < lines.length && lines[i].trim() === "") i++; };

  // The title, once: `# Title`, or the underlined form.
  skipBlank();
  const atx = lines[i]?.match(/^#\s+(.+?)\s*#*\s*$/);
  if (atx && loose(atx[1]) === loose(title)) {
    i++;
  } else if (lines[i] && /^=+\s*$/.test(lines[i + 1] ?? "") && loose(lines[i]) === loose(title)) {
    i += 2;
  }
  skipBlank();

  // The front matter: token lines at the top of the reading (a heading may
  // sit among them — a subtitle, or an unnumbered NIP's own `# NIP-XX`),
  // closed by a rule or by the first prose line.
  const status: string[] = [];
  const kinds: SpecKind[] = [];
  const tags: SpecTag[] = [];
  const kept: string[] = [];
  let j = i;
  for (; j < lines.length; j++) {
    const line = lines[j];
    if (line.trim() === "") { kept.push(line); continue; }
    if (/^#{1,6}\s/.test(line)) { kept.push(line); continue; }
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { j++; break; } // the rule closes the front matter, and goes with it
    if (!TOKEN_LINE.test(line)) break;
    const t = tokens(line);
    const label = quoted(line);
    if (t[0] === "kind" && t[1] && /^\d+$/.test(t[1])) { kinds.push(label ? { kind: t[1], label } : { kind: t[1] }); continue; }
    if (t[0] === "tag" && t[1]) { tags.push(label ? { name: t[1], label } : { name: t[1] }); continue; }
    if (t.length === 1 && opts.identifier && t[0] === opts.identifier) continue; // the spec's own id — the address already says it
    if (t.every((w) => STATUS_WORDS.has(w.toLowerCase())) && !label) { status.push(...t.map((w) => w.toLowerCase())); continue; }
    break; // an unknown token line is the author's prose
  }
  // Only the lines the loop consumed leave the body; what it broke on stays.
  const consumedUpTo = j;
  // The lifted lines leave doubled blanks among the kept ones — collapse
  // those, up to the seam with the untouched rest.
  const body = [...kept, ...lines.slice(consumedUpTo)].filter(
    (line, idx, all) => !(idx > 0 && idx <= kept.length && line.trim() === "" && all[idx - 1].trim() === ""),
  );
  while (body.length && body[0].trim() === "") body.shift();

  return { body: body.join("\n"), status, kinds, tags };
}
