/**
 * Print today's front page: check the reader's ranking, pull the desks through it,
 * have the reader's own AI write the page, then resolve and check it.
 *
 * Ported from NosFabrica/the-nostr-observer @ 0901b92 (MIT, see
 * lib/frontPage/LICENSE.observer): the `nostr-observer` skill's Steps 2–6
 * (`readiness.mjs`, `corpus.mjs`, the writer, `resolve.mjs`, `validate.mjs`). What it
 * does not do is anything after the page: no publishing, no Blossom, no archive. The
 * page lives in memory and in the reader's download, nowhere else.
 *
 * Not through the EventStore (ADR 0005), on purpose, like the relay probes it lists:
 * an edition is a MEASUREMENT of what one ranked read returned in one window. Copies of
 * the same events held from other relays would change what the page is made of, and
 * the edition code is a fingerprint of exactly that set. Nothing here caches either.
 */
import type { NostrEvent } from "nostr-tools";
import type { Relay } from "applesauce-relay";
import { searchRelay } from "@/lib/searchRelay";
import { apiRoot, type AgentKey } from "@/lib/agentKeys";
import {
  DEFAULT_TRUST_FLOOR,
  DESKS,
  INCLUDE_SPAM,
  WINDOW_SECONDS,
  belongs,
  filterFor,
  rankedProbe,
} from "@/lib/frontPage/desks";
import { assemble, digest, profilesFrom, type Corpus } from "@/lib/frontPage/corpus";
import { noteworthy, resolve, type ResolveChange } from "@/lib/frontPage/resolve";
import type { ServiceEvent, WriteEvent } from "@/lib/frontPage/printProgress";
import { check, serialize, withPaperCsp, type Violation } from "@/lib/frontPage/validate";
import {
  authHeaders,
  chatRequest,
  extractDocument,
  parseStreamLine,
  readCompletion,
  unfinished,
  readModelIds,
  repairMessage,
  systemPrompt,
  userMessage,
  type ChatMessage,
  type Usage,
} from "@/lib/frontPage/writer";

type ReqRelay = Pick<Relay, "req" | "url">;

/**
 * How many bytes of filter one REQ may carry. The relay advertises
 * `max_message_length: 262144` and DROPS an oversized frame with no NOTICE and no
 * CLOSED: the subscription sits silent until the idle timer, and the caller gets an
 * empty list that looks exactly like a quiet day. Under the cap because it is on the
 * whole frame.
 */
export const MAX_REQ_BYTES = 240_000;

export interface RelayAnswer {
  events: NostrEvent[];
  /** Why it ended, when it was not a clean EOSE: idle, deadline, closed: <reason>, aborted. */
  note: string | null;
}

/**
 * One REQ, drained until EOSE, CLOSED, or the relay goes quiet.
 *
 * The timeout is an IDLE window, not a deadline: a slow relay finishes and a silent one
 * is given up on. It never throws: an empty list is a supported answer everywhere, and
 * the readiness gate — not this — decides whether empty means broken. AUTH and NOTICE
 * frames never reach here (the pool answers AUTH), so an unprompted challenge cannot
 * read as the answer.
 */
