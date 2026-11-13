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
import { isRoutstrModels, parseModels, readRoutstrError, routstrProblem, type RoutstrModel } from "@/lib/routstr";
import { apiRoot, type AgentKey } from "@/lib/agentKeys";
import {
  DEFAULT_TRUST_FLOOR,
  DESKS,
  INCLUDE_SPAM,
  WINDOW_SECONDS,
  belongs,
  filterFor,
  lookbackOf,
  pickRecipe,
  rankedProbe,
  recipeAddress,
} from "@/lib/frontPage/desks";
import {
  assemble,
  corpusEvents,
  digest,
  highlightAuthorKeys,
  keptInDigest,
  profilesFrom,
  type Corpus,
} from "@/lib/frontPage/corpus";
import { EditionClock, emptyContext, type EditionContext } from "@/lib/frontPage/edition";
import { BRAINSTORM_LINKS, type PaperLinkSet } from "@/lib/frontPage/links";
import type { WritingEffort } from "@/lib/frontPage/observerSchedule";
import {
  PLAN_INSTRUCTION,
  PLAN_TIMEOUT_MS,
  fullBlock,
  insertHouseCss,
  parsePlan,
  writeMessage,
  type EditionPlan,
} from "@/lib/frontPage/plan";
import { noteworthy, resolve, type ResolveChange } from "@/lib/frontPage/resolve";
import type { ServiceEvent, WriteEvent } from "@/lib/frontPage/printProgress";
import { check, serialize, withPaperCsp, type Violation } from "@/lib/frontPage/validate";
import {
  approxTokens,
  authHeaders,
  carriesExtras,
  chatRequest,
  corpusPrefix,
  editionHeader,
  extractDocument,
  messageText,
  outputTokenLimit,
  parseStreamLine,
  planTokenLimit,
  readCompletion,
  readModelLimits,
  unfinished,
  readModelIds,
  repairMessage,
  systemPrompt,
  type CallOptions,
  type ChatMessage,
  type ModelLimits,
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
  recentRecipes = new Set<string>(),
  links = BRAINSTORM_LINKS,
  signal,
  onProgress,
}: {
  relay: ReqRelay;
  observer: string;
  until?: number;
  floor?: number;
  /** The Kitchen's recipes recent editions ran: it keeps the best-ranked one not among them. */
  recentRecipes?: ReadonlySet<string>;
  /** Where this app's citations and bylines point. */
  links?: PaperLinkSet;
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
    // Every desk reads the fixed 24 hours but the Kitchen, which reads its own 30 days.
    const { events: found, note } = await askRelay(
      relay,
      { ...filterFor(desk.kinds, until - lookbackOf(desk), until, desk.limit, observer, floor, desk.tags) },
      { signal },
    );
    const read = belongs(desk, observer, found);
    // The Kitchen keeps one recipe: the best-ranked the last editions didn't run.
    const recipe = desk.key === "kitchen" ? pickRecipe(read, recentRecipes) : null;
    const kept = desk.key === "kitchen" ? (recipe ? [recipe] : []) : read;
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
  // A highlight's names include who wrote what it marked.
  const authors = [
    ...new Set(
      Object.values(desks)
        .flat()
        .flatMap((e) => [e.pubkey, ...highlightAuthorKeys(e)]),
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
    links,
  });
  return unanswered.length ? { ...corpus, unanswered } : corpus;
}

// --- the writer ------------------------------------------------------------

/** A provider answered with a failure; `message` is written for the reader. */
export class WriterError extends Error {
  constructor(
    message: string,
    readonly status: number | null = null,
    /** A Routstr node's error code, when it gave one (`insufficient_balance`, `payment_settlement_failed`, …). */
    readonly code: string | null = null,
  ) {
    super(message);
    this.name = "WriterError";
  }
}

/** A provider's failed answer, as a WriterError: the words for the reader, the status and the node's code. */
function failure(status: number, body: string): WriterError {
  return new WriterError(explain(status, body), status, readRoutstrError(status, body).code);
}

/**
 * Whether a failed plan call leaves the page to be written from the digest alone: a provider
 * error, a cut-off or empty answer, the network, a busy or down upstream. A refused or
 * unfunded key, an unknown model or a charge withheld would fail the page call too (and a
 * withheld charge must never be sent again on its own), so those end the print (Amethyst's
 * `planFailureFallsBack`).
 */
