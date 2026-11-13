import { relativeDay } from "@/lib/scheduledTasks";
import { MASTHEAD, type Usage } from "@/lib/frontPage/writer";

/**
 * What a print is doing, for the reader: one status line, the steps, and a log behind
 * "Show details". Pure: the print service reports events, the print job folds them in
 * here (`reduceProgress`), and the page reads the result.
 */

/** The desks read so far (services/frontPage `PullProgress`). */
export interface DeskProgress {
  desksDone: number;
  desksTotal: number;
  events: number;
}

/** What one write request reports, from sending it to its last byte. */
export type WriteEvent =
  /** The request went out; `streamed` false for the non-streamed retry. */
  | { type: "sent"; streamed: boolean }
  /** The first bytes of a streamed answer. */
  | { type: "first-byte" }
  /** An SSE comment: nothing to read, but the provider is still there. */
  | { type: "alive" }
  | { type: "reasoning"; text: string }
  | { type: "content"; text: string }
  /** The provider answers in one piece: there is nothing to show until it's all here. */
  | { type: "whole" }
  | { type: "done"; chars: number; usage: Usage | null };

/** What the print service reports (`printFrontPage`'s `onEvent`). */
export type ServiceEvent =
  | { type: "probe" }
  | { type: "pull"; progress: DeskProgress }
  /** Pass 1: the model plans the paper (which story leads, which posts to read in full). */
  | { type: "plan"; event: WriteEvent }
  /** The plan came back: its lead's angle, and how many posts go to the writer in full. */
  | { type: "planned"; lead: string | null; full: number }
  /** No plan came back (not JSON, an error, too slow): the page is written from the digest alone. */
  | { type: "plan-failed" }
  /** Round 1 writes the page; each later round repairs it. */
  | { type: "write"; round: number; event: WriteEvent }
  | { type: "check"; round: number }
  /** `last`: no repair round follows; problems now mean no paper. */
  | { type: "checked"; round: number; last?: boolean; quotes: number; violations: number; removed: number };

/** Everything the log hears: the service's events, and the job's own around them. */
export type PrintEvent =
  | ServiceEvent
  | { type: "start"; provider: string; model: string }
  | { type: "publish"; state: "confirm" | "publishing" | "published" | "failed"; message?: string }
  | { type: "end"; outcome: "printed" | "refused" | "pending" | "error" | "cancelled"; message?: string };

export type WritePhase = "waiting" | "thinking" | "writing" | "whole";

export interface WriteState {
  phase: WritePhase;
  /** When the request went out (ms). */
  sentAt: number;
  firstByteAt: number | null;
  /** The page so far. */
  text: string;
  reasoningChars: number;
  /** The newest complete headline in the page so far. */
  headline: string | null;
  /** Keep-alives seen this round: logged once. */
  alive: boolean;
}

export interface LogLine {
  at: number;
  text: string;
}

export interface PrintProgress {
  startedAt: number;
  provider: string;
  model: string;
  step: "probe" | "pull" | "plan" | "write" | "check";
  /** 1 writes the page; 2 and on repair it. */
  round: number;
  pull: DeskProgress | null;
  write: WriteState | null;
  /** The last `THINKING_KEEP` characters of this round's thinking. */
  thinking: string;
  /** Problems the check found in the last round: what the next repair round fixes. */
  problems: number;
  log: LogLine[];
}

export const THINKING_KEEP = 4_000;

/** The plan pass, as the reader is told. */
export const PLANNING = "Planning the paper";
const HEADLINE_MAX = 60;

export function startProgress(provider: string, model: string, at: number): PrintProgress {
  return {
    startedAt: at,
    provider,
    model,
    step: "probe",
    round: 1,
    pull: null,
    write: null,
    thinking: "",
    problems: 0,
    log: [{ at, text: `${provider} · ${model}` }],
  };
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };

/** A headline's words: tags out, the common entities read, whitespace collapsed, cut to fit a line. */
function headlineText(inner: string): string {
  const text = inner
    .replace(/<[^>]*>/g, " ")
    .replace(/&(#?\w+);/g, (m, name: string) => {
      if (ENTITIES[name]) return ENTITIES[name];
      const code = /^#x([0-9a-f]+)$/i.exec(name)?.[1];
      const n = code ? parseInt(code, 16) : /^#(\d+)$/.exec(name) ? Number(name.slice(1)) : NaN;
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
    })
    .replace(/\s+/g, " ")
    .trim();
  return text.length > HEADLINE_MAX ? `${text.slice(0, HEADLINE_MAX - 1).trimEnd()}…` : text;
}

/**
 * The newest complete `h1`–`h3` in a page still being written, as a line of text; null
 * when none has closed yet. The masthead is not a headline. A heading still open at the
 * end of the text is not counted until it closes.
 */
