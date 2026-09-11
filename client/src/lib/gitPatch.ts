/**
 * A NIP-34 patch is git's own text, in one of two shapes:
 *
 *   git format-patch          git show
 *   From <sha> Mon Sep 17 …   commit <sha>
 *   From: Name <mail>         Author: Name <mail>
 *   Date: …                   Date:   …
 *   Subject: [PATCH] title
 *                                 title (indented)
 *   message                       message (indented)
 *   ---
 *   diffstat
 *   diff --git …              diff --git …
 *
 * None of forty recent patches on the relay carried a subject tag, so the
 * title, author, message and diff are read from the text. Counts are taken
 * from the diff itself, never trusted from a diffstat.
 */
export interface ParsedPatch {
  format: "mail" | "show" | "plain";
  title: string | null;
  author: string | null;
  date: string | null;
  commit: string | null;
  message: string;
  diff: string;
  files: number;
  added: number;
  removed: number;
}

const stripPatchPrefix = (s: string) => s.replace(/^\s*\[PATCH[^\]]*\]\s*/i, "").trim();
const nameOf = (s: string) => s.replace(/\s*<[^>]*>\s*$/, "").trim();

export function parsePatch(content: string): ParsedPatch {
  const lines = content.replace(/\r\n?/g, "\n").split("\n");
  const diffAt = lines.findIndex((l) => l.startsWith("diff --git "));
  const head = diffAt >= 0 ? lines.slice(0, diffAt) : lines;
  const diffLines = diffAt >= 0 ? lines.slice(diffAt) : [];
  const diff = diffLines.join("\n").trimEnd();
  const files = diffLines.filter((l) => l.startsWith("diff --git ")).length;
  const added = diffLines.filter((l) => l.startsWith("+") && !l.startsWith("+++")).length;
  const removed = diffLines.filter((l) => l.startsWith("-") && !l.startsWith("---")).length;

  if (/^From [0-9a-f]{40} /.test(head[0] ?? "")) {
    const header = (name: string) => head.find((l) => l.startsWith(`${name}: `))?.slice(name.length + 2).trim() ?? null;
    const firstBlank = head.findIndex((l) => l.trim() === "");
    let body = firstBlank >= 0 ? head.slice(firstBlank + 1) : [];
    const cut = body.findIndex((l) => l === "---");
    if (cut >= 0) body = body.slice(0, cut);
    const from = header("From");
    return {
      format: "mail",
      title: header("Subject") ? stripPatchPrefix(header("Subject") as string) || null : null,
      author: from ? nameOf(from) : null,
      date: header("Date"),
      commit: head[0].slice(5, 45),
      message: body.join("\n").trim(),
      diff,
      files,
      added,
      removed,
    };
  }
  const commitLine = head[0]?.match(/^commit ([0-9a-f]{40})/);
  if (commitLine) {
    const header = (name: string) => head.find((l) => l.startsWith(`${name}:`))?.slice(name.length + 1).trim() ?? null;
    const indented = head.filter((l) => /^ {4}/.test(l)).map((l) => l.slice(4).trimEnd());
    const title = indented.find((l) => l.trim()) ?? null;
    const rest = indented.slice(indented.indexOf(title ?? "") + 1);
    const author = header("Author");
    return {
      format: "show",
      title: title?.trim() || null,
      author: author ? nameOf(author) : null,
      date: header("Date"),
      commit: commitLine[1],
      message: rest.join("\n").trim(),
      diff,
      files,
      added,
      removed,
    };
  }
  return { format: "plain", title: null, author: null, date: null, commit: null, message: head.join("\n").trim(), diff, files, added, removed };
}

/**
 * The title of an issue, pull request or patch: the subject tag when there
 * is one; for a patch, what its text says; then the description tag; then
 * the first line of the content. A d-tag is an identifier, never a title.
 */
export function gitItemTitleOf(event: { kind: number; content: string; tags: string[][] }): string {
  const tag = (k: string) => event.tags.find((t) => t[0] === k && t[1]?.trim())?.[1].trim();
  const subject = tag("subject");
  if (subject) return subject;
  if (event.kind === 1617) {
    const parsed = parsePatch(event.content || "");
    // A description tag can run to paragraphs; its first line is the title.
    const described = tag("description")?.split("\n").map((l) => l.trim()).find((l) => l);
    return parsed.title ?? described ?? "Untitled patch";
  }
  const firstLine = (event.content || "")
    .split("\n")
    .map((l) => l.replace(/^#+\s*/, "").trim())
    .find((l) => l);
  if (firstLine) return firstLine.length > 120 ? `${firstLine.slice(0, 117)}…` : firstLine;
  return event.kind === 1618 ? "Untitled pull request" : "Untitled issue";
}

/** Pasted screenshots and bare links carry nothing a summary can say. */
const dropLinks = (s: string) =>
  s
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ") // ![alt](url) — an image
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // [words](url) — keep the words
    .replace(/https?:\/\/\S+/g, " ");

const oneLine = (s: string, max = 200) => {
  const flat = s
    .replace(/^#+\s*/gm, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/`([^`\n]+)`/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
};

/**
 * The line under a git item's title on a card. For a patch, its commit
 * message — never the title again, never git's mail headers; failing that,
 * the description tag minus a repeated title. For an issue or pull request,
 * the body after its title line, with markdown marks stripped.
 */
export function gitItemSummaryOf(event: { kind: number; content: string; tags: string[][] }): string {
  const title = gitItemTitleOf(event);
  const dropTitle = (text: string) => {
    const lines = text.split("\n");
    const first = lines.findIndex((l) => l.trim());
    if (first >= 0 && oneLine(lines[first]) === oneLine(title)) return lines.slice(first + 1).join("\n");
    return text;
  };
  if (event.kind === 1617) {
    const parsed = parsePatch(event.content || "");
    if (parsed.message) return oneLine(dropLinks(dropTitle(parsed.message)));
    const description = event.tags.find((t) => t[0] === "description")?.[1] ?? "";
    return oneLine(dropLinks(dropTitle(description)));
  }
  return oneLine(dropLinks(dropTitle(event.content || "")));
}