export function askRelay(
  relay: ReqRelay,
  filter: Record<string, unknown>,
  { idleMs = 25_000, signal }: { idleMs?: number; signal?: AbortSignal } = {},
): Promise<RelayAnswer> {
  const size = new TextEncoder().encode(JSON.stringify(filter)).length;
  if (size > MAX_REQ_BYTES) {
    return Promise.reject(new Error(`A request of ${size} bytes is over the relay's ${MAX_REQ_BYTES}-byte budget.`));
  }
  return new Promise((done) => {
    const events: NostrEvent[] = [];
    const seen = new Set<string>();
    let finished = false;
    let idle: ReturnType<typeof setTimeout> | undefined;
    let sub: { unsubscribe: () => void } | undefined;
    const finish = (note: string | null) => {
      if (finished) return;
      finished = true;
      clearTimeout(idle);
      clearTimeout(hard);
      signal?.removeEventListener("abort", onAbort);
      // Unsubscribing sends CLOSE for a REQ the relay has not ended itself.
      queueMicrotask(() => sub?.unsubscribe());
      done({ events, note });
    };
    const touch = () => {
      clearTimeout(idle);
      idle = setTimeout(() => finish("idle"), idleMs);
    };
    const onAbort = () => finish("aborted");
    // A wall clock over the idle clock: a guard, so no read can block forever.
    const hard = setTimeout(() => finish("deadline"), idleMs * 2 + 5_000);
    if (signal?.aborted) return finish("aborted");
    signal?.addEventListener("abort", onAbort);
    touch();
    sub = relay.req([filter as never]).subscribe({
      next: (msg) => {
        if (msg.type === "EVENT") {
          if (msg.event?.id && !seen.has(msg.event.id)) {
            seen.add(msg.event.id);
            events.push(msg.event);
          }
          touch();
        } else if (msg.type === "EOSE") {
          finish(null);
        } else if (msg.type === "CLOSED") {
          finish(`closed: ${(msg as { reason?: string }).reason ?? ""}`.trim());
        }
      },
      error: (err: unknown) => finish(`error: ${err instanceof Error ? err.message : String(err)}`),
      complete: () => finish(null),
    });
  });
}

/** Run tasks a few at a time. The relay has spells of not answering; do not hammer it. */
async function pool<T, R>(items: T[], width: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(width, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      out[index] = await worker(items[index]);
    }
  });
  await Promise.all(runners);
  return out;
}

// --- the ranking gate --------------------------------------------------------

export type ProbeVerdict = "ready" | "projection-pending" | "relay-unreachable";

/**
 * The Observer's link 4: the same question asked through the reader's ranking and
 * without it. Brainstorm's own gate (`useCanSearchMywot`) has already established the
 * links above it — an assistant whose scores rank, and a profile answering through the
 * reader's lens. This is the one thing that gate cannot see: cards stored but not yet
 * PROJECTED for kind 1, where the observed read returns nothing while the anonymous one
 * returns notes. Asking both is also what stops an empty window reading as broken.
 */
export async function probeRanking(
  relay: ReqRelay,
  observer: string,
  since: number,
  signal?: AbortSignal,
): Promise<ProbeVerdict> {
  const [observed, anonymous] = await Promise.all([
    askRelay(relay, rankedProbe(observer, since), { idleMs: 15_000, signal }),
    askRelay(relay, rankedProbe(null, since), { idleMs: 15_000, signal }),
  ]);
  // Only clean answers say anything: a read that timed out or was closed returned
  // nothing because nothing came back, not because the window was empty.
  if (observed.note !== null || anonymous.note !== null) return "relay-unreachable";
  return anonymous.events.length > 0 && observed.events.length === 0 ? "projection-pending" : "ready";
}

// --- the corpus ------------------------------------------------------------

export interface PullProgress {
  desksDone: number;
  desksTotal: number;
  events: number;
}