export function latestHeadline(html: string): string | null {
  const re = /<h([1-3])\b[^>]*>([\s\S]*?)<\/h\1\s*>/gi;
  let found: string | null = null;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    const text = headlineText(m[2]);
    if (text && text.toLowerCase() !== MASTHEAD.name.toLowerCase()) found = text;
  }
  return found;
}

/** How far back of a new delta a heading's opening tag may sit: a long tag plus its words. */
const HEADLINE_LOOKBACK = 1_200;

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;
const kChars = (n: number) => `${(n / 1000).toFixed(1)}k characters`;

function withLog(p: PrintProgress, at: number, text: string): PrintProgress {
  return { ...p, log: [...p.log, { at, text }] };
}

/** What the desks read, said once, when the model is first asked. */
function withReadLine(p: PrintProgress, at: number): PrintProgress {
  return p.pull
    ? withLog(p, at, `Read ${p.pull.events.toLocaleString()} posts from ${p.pull.desksDone}/${p.pull.desksTotal} desks`)
    : p;
}

const freshWrite = (at: number, streamed: boolean): WriteState => ({
  phase: streamed ? "waiting" : "whole",
  sentAt: at,
  firstByteAt: null,
  text: "",
  reasoningChars: 0,
  headline: null,
  alive: false,
});

/** The plan call: its wait and its thinking show; its answer (JSON) doesn't. */
function reducePlan(p: PrintProgress, e: WriteEvent, at: number): PrintProgress {
  if (e.type === "sent") {
    const next: PrintProgress = { ...p, step: "plan", thinking: "", write: freshWrite(at, e.streamed) };
    if (p.step !== "plan") return withLog(withReadLine(next, at), at, PLANNING);
    return withLog(next, at, "Request sent again without streaming");
  }
  if (e.type === "content" || e.type === "whole" || e.type === "done") return p;
  return reduceWrite(p, p.round, e, at);
}

function reduceWrite(p: PrintProgress, round: number, e: WriteEvent, at: number): PrintProgress {
  if (e.type === "sent") {
    const next: PrintProgress = { ...p, step: "write", round, thinking: "", write: freshWrite(at, e.streamed) };
    // With no plan step before it (an older run), the desks are said here.
    const desks = round === 1 && p.step === "pull" ? withReadLine(next, at) : next;
    if (!e.streamed) return withLog(desks, at, "Request sent again without streaming");
    return withLog(
      desks,
      at,
      round > 1
        ? `Repair request sent: ${p.problems} ${p.problems === 1 ? "problem" : "problems"} to fix`
        : "Request sent",
    );
  }
  const w = p.write;
  if (!w) return p;
  switch (e.type) {
    case "first-byte":
      return w.firstByteAt === null
        ? withLog({ ...p, write: { ...w, firstByteAt: at } }, at, `First byte after ${seconds(at - w.sentAt)}`)
        : p;
    case "alive":
      return w.alive ? p : withLog({ ...p, write: { ...w, alive: true } }, at, "The provider says it is still working");
    case "reasoning": {
      if (!e.text) return p;
      const thinking = (p.thinking + e.text).slice(-THINKING_KEEP);
      // Thinking after the page has started is a model checking its work: the line stays on the page.
      const phase: WritePhase = w.phase === "writing" || w.phase === "whole" ? w.phase : "thinking";
      const next = { ...p, thinking, write: { ...w, phase, reasoningChars: w.reasoningChars + e.text.length } };
      return w.phase === "waiting" ? withLog(next, at, "Thinking") : next;
    }
    case "content": {
      if (!e.text) return p;
      const text = w.text + e.text;
      const tail = text.slice(Math.max(0, text.length - e.text.length - HEADLINE_LOOKBACK));
      const headline = latestHeadline(tail) ?? w.headline;
      let next: PrintProgress = {
        ...p,
        write: { ...w, text, headline, phase: w.phase === "whole" ? "whole" : "writing" },
      };
      if (w.phase !== "writing" && w.phase !== "whole") next = withLog(next, at, "Writing started");
      if (headline && headline !== w.headline && w.phase !== "whole") next = withLog(next, at, `Section: ${headline}`);
      return next;
    }
    case "whole":
      return withLog({ ...p, write: { ...w, phase: "whole" } }, at, "This provider sends the page all at once");
    case "done": {
      const tokens = e.usage ? (e.usage.promptTokens ?? 0) + (e.usage.completionTokens ?? 0) : 0;
      return withLog(
        p,
        at,
        `Writing done: ${kChars(e.chars)}${tokens ? `, ${tokens.toLocaleString()} tokens` : ""}, after ${seconds(at - w.sentAt)}`,
      );
    }
  }
}

