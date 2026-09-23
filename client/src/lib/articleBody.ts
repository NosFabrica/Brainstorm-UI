/**
 * What the reader shows of an article's Markdown, and what it lifts out first.
 *
 * NIPs — as kind-30817 specs and as the kind-30818 wiki mirrors of them — open
 * with their own `# Title`, which the page already shows above the byline, and
 * then a line of backticked status words, `` `draft` `optional` ``: metadata
 * dressed as code. The page shows the title once and the status as chips; the
 * body starts where the reading does.
 */
export interface PreparedBody {
  body: string;
  /** The spec's status words, in the order written: draft, optional, final… */
  status: string[];
}

const loose = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

/** A line that is nothing but backticked single words: `` `draft` `optional` ``. */
const STATUS_LINE = /^(?:\s*`[a-z][\w-]*`\s*)+$/i;

export function prepareArticleBody(markdown: string, title: string): PreparedBody {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  let i = 0;
  const skipBlank = () => { while (i < lines.length && lines[i].trim() === "") i++; };

  skipBlank();
  const heading = lines[i]?.match(/^#\s+(.+?)\s*#*\s*$/);
  if (heading && loose(heading[1]) === loose(title)) {
    i++;
    skipBlank();
  }

  // The status line sits at the top of the reading — after the title, and
  // after a subtitle heading when the spec has one (NIP-21: `## \`nostr:\` URI scheme`).
  const rest = lines.slice(i);
  let status: string[] = [];
  let j = 0;
  while (j < rest.length && (rest[j].trim() === "" || /^#{2,6}\s/.test(rest[j]))) j++;
  if (j < rest.length && STATUS_LINE.test(rest[j])) {
    status = [...rest[j].matchAll(/`([^`]+)`/g)].map((m) => m[1].toLowerCase());
    rest.splice(j, 1);
    while (j < rest.length && rest[j].trim() === "") rest.splice(j, 1);
  }

  return { body: rest.join("\n"), status };
}