export async function pullCorpus({
  relay,
  observer,
  until = Math.floor(Date.now() / 1000),
  floor = DEFAULT_TRUST_FLOOR,
  signal,
  onProgress,
}: {
  relay: ReqRelay;
  observer: string;
  until?: number;
  floor?: number;
  signal?: AbortSignal;
  onProgress?: (p: PullProgress) => void;
}): Promise<Corpus> {
  const since = until - WINDOW_SECONDS;
  const total = DESKS.length + 1;
  let desksDone = 0;
  let events = 0;
  const report = (n: number) => {
    desksDone += 1;
    events += n;
    onProgress?.({ desksDone, desksTotal: total, events });
  };

  const results = await pool([...DESKS, null], 5, async (desk) => {
    if (desk === null) {
      // The control run: the same window, no ranking, NO FLOOR.
      const { events: control } = await askRelay(
        relay,
        { ...filterFor([1], since, until, 400, null, floor) },
        { signal },
      );
      report(0);
      return { key: "__control__", events: control, note: null };
    }
    const { events: found, note } = await askRelay(
      relay,
      { ...filterFor(desk.kinds, since, until, desk.limit, observer, floor) },
      { signal },
    );
    const kept = belongs(desk, observer, found);
    report(kept.length);
    return { key: desk.key, events: kept, note };
  });
  signal?.throwIfAborted();

  // A desk that timed out or was closed came back empty because nothing came back. With
  // most of them like that, the "paper" would be a relay outage written up as a quiet day,
  // so it stops here, before a model is paid to write it.
  const unanswered = results.filter((r) => r.key !== "__control__" && r.note !== null).map((r) => r.key);
  if (unanswered.length > DESKS.length / 2) {
    throw new RelayOutageError(
      `The search relay didn't answer for ${unanswered.length} of ${DESKS.length} desks. Nothing was sent to your AI; try again in a few minutes.`,
    );
  }

  const desks: Record<string, NostrEvent[]> = {};
  let control: NostrEvent[] = [];
  for (const result of results) {
    if (result.key === "__control__") control = result.events;
    else desks[result.key] = result.events;
  }

  // Bylines. Chunked: one REQ carrying every author of a busy day is the largest frame
  // this builds, and going over the cap would drop it in silence. `include:spam`
  // because a profile read names no observer and the relay closes it without one.
  const authors = [
    ...new Set(
      Object.values(desks)
        .flat()
        .map((e) => e.pubkey),
    ),
  ];
  const perChunk = Math.max(1, Math.floor((MAX_REQ_BYTES * 0.8) / 70));
  const chunks: string[][] = [];
  for (let at = 0; at < authors.length; at += perChunk) chunks.push(authors.slice(at, at + perChunk));
  const found = (
    await pool(
      chunks,
      3,
      async (some) => (await askRelay(relay, { kinds: [0], authors: some, search: INCLUDE_SPAM }, { signal })).events,
    )
  ).flat();
  signal?.throwIfAborted();

  const corpus = assemble({
    observer,
    relay: relay.url,
    floor,
    since,
    until,
    desks,
    control,
    profiles: profilesFrom(found),
  });
  return unanswered.length ? { ...corpus, unanswered } : corpus;
}

// --- the writer ------------------------------------------------------------

/** A provider answered with a failure; `message` is written for the reader. */
export class WriterError extends Error {
  constructor(
    message: string,
    readonly status: number | null = null,
  ) {
    super(message);
    this.name = "WriterError";
  }
}

/** The search relay didn't answer enough of the run to make a paper of it. */
export class RelayOutageError extends WriterError {
  constructor(message: string) {
    super(message);
    this.name = "RelayOutageError";
  }
}

function explain(status: number, body: string): string {
  if (status === 401 || status === 403)
    return "Your AI key was rejected. Check it in Settings › Assistants › AI model.";
  if (status === 402) return "Your AI key is out of credit.";
  if (status === 429) return "Your AI provider is rate-limiting this key. Try again in a minute.";
  if (status === 404) return "The provider doesn't know that model. Pick another one.";
  const said = body.replace(/\s+/g, " ").trim().slice(0, 160);
  return `Your AI provider answered with an error (${status})${said ? `: ${said}` : "."}`;
}

/** The models a key can use, best guess first is the caller's job (`rankModels`). */
export async function fetchModels(key: AgentKey, signal?: AbortSignal): Promise<string[]> {
  const response = await fetch(`${apiRoot(key.url)}/models`, { headers: authHeaders(key), signal });
  if (!response.ok) throw new WriterError(explain(response.status, ""), response.status);
  return readModelIds(await response.json().catch(() => null));
}

export interface Written {
  text: string;
  usage: Usage | null;
}

/**
 * One completion, streamed so the reader sees the page arrive; non-streamed when the
 * provider refuses a stream (a 400/415/422 on the streaming request, or an answer that
 * is not an event stream).
 */