export function planFailureFallsBack(err: WriterError): boolean {
  const code = err.code;
  if (code === "insufficient_balance" || code === "key_not_found" || code === "payment_settlement_failed") return false;
  if (err.status === 503 && /settle/i.test(err.message)) return false;
  if (code === "upstream_unavailable" || code === "upstream_rate_limit") return true;
  return err.status === null || ![401, 402, 403, 404].includes(err.status);
}

/** The search relay didn't answer enough of the run to make a paper of it. */
export class RelayOutageError extends WriterError {
  constructor(message: string) {
    super(message);
    this.name = "RelayOutageError";
  }
}

/**
 * A failed answer in words. A Routstr node's own errors come first (lib/routstr): its 402 is a
 * balance to top up, not a dead key, and its 503 `payment_settlement_failed` charged without
 * answering, which nothing here sends again.
 */
export function explain(status: number, body: string): string {
  const routstr = routstrProblem(readRoutstrError(status, body));
  if (routstr) return routstr.text;
  if (status === 401 || status === 403)
    return "Your AI key was rejected. Check it in Settings › Assistants › AI model.";
  if (status === 402) return "Your AI key is out of credit.";
  if (status === 429) return "Your AI provider is rate-limiting this key. Try again in a minute.";
  if (status === 404) return "The provider doesn't know that model. Pick another one.";
  const said = body.replace(/\s+/g, " ").trim().slice(0, 160);
  return `Your AI provider answered with an error (${status})${said ? `: ${said}` : "."}`;
}

export interface ModelList {
  ids: string[];
  /** A Routstr node's list, with its prices in sats (`sats_pricing`); null for any other endpoint. */
  routstr: RoutstrModel[] | null;
  /** Each model's output limit and context window, where the endpoint says them. */
  limits: Map<string, ModelLimits>;
}

/** The models a key can use, with a Routstr node's prices; best guess first is the caller's job (`rankModels`). */
export async function fetchModelList(key: AgentKey, signal?: AbortSignal): Promise<ModelList> {
  const response = await fetch(`${apiRoot(key.url)}/models`, { headers: authHeaders(key), signal });
  if (!response.ok) {
    throw failure(response.status, await response.text().catch(() => ""));
  }
  const json = await response.json().catch(() => null);
  return {
    ids: readModelIds(json),
    routstr: isRoutstrModels(json) ? parseModels(json) : null,
    limits: readModelLimits(json),
  };
}

/** The models a key can use, best guess first is the caller's job (`rankModels`). */
export async function fetchModels(key: AgentKey, signal?: AbortSignal): Promise<string[]> {
  return (await fetchModelList(key, signal)).ids;
}

export interface Written {
  text: string;
  usage: Usage | null;
}

/**
 * One completion, streamed so the reader sees the page arrive; non-streamed when the
 * provider refuses a stream (a 400/415/422 on the streaming request, or an answer that
 * is not an event stream). `options` (the output limit, the writing effort) go out as
 * `chatRequestBody` maps them; a provider that refuses the request outright (400 or 422)
 * while it carries them is asked once more without them, as before they existed.
 */