/** One event folded into the progress. `at` is when it happened (ms). */
export function reduceProgress(p: PrintProgress, e: PrintEvent, at: number): PrintProgress {
  switch (e.type) {
    case "start":
      return startProgress(e.provider, e.model, at);
    case "probe":
      return withLog({ ...p, step: "probe" }, at, "Checking your ranking");
    case "pull":
      return p.pull === null
        ? withLog({ ...p, step: "pull", pull: e.progress }, at, `Reading ${e.progress.desksTotal} desks`)
        : { ...p, step: "pull", pull: e.progress };
    case "plan":
      return reducePlan(p, e.event, at);
    case "planned":
      return withLog(p, at, `Planned · posts read in full: ${e.full}${e.lead ? ` · lead: ${e.lead}` : ""}`);
    case "plan-failed":
      return withLog(p, at, "No plan came back · writing from the digest alone");
    case "write":
      return reduceWrite(p, e.round, e.event, at);
    case "check":
      return withLog({ ...p, step: "check", round: e.round }, at, "Checking quotes, pictures and links");
    case "checked": {
      if (e.violations === 0) {
        const removed = e.removed ? `, ${e.removed} ${e.removed === 1 ? "thing" : "things"} removed` : "";
        return withLog(p, at, `Check passed: ${e.quotes} ${e.quotes === 1 ? "quote" : "quotes"} verified${removed}`);
      }
      return withLog(
        { ...p, problems: e.violations },
        at,
        `Check found ${e.violations} ${e.violations === 1 ? "problem" : "problems"}${e.last ? ": not printed" : ""}`,
      );
    }
    case "publish": {
      const text =
        e.state === "confirm"
          ? "Waiting for your OK to publish"
          : e.state === "publishing"
            ? "Publishing to your Observer"
            : e.state === "published"
              ? "Published to your Observer"
              : `Publishing failed${e.message ? `: ${e.message}` : ""}`;
      return withLog(p, at, text);
    }
    case "end": {
      const text =
        e.outcome === "printed"
          ? "Paper ready"
          : e.outcome === "refused"
            ? "Not printed: the page didn't pass the check"
            : e.outcome === "pending"
              ? "Not printed: search isn't ranking through you yet"
              : e.outcome === "cancelled"
                ? "Cancelled"
                : `Stopped${e.message ? `: ${e.message}` : ""}`;
      return withLog(p, at, text);
    }
  }
}

/** `0:07`, `1:42`: how long the model has been quiet. */
export function elapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** The writing row's words. `now` only adds the wait's clock (`withClock`); the live region leaves it out. */
export function writeLine(p: PrintProgress, now: number, withClock = true): string {
  const w = p.write;
  if (p.round > 1) return "Fixing the page";
  if (!w) return "Writing";
  switch (w.phase) {
    case "waiting":
      return withClock ? `Waiting for the model… ${elapsed(now - w.sentAt)}` : "Waiting for the model…";
    case "thinking":
      return "Thinking…";
    case "writing":
      return w.headline ? `Writing: ${w.headline}` : "Writing";
    case "whole":
      return "Writing (this provider sends the page all at once)";
  }
}

/** Under the writing row, quietly: how much of the page has arrived, while it streams. */
export function writeDetail(p: PrintProgress): string | null {
  const w = p.write;
  if (!w || w.phase === "whole" || w.phase === "waiting") return null;
  if (w.phase === "thinking") return null;
  return kChars(w.text.length);
}

/** The step the print is on, in a line: what the status region says. */
export function statusLine(p: PrintProgress, now: number, withClock = true): string {
  switch (p.step) {
    case "probe":
      return "Checking your ranking";
    case "pull":
      return p.pull ? `Reading the desks · ${p.pull.events.toLocaleString()} posts` : "Reading the desks";
    case "plan":
      return PLANNING;
    case "write":
      return writeLine(p, now, withClock);
    case "check":
      return "Checking quotes, pictures and links";
  }
}

// --- an edition's day -------------------------------------------------------------

/**
 * An edition's day as the rest of the app says a day: Today, Yesterday, a weekday within
 * the week, then a short date (`relativeDay`), on the calendar of `zone`, the zone the
 * page reads today in. `now` ticks, so the words roll over at midnight.
 */
export function editionDayLabel(at: number, now: number, zone: string): string {
  const day = relativeDay(at, now, zone);
  return day.charAt(0).toUpperCase() + day.slice(1);
}

/** The full date, for screen readers and the details: "Wednesday, November 11, 2026". */
export function editionFullDate(at: number, zone: string): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: zone,
  }).format(new Date(at));
}