export async function writePage({
  key,
  model,
  messages,
  signal,
  onText,
  onEvent,
}: {
  key: AgentKey;
  model: string;
  messages: ChatMessage[];
  signal?: AbortSignal;
  onText?: (chars: number) => void;
  /** What the request is doing, for the progress and its log. */
  onEvent?: (event: WriteEvent) => void;
}): Promise<Written> {
  const whole = (written: Written) => {
    onText?.(written.text.length);
    onEvent?.({ type: "content", text: written.text });
    onEvent?.({ type: "done", chars: written.text.length, usage: written.usage });
    return written;
  };
  const streamed = chatRequest(key, model, messages, true);
  let response: Response;
  onEvent?.({ type: "sent", streamed: true });
  try {
    response = await fetch(streamed.url, { ...streamed.init, signal });
  } catch (err) {
    if (signal?.aborted) throw err;
    throw new WriterError("Couldn't reach your AI provider from this page.");
  }

  const isStream = (response.headers.get("content-type") ?? "").includes("text/event-stream");
  if (response.ok && isStream && response.body) {
    const written = await readStream(response.body, onText, onEvent);
    onEvent?.({ type: "done", chars: written.text.length, usage: written.usage });
    return written;
  }
  if (response.ok) {
    // Asked for a stream, answered in one piece: nothing to show until it is all here.
    onEvent?.({ type: "whole" });
    return whole(completed(await response.json().catch(() => null)));
  }
  if (![400, 415, 422].includes(response.status)) {
    throw new WriterError(explain(response.status, await response.text().catch(() => "")), response.status);
  }

  const plain = chatRequest(key, model, messages, false);
  onEvent?.({ type: "sent", streamed: false });
  const second = await fetch(plain.url, { ...plain.init, signal });
  if (!second.ok) throw new WriterError(explain(second.status, await second.text().catch(() => "")), second.status);
  return whole(completed(await second.json().catch(() => null)));
}

/**
 * The stream, to `[DONE]`. An `{"error": …}` frame, a `finish_reason` other than `stop`,
 * or a stream that just stops (no `[DONE]`, no `stop`) is a failure: a page cut off
 * halfway is never handed to the check as if it were the paper.
 */
export async function readStream(
  body: ReadableStream<Uint8Array>,
  onText?: (chars: number) => void,
  onEvent?: (event: WriteEvent) => void,
): Promise<Written> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let usage: Usage | null = null;
  let finishReason: string | null = null;
  let sawDone = false;
  let firstByte = false;
  const take = (line: string) => {
    const chunk = parseStreamLine(line);
    if (chunk.error) throw new WriterError(`Your AI provider failed partway: ${chunk.error.slice(0, 160)}`);
    if (chunk.alive) onEvent?.({ type: "alive" });
    if (chunk.reasoning) onEvent?.({ type: "reasoning", text: chunk.reasoning });
    if (chunk.text) {
      text += chunk.text;
      onText?.(text.length);
      onEvent?.({ type: "content", text: chunk.text });
    }
    if (chunk.usage) usage = chunk.usage;
    if (chunk.finishReason) finishReason = chunk.finishReason;
    if (chunk.done) sawDone = true;
  };
  try {
    while (!sawDone) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!firstByte) {
        firstByte = true;
        onEvent?.({ type: "first-byte" });
      }
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        take(line);
        if (sawDone) break;
      }
    }
    if (!sawDone) take(buffer + decoder.decode());
  } finally {
    // Done reading (or failing): let the connection go instead of draining the rest.
    reader.cancel().catch(() => {});
  }
  const why = unfinished(finishReason, { required: !sawDone });
  if (why) throw new WriterError(`No paper: ${why}. Try again, or pick another model.`);
  return { text, usage };
}

/** A non-streamed answer, held to the same rule as a streamed one. */
function completed(json: unknown): Written {
  const { text, usage, finishReason, error } = readCompletion(json);
  if (error) throw new WriterError(`Your AI provider answered with an error: ${error.slice(0, 160)}`);
  const why = unfinished(finishReason, { required: false });
  if (why) throw new WriterError(`No paper: ${why}. Try again, or pick another model.`);
  return { text, usage };
}

// --- the whole run ----------------------------------------------------------

export type PrintStep =
  | { step: "probe" }
  | { step: "pull"; progress: PullProgress }
  | { step: "write"; round: 1 | 2; chars: number }
  | { step: "check"; round: 1 | 2 };