export async function writePage({
  key,
  model,
  messages,
  options = {},
  signal,
  onText,
  onEvent,
}: {
  key: AgentKey;
  model: string;
  messages: ChatMessage[];
  options?: CallOptions;
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
  const streamed = chatRequest(key, model, messages, true, options);
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
    throw failure(response.status, await response.text().catch(() => ""));
  }

  const send = async (request: ReturnType<typeof chatRequest>) => {
    onEvent?.({ type: "sent", streamed: false });
    try {
      return await fetch(request.url, { ...request.init, signal });
    } catch (err) {
      if (signal?.aborted) throw err;
      throw new WriterError("Couldn't reach your AI provider from this page.");
    }
  };
  const second = await send(chatRequest(key, model, messages, false, options));
  if (second.ok) return whole(completed(await second.json().catch(() => null)));
  if (!carriesExtras(key.url, options) || ![400, 422].includes(second.status)) {
    throw failure(second.status, await second.text().catch(() => ""));
  }
  // Refused with the limit or Deep: once more as the plain request every provider took.
  const third = await send(chatRequest(key, model, messages, false));
  if (!third.ok) throw failure(third.status, await third.text().catch(() => ""));
  return whole(completed(await third.json().catch(() => null)));
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

/** Repairs after the first page, each sending only what to fix: up to four page calls in all. */
export const MAX_REPAIR_ROUNDS = 3;

/** How much of the plan's lead angle the print's details show. */
export const PLAN_ANGLE_SHOWN = 240;

export type PrintStep =
  | { step: "probe" }
  | { step: "pull"; progress: PullProgress }
  | { step: "plan" }
  | { step: "write"; round: number; chars: number }
  | { step: "check"; round: number };

export type PrintResult =
  | { status: "not-ready"; reason: ProbeVerdict }
  | {
      status: "printed";
      html: string;
      corpus: Corpus;
      changes: ResolveChange[];
      quotes: number;
      usage: Usage | null;
      rounds: number;
      /** Written from a plan (two passes); false when the plan failed and the page came from the digest alone. */
      planned: boolean;
      /** The Kitchen's recipe the page cites (`recipeAddress`), so the next editions don't run it again. */
      recipe: string | null;
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

/** The Kitchen's recipe, when the page cites it (a Source link to it): what this edition ran. */
export function citedRecipe(html: string, corpus: Corpus): string | null {
  const links = corpus.links ?? BRAINSTORM_LINKS;
  const dish = (corpus.desks.kitchen ?? []).find((e) => {
    try {
      return html.includes(links.citation(e));
    } catch {
      return false;
    }
  });
  return dish ? recipeAddress(dish) : null;
}

/**
 * Pass 1: the brief, the shared prefix and the planning instruction; the answer read as a
 * plan. No plan when the answer isn't one, or the call fails in a way the page call may not
 * (`planFailureFallsBack`), or takes longer than `timeoutMs`. A failure the page call would
 * meet too (a refused key, no credit, a charge withheld) ends the print here.
 */
async function planEdition({
  key,
  model,
  system,
  prefix,
  options,
  timeoutMs,
  signal,
  onEvent,
}: {
  key: AgentKey;
  model: string;
  system: ChatMessage;
  prefix: string;
  options: CallOptions;
  timeoutMs: number;
  signal?: AbortSignal;
  onEvent?: (event: ServiceEvent) => void;
}): Promise<{ plan: EditionPlan | null; usage: Usage | null }> {
  const controller = new AbortController();
  const stop = () => controller.abort();
  signal?.addEventListener("abort", stop, { once: true });
  const timer = setTimeout(stop, timeoutMs);
  try {
    const written = await writePage({
      key,
      model,
      messages: [system, { role: "user", content: `\n\n${PLAN_INSTRUCTION}`, prefix }],
      options,
      signal: controller.signal,
      onEvent: (event) => onEvent?.({ type: "plan", event }),
    });
    return { plan: parsePlan(written.text), usage: written.usage };
  } catch (err) {
    if (signal?.aborted) throw err;
    // Given up on (too slow), or failed in a way the page call might not.
    if (controller.signal.aborted) return { plan: null, usage: null };
    if (err instanceof WriterError && planFailureFallsBack(err)) return { plan: null, usage: null };
    throw err;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", stop);
  }
}

/**
 * The run, start to finish: a plan, then the page from the digest, the posts in full and the
 * plan. The validator is not negotiable: a page still refused after `MAX_REPAIR_ROUNDS`
 * repairs is never returned as a page.
 */
export async function printFrontPage({
  key,
  model,
  observer,
  readerName,
  effort = "standard",
  limits = null,
  context: contextIn = emptyContext(),
  links = BRAINSTORM_LINKS,
  relay = searchRelay(),
  planTimeoutMs = PLAN_TIMEOUT_MS,
  signal,
  onStep,
  onEvent,
}: {
  key: AgentKey;
  model: string;
  observer: string;
  readerName: string;
  /** The writing effort: the schedule's `effort` param, or the reader's pick. */
  effort?: WritingEffort;
  /** What the endpoint says of the model's limits, for each call's output limit. */
  limits?: ModelLimits | null;
  /**
   * The edition beyond its posts: the reader's clock, its number, recent pages, the standing
   * paper. A promise is waited for after the ranking check, so it is gathered meanwhile.
   */
  context?: EditionContext | Promise<EditionContext>;
  links?: PaperLinkSet;
  relay?: ReqRelay | null;
  planTimeoutMs?: number;
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
  // What can't be gathered is left out: continuity never fails a print.
  const context = await Promise.resolve(contextIn).catch(() => emptyContext(EditionClock.forReader(null)));
  signal?.throwIfAborted();

  const corpus = await pullCorpus({
    relay,
    observer,
    until,
    recentRecipes: context.recentRecipes,
    links,
    signal,
    onProgress: (progress) => {
      onStep?.({ step: "pull", progress });
      onEvent?.({ type: "pull", progress });
    },
  });

  const events = corpusEvents(corpus);
  const text = digest(corpus, undefined, context.clock);
  const size = { read: events.length, voices: new Set(events.map((e) => e.pubkey)).size, kept: keptInDigest(corpus) };
  // The system brief and this prefix are first, and the same, in every call of the print.
  const prefix = corpusPrefix(text, editionHeader(readerName, readerLanguage(), context, corpus, size));
  const system: ChatMessage = { role: "system", content: systemPrompt() };

  // Pass 1: the plan. Anything short of a usable plan leaves today's single pass.
  onStep?.({ step: "plan" });
  const planned = await planEdition({
    key,
    model,
    system,
    prefix,
    options: { maxTokens: planTokenLimit(limits), effort },
    timeoutMs: planTimeoutMs,
    signal,
    onEvent,
  });
  signal?.throwIfAborted();
  let usage: Usage | null = planned.usage;
  const plan = planned.plan;
  const full = plan ? fullBlock(corpus, plan.full, context.clock) : null;
  onEvent?.(
    plan
      ? { type: "planned", lead: plan.lead?.angle.slice(0, PLAN_ANGLE_SHOWN) ?? null, full: full?.ids.length ?? 0 }
      : { type: "plan-failed" },
  );

  // Pass 2: the page, then up to MAX_REPAIR_ROUNDS repairs, each sending only what to fix.
  const first: ChatMessage[] = [system, { role: "user", content: `\n\n${writeMessage(plan, full)}`, prefix }];
  let messages = first;
  const last = 1 + MAX_REPAIR_ROUNDS;
  for (let round = 1; round <= last; round++) {
    onStep?.({ step: "write", round, chars: 0 });
    const promptTokens = approxTokens(messages.reduce((n, m) => n + messageText(m).length, 0));
    const written = await writePage({
      key,
      model,
      messages,
      options: { maxTokens: outputTokenLimit(limits, promptTokens), effort },
      signal,
      onText: (chars) => onStep?.({ step: "write", round, chars }),
      onEvent: (event) => onEvent?.({ type: "write", round, event }),
    });
    usage = addUsage(usage, written.usage);
    const page = extractDocument(written.text);
    if (!page) throw new WriterError("Your AI answered without a page. Try again, or pick another model.");

    onStep?.({ step: "check", round });
    onEvent?.({ type: "check", round });
    // The house stylesheet goes in before the check: what is checked and kept is what renders.
    const resolved = resolve(insertHouseCss(page), corpus);
    const verdict = check(resolved.doc, corpus);
    onEvent?.({
      type: "checked",
      round,
      last: round === last,
      quotes: verdict.quotes.length,
      violations: verdict.violations.length,
      removed: noteworthy(resolved.changes).length,
    });
    if (verdict.violations.length === 0) {
      // The page as checked (settled after a round trip), with the app's own CSP: it
      // may leave the sandbox, as a Download or on the reader's Observer site.
      const html = withPaperCsp(serialize(verdict.doc));
      return {
        status: "printed",
        html,
        corpus,
        changes: resolved.changes,
        quotes: verdict.quotes.length,
        usage,
        rounds: round,
        planned: plan !== null,
        recipe: citedRecipe(html, corpus),
      };
    }
    if (round === last) {
      return { status: "refused", violations: verdict.violations, changes: resolved.changes, corpus, usage };
    }
    // The writer's own page (without the inserted stylesheet) and what to fix in it; the
    // pages of earlier rounds are not sent again.
    messages = [
      ...first,
      { role: "assistant", content: page },
      { role: "user", content: repairMessage(verdict.violations) },
    ];
  }
  // Unreachable: the last round always returns.
  throw new WriterError("The page could not be checked.");
}

/** The reader's language for the paper: the browser's own, which is what they read the app in. */
function readerLanguage(): string | null {
  return typeof navigator !== "undefined" && navigator.language ? navigator.language : null;
}