export type PrintResult =
  | { status: "not-ready"; reason: ProbeVerdict }
  | {
      status: "printed";
      html: string;
      corpus: Corpus;
      changes: ResolveChange[];
      quotes: number;
      usage: Usage | null;
      rounds: 1 | 2;
    }
  | { status: "refused"; violations: Violation[]; changes: ResolveChange[]; corpus: Corpus; usage: Usage | null };

function addUsage(a: Usage | null, b: Usage | null): Usage | null {
  if (!a) return b;
  if (!b) return a;
  const sum = (x: number | null, y: number | null) => (x === null && y === null ? null : (x ?? 0) + (y ?? 0));
  return {
    promptTokens: sum(a.promptTokens, b.promptTokens),
    completionTokens: sum(a.completionTokens, b.completionTokens),
  };
}

/**
 * The run, start to finish. The validator is not negotiable: a page that is still
 * refused after one repair round is never returned as a page.
 */
export async function printFrontPage({
  key,
  model,
  observer,
  readerName,
  relay = searchRelay(),
  signal,
  onStep,
  onEvent,
}: {
  key: AgentKey;
  model: string;
  observer: string;
  readerName: string;
  relay?: ReqRelay | null;
  signal?: AbortSignal;
  onStep?: (step: PrintStep) => void;
  /** The run in detail, for its progress and log (lib/frontPage/printProgress). */
  onEvent?: (event: ServiceEvent) => void;
}): Promise<PrintResult> {
  if (!relay) throw new WriterError("The search relay isn't configured.");
  const until = Math.floor(Date.now() / 1000);

  onStep?.({ step: "probe" });
  onEvent?.({ type: "probe" });
  const verdict = await probeRanking(relay, observer, until - WINDOW_SECONDS, signal);
  signal?.throwIfAborted();
  if (verdict !== "ready") return { status: "not-ready", reason: verdict };

  const corpus = await pullCorpus({
    relay,
    observer,
    until,
    signal,
    onProgress: (progress) => {
      onStep?.({ step: "pull", progress });
      onEvent?.({ type: "pull", progress });
    },
  });

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt() },
    { role: "user", content: userMessage(digest(corpus), readerName, readerLanguage()) },
  ];

  let usage: Usage | null = null;
  for (const round of [1, 2] as const) {
    onStep?.({ step: "write", round, chars: 0 });
    const written = await writePage({
      key,
      model,
      messages,
      signal,
      onText: (chars) => onStep?.({ step: "write", round, chars }),
      onEvent: (event) => onEvent?.({ type: "write", round, event }),
    });
    usage = addUsage(usage, written.usage);
    const page = extractDocument(written.text);
    if (!page) throw new WriterError("Your AI answered without a page. Try again, or pick another model.");

    onStep?.({ step: "check", round });
    onEvent?.({ type: "check", round });
    const resolved = resolve(page, corpus);
    const verdict = check(resolved.doc, corpus);
    onEvent?.({
      type: "checked",
      round,
      quotes: verdict.quotes.length,
      violations: verdict.violations.length,
      removed: noteworthy(resolved.changes).length,
    });
    if (verdict.violations.length === 0) {
      return {
        status: "printed",
        // The page as checked (settled after a round trip), with the app's own CSP: it
        // may leave the sandbox, as a Download or on the reader's Observer site.
        html: withPaperCsp(serialize(verdict.doc)),
        corpus,
        changes: resolved.changes,
        quotes: verdict.quotes.length,
        usage,
        rounds: round,
      };
    }
    if (round === 2)
      return { status: "refused", violations: verdict.violations, changes: resolved.changes, corpus, usage };
    messages.push({ role: "assistant", content: page }, { role: "user", content: repairMessage(verdict.violations) });
  }
  // Unreachable: round 2 always returns.
  throw new WriterError("The page could not be checked.");
}

/** The reader's language for the paper: the browser's own, which is what they read the app in. */
function readerLanguage(): string | null {
  return typeof navigator !== "undefined" && navigator.language ? navigator.language : null;
}
