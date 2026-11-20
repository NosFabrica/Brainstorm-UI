import { useSyncExternalStore } from "react";
import { providerName, type AgentKey } from "@/lib/agentKeys";
import { accountKey, tabKey } from "@/lib/accountStorage";
import { EditionClock, emptyContext } from "@/lib/frontPage/edition";
import type { EditionEntry } from "@/lib/frontPage/observerSite";
import {
  SCHEDULE_D,
  SCHEDULE_KIND,
  observerPublishing,
  withObserverPublishing,
  type ObserverPublishing,
  type WritingEffort,
} from "@/lib/frontPage/observerSchedule";
import { heldScheduleAt, heldScheduleTask, onForgetSchedules } from "@/lib/frontPage/heldSchedule";
import { eventStore } from "@/lib/eventStore";
import { readTask, type TaskTags } from "@/lib/scheduledTasks";
import { activeAccount } from "@/accounts/signing";
import type { ScheduleSave } from "@/services/observerSchedule";
import { reduceProgress, startProgress, type PrintEvent, type PrintProgress } from "@/lib/frontPage/printProgress";
import type { ResolveChange } from "@/lib/frontPage/resolve";
import type { Violation } from "@/lib/frontPage/validate";
import type { ModelLimits, Usage } from "@/lib/frontPage/writer";
// The engine (the writer, the brief, the house stylesheet, the paper boundary) and the site's
// publisher are loaded when a print or a publish starts, not with the app: this store is
// mounted on every page (PrintJobHost, the header's indicator), and most visitors never print.
import type { EditionHistory } from "@/services/editionContext";
import type { PublishFailure } from "@/services/observerSite";

const loadEngine = () => import("@/services/printEngine");

/**
 * The print that is running, owned by the app rather than the Observer page: it keeps
 * going while the reader browses Brainstorm (a paper may already be paid for), and the
 * page shows it, or its result, whenever it is open. One print at a time, for one
 * account: switching accounts cancels it (`cancelPrintUnlessFor`), since its paper would
 * be published under the account that is signed in. In memory only: closing the tab ends
 * it, which PrintJobHost asks the reader to confirm (`holdsTab`). The paper itself outlives
 * the tab's reload (`readLast`), and one never published is offered again
 * (`offerPublish`).
 */

export interface Printed {
  html: string;
  code: string;
  /** Which model wrote it; absent on a paper printed before this was kept. */
  model?: string;
  printedAt: number;
  /** Absent for an edition read back from the site that didn't record it. */
  events?: number;
  quotes?: number;
  rounds: number;
  usage: Usage | null;
  changes: ResolveChange[];
  /** Desks the search relay didn't answer this run: their sections may be thin. */
  unanswered?: number;
  /** It is on the account's Observer site: a publish of it went through. */
  published?: boolean;
}

export type Run =
  | { state: "idle" }
  | { state: "running" }
  | { state: "refused"; violations: Violation[]; changes: ResolveChange[] }
  /**
   * The relay turned the print away: not ranking yet. `at`: when, so a later check clears it;
   * `settled`: a later check said it ranks now. Shown until the reader prints or dismisses it.
   */
  | { state: "pending"; at: number; settled?: boolean }
  | { state: "error"; message: string };

export type PublishState =
  | { state: "idle" }
  /** Waiting for the reader to say yes to a public site, the first time. */
  | { state: "confirm"; paper: Printed }
  | { state: "publishing" }
  | { state: "published" }
  | { state: "failed"; message: string; reason: PublishFailure | null };

export interface PrintJob {
  id: number;
  pubkey: string;
  run: Run;
  progress: PrintProgress;
  /** The account's paper: this print's once it is done, else the one it had (this tab's). */
  paper: Printed | null;
  publish: PublishState;
  /** The site as a publish left it, for the page to show without asking again. */
  published: { editions: EditionEntry[]; servers: string[] } | null;
  /** When the run stopped, and how. */
  finishedAt: number | null;
  outcome: PrintOutcome | null;
}

export type PrintOutcome = "printed" | "refused" | "pending" | "error" | "cancelled";

export interface StartPrint {
  pubkey: string;
  key: AgentKey;
  model: string;
  readerName: string;
  /** The account's name, for its Observer site's title. */
  displayName: string;
  /** The writing effort: the schedule's `effort` param, or the reader's pick. Standard when absent. */
  effort?: WritingEffort;
  /** What the endpoint says of the model's output limit and context window. */
  limits?: ModelLimits | null;
  /** The schedule's IANA zone, the reader's clock; this browser's when null. */
  zone?: string | null;
  /** The editions the reader has, for the edition's number, recent headlines and standing paper. */
  history?: EditionHistory;
}

// --- the account's remembered choices ------------------------------------------------

const lastKey = (pubkey: string) => tabKey("frontPage:last", pubkey);

/** This tab's last paper for the account (it survives a reload of the tab). */
export function readLast(pubkey: string): Printed | null {
  try {
    const raw = sessionStorage.getItem(lastKey(pubkey));
    return raw ? (JSON.parse(raw) as Printed) : null;
  } catch {
    return null;
  }
}

function writeLast(pubkey: string, page: Printed | null) {
  try {
    if (page) sessionStorage.setItem(lastKey(pubkey), JSON.stringify(page));
    else sessionStorage.removeItem(lastKey(pubkey));
  } catch {
    // private window or full storage: the page still shows, it just won't survive a reload
  }
}

const publishKey = (pubkey: string) => accountKey("frontPage:publish", pubkey);
const noticeKey = (pubkey: string) => accountKey("frontPage:observerNotice", pubkey);

/**
 * The choice the reader made in this session, ahead of the schedule: set the moment they make
 * it, so a write still out (a bunker waiting for approval) or one that failed never leaves the
 * schedule's older answer in charge. It goes once its write lands, when the held schedule says
 * the same; a later one from another device then decides again. Forgotten at sign-out.
 */
const chosen = new Map<string, ObserverPublishing>();
onForgetSchedules(() => chosen.clear());

function localChoice(pubkey: string): ObserverPublishing {
  try {
    return {
      publish: localStorage.getItem(publishKey(pubkey)) !== "off",
      noticeSeen: localStorage.getItem(noticeKey(pubkey)) === "1",
    };
  } catch {
    return { publish: true, noticeSeen: false };
  }
}

/** The account's schedule, as far as this session can read it; null when it hasn't opened one. */
function scheduleChoice(pubkey: string): ObserverPublishing | null {
  const task = heldScheduleTask(pubkey);
  return task ? observerPublishing(task) : null;
}

/**
 * The store holds a schedule for the account newer than any this session opened (the prompt
 * was dismissed, the key is locked, the bunker timed out): what it says of publishing is
 * unknown, and another device may have turned it off.
 */
function scheduleUnread(pubkey: string): boolean {
  const stored = eventStore.getReplaceable(SCHEDULE_KIND, pubkey, SCHEDULE_D);
  if (!stored) return false;
  const opened = heldScheduleAt(pubkey);
  return opened === null || opened < stored.created_at;
}

/** What the reader is shown: this session's choice, else the schedule's, else this browser's. */
function currentChoice(pubkey: string): ObserverPublishing {
  return chosen.get(pubkey) ?? scheduleChoice(pubkey) ?? localChoice(pubkey);
}

/**
 * "Publish to my Observer", one choice for every app and device of the account: what the
 * reader chose in this session, else the schedule's `publish` param (`observerPublishing`)
 * once this session has opened the schedule, else what this browser last knew, on unless it
 * was turned off.
 */
export function readPublish(pubkey: string): boolean {
  return currentChoice(pubkey).publish;
}

/**
 * What happens to a paper once it is ready: `publish` it unasked only when every source this
 * session knows says on (its own choice, the schedule, this browser) and the reader has agreed
 * to a public site; `ask` when it is on but one of them says otherwise, hasn't been agreed to,
 * or the account has a schedule this session couldn't open; `off` when publishing is off.
 */
export function publishDecision(pubkey: string): "publish" | "ask" | "off" {
  const current = currentChoice(pubkey);
  if (!current.publish) return "off";
  const mine = chosen.get(pubkey);
  const schedule = scheduleChoice(pubkey);
  const everyOn =
    (mine?.publish ?? true) && (schedule?.publish ?? true) && localChoice(pubkey).publish && !scheduleUnread(pubkey);
  return everyOn && current.noticeSeen ? "publish" : "ask";
}

/**
 * Turns publishing on or off for every device: in force here at once, written into the
 * schedule (turned back on, the notice is asked again before the next publish), and
 * remembered in this browser for the moments before the schedule is open. Answers what the
 * schedule's write came to (null when none was tried), for the page to say a failure.
 */
export function writePublish(pubkey: string, on: boolean): Promise<ScheduleSave | null> {
  try {
    localStorage.setItem(publishKey(pubkey), on ? "on" : "off");
  } catch {
    // remembered for this visit only
  }
  const was = currentChoice(pubkey);
  const choice = on
    ? { publish: true, noticeSeen: was.publish && was.noticeSeen }
    : { publish: false, noticeSeen: false };
  chosen.set(pubkey, choice);
  return saveChoice(pubkey, choice, (tags) => {
    const now = observerPublishing(readTask(tags, pubkey));
    return withObserverPublishing(
      tags,
      on ? { publish: true, noticeSeen: now.publish && now.noticeSeen } : { publish: false, noticeSeen: false },
    );
  });
}

/**
 * Writes a publishing change into the account's schedule, for every device: only into one it
 * has (no schedule is made for it: this browser keeps the choice until there is one), and only
 * for the account signed in now (the edit signs as it). A failure leaves this session's choice
 * in force and what this browser remembers, and the next change tries again.
 */
async function saveChoice(
  pubkey: string,
  choice: ObserverPublishing,
  change: (tags: TaskTags) => TaskTags,
): Promise<ScheduleSave | null> {
  // The edit signs as whoever is signed in: never another account's choice into theirs.
  if (activeAccount()?.pubkey !== pubkey) return null;
  let saved: ScheduleSave;
  try {
    // Loaded with the first change: the schedule's relay and signer code isn't the app's first chunk.
    const { updateObserverSchedule } = await import("@/services/observerSchedule");
    saved = await updateObserverSchedule(
      (tags) => {
        const next = change(tags);
        return sameTags(next, tags) ? tags : next;
      },
      { existingOnly: true },
    );
  } catch {
    saved = { success: false, error: "Couldn't save the choice to your schedule." };
  }
  // Landed in the schedule (or there is none): the held copy says the same, so it decides
  // from here, unless a newer choice was made meanwhile.
  if (saved.success && !saved.absent && chosen.get(pubkey) === choice) chosen.delete(pubkey);
  return saved;
}

function sameTags(a: TaskTags, b: TaskTags): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Whether this account has agreed that its Observer is public (the notice before the first
 * publish). Naming the Assistant as runner asks the same: it publishes the reader's paper.
 */
export function observerNoticeSeen(pubkey: string): boolean {
  return noticeSeen(pubkey);
}

/** The reader agreed: their Observer is public. Asked once, by whichever comes first. */
export function acceptObserverNotice(pubkey: string) {
  markNoticeSeen(pubkey);
}

function noticeSeen(pubkey: string): boolean {
  return currentChoice(pubkey).noticeSeen;
}

/** The reader said yes to a public site: `["param", "publish", "yes"]` for every device, and remembered here. */
function markNoticeSeen(pubkey: string) {
  try {
    localStorage.setItem(noticeKey(pubkey), "1");
    localStorage.setItem(publishKey(pubkey), "on");
  } catch {
    // shown again next time
  }
  const choice = { publish: true, noticeSeen: true };
  chosen.set(pubkey, choice);
  void saveChoice(pubkey, choice, (tags) => withObserverPublishing(tags, choice));
}

// --- the store -----------------------------------------------------------------------

let job: PrintJob | null = null;
let abort: AbortController | null = null;
/** The publish in flight, stopped when its account's job goes. */
let publishAbort: AbortController | null = null;
let nextId = 1;
const listeners = new Set<() => void>();
let notifyTimer: ReturnType<typeof setTimeout> | null = null;

function notifyNow() {
  if (notifyTimer !== null) clearTimeout(notifyTimer);
  notifyTimer = null;
  for (const l of listeners) l();
}

/** A streamed page arrives many times a second: the screen follows ten times a second. */
function notifySoon() {
  if (notifyTimer === null) notifyTimer = setTimeout(notifyNow, 100);
}

function update(id: number, change: (j: PrintJob) => PrintJob, soon = false) {
  if (!job || job.id !== id) return;
  job = change(job);
  if (soon) notifySoon();
  else notifyNow();
}

function log(id: number, event: PrintEvent, soon = false) {
  update(id, (j) => ({ ...j, progress: reduceProgress(j.progress, event, Date.now()) }), soon);
}

export function getPrintJob(): PrintJob | null {
  return job;
}

export function subscribePrintJob(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The print job, for the account given; null for any other account's (or none). */
export function usePrintJob(pubkey: string | null): PrintJob | null {
  const current = useSyncExternalStore(subscribePrintJob, getPrintJob, getPrintJob);
  return current && current.pubkey === pubkey ? current : null;
}

export const isRunning = (j: PrintJob | null) => j?.run.state === "running";

/**
 * Whether closing the tab now would lose something: a print running, or a paid paper
 * waiting for the reader's yes to a public site, or on its way there. Lost, the next
 * occurrence would pay for it again.
 */
export const holdsTab = (j: PrintJob | null) =>
  isRunning(j) || j?.publish.state === "confirm" || j?.publish.state === "publishing";

/** Print, replacing any print before it. */
export function startPrint(start: StartPrint) {
  const { pubkey, model } = start;
  abort?.abort();
  const controller = new AbortController();
  abort = controller;
  const id = nextId++;
  const now = Date.now();
  // The paper the account already has stays on show while the next one is written.
  const paper = job && job.pubkey === pubkey ? job.paper : readLast(pubkey);
  job = {
    id,
    pubkey,
    run: { state: "running" },
    progress: startProgress(providerName(start.key.url), model, now),
    paper,
    publish: { state: "idle" },
    published: null,
    finishedAt: null,
    outcome: null,
  };
  notifyNow();
  void runPrint(id, controller, start);
}

async function runPrint(id: number, controller: AbortController, opts: StartPrint) {
  const { pubkey, key, model, readerName, displayName } = opts;
  const finish = (outcome: PrintOutcome, run: Run, change: Partial<PrintJob> = {}) =>
    update(id, (j) => ({ ...j, ...change, run, outcome, finishedAt: Date.now() }));
  let isWriterError = (_err: unknown) => false;
  try {
    const { WriterError, printFrontPage, loadEditionContext, rememberLocalPrint, leadHeadline, utcDay } =
      await loadEngine();
    isWriterError = (err) => err instanceof WriterError;
    if (controller.signal.aborted) return;
    // Gathered while the ranking is checked: a site's page may be fetched for it.
    const context = loadEditionContext({
      pubkey,
      history: { site: [], servers: [], ...opts.history, session: readLast(pubkey) ?? opts.history?.session ?? null },
      zone: opts.zone ?? null,
      signal: controller.signal,
    }).catch(() => emptyContext(EditionClock.forReader(opts.zone ?? null)));
    const result = await printFrontPage({
      key,
      model,
      observer: pubkey,
      readerName,
      effort: opts.effort ?? "standard",
      limits: opts.limits ?? null,
      context,
      signal: controller.signal,
      onEvent: (event) => log(id, event, event.type === "write" || event.type === "pull"),
    });
    if (controller.signal.aborted) return;
    if (result.status === "not-ready") {
      if (result.reason === "relay-unreachable") {
        const message = "The search relay didn't answer, so nothing was sent to your AI. Try again in a few minutes.";
        log(id, { type: "end", outcome: "error", message });
        finish("error", { state: "error", message });
      } else {
        log(id, { type: "end", outcome: "pending" });
        finish("pending", { state: "pending", at: Date.now() });
      }
    } else if (result.status === "refused") {
      // Nothing new to show, and nothing lost: the paper the account had (today's, paid
      // for) stays, here and in the tab.
      log(id, { type: "end", outcome: "refused" });
      finish("refused", { state: "refused", violations: result.violations, changes: result.changes });
    } else {
      const printed: Printed = {
        html: result.html,
        code: result.corpus.code,
        model,
        printedAt: Date.now(),
        events: Object.values(result.corpus.desks).reduce((n, list) => n + list.length, 0),
        quotes: result.quotes,
        rounds: result.rounds,
        usage: result.usage,
        changes: result.changes,
        unanswered: result.corpus.unanswered?.length ?? 0,
      };
      writeLast(pubkey, printed);
      rememberLocalPrint(pubkey, {
        day: utcDay(printed.printedAt),
        headline: leadHeadline(printed.html),
        recipe: result.recipe,
      });
      log(id, { type: "end", outcome: "printed" });
      finish("printed", { state: "idle" }, { paper: printed });
      // Only a page the check passed gets here: that is the only one published. Whether to
      // is read now, when the paper is ready, not when Print was pressed: turning publishing
      // off while the paper is written keeps that paper private.
      // Unasked only when every source says on; asked when one doesn't know (a schedule
      // this session couldn't open) or disagrees.
      const decision = publishDecision(pubkey);
      if (decision !== "off") offerPublish(pubkey, printed, displayName, { ask: decision === "ask" });
    }
  } catch (err) {
    if (controller.signal.aborted) return;
    const message = isWriterError(err) ? (err as Error).message : "Something went wrong while printing. Try again.";
    log(id, { type: "end", outcome: "error", message });
    finish("error", { state: "error", message });
  } finally {
    if (abort === controller) abort = null;
  }
}

/** Stop the running print; what the account had stays. */
export function cancelPrint() {
  if (!job || job.run.state !== "running") return;
  abort?.abort();
  abort = null;
  const id = job.id;
  log(id, { type: "end", outcome: "cancelled" });
  update(id, (j) => ({ ...j, run: { state: "idle" }, outcome: "cancelled", finishedAt: Date.now() }));
}

/**
 * Another account is signed in: its print, publish and paper don't carry over. A publish
 * in flight stops before it signs anything more: the new account must never sign for the
 * last one's paper. That paper stays in the last account's tab storage, to publish later.
 */
export function cancelPrintUnlessFor(pubkey: string | null) {
  if (!job || job.pubkey === pubkey) return;
  abort?.abort();
  abort = null;
  publishAbort?.abort();
  publishAbort = null;
  job = null;
  notifyNow();
}

/**
 * The turned-away state has been answered by a later check: it ranks now. Kept, settled, so
 * the page can say so until the reader prints again or dismisses it.
 */
export function settlePending(pubkey: string) {
  if (job?.pubkey !== pubkey || job.run.state !== "pending" || job.run.settled) return;
  const at = job.run.at;
  update(job.id, (j) => ({ ...j, run: { state: "pending", at, settled: true } }));
}

/** The reader dismissed the turned-away notice: back to idle. */
export function dismissPending(pubkey: string) {
  if (job?.pubkey !== pubkey || job.run.state !== "pending") return;
  update(job.id, (j) => ({ ...j, run: { state: "idle" } }));
}

/**
 * Publish, once the reader has said yes to a public site: asked before the first one. Also
 * for a paper this tab kept from before a reload that never reached the site: with no job
 * yet, one starts that holds it (no print runs).
 */
export function offerPublish(
  pubkey: string,
  paper: Printed,
  displayName: string,
  { ask = false }: { ask?: boolean } = {},
) {
  if (!job) {
    job = {
      id: nextId++,
      pubkey,
      run: { state: "idle" },
      progress: startProgress("", paper.model ?? "", Date.now()),
      paper,
      publish: { state: "idle" },
      published: null,
      finishedAt: null,
      outcome: null,
    };
  }
  if (job.pubkey !== pubkey || job.publish.state === "publishing") return;
  if (!ask && noticeSeen(pubkey)) void publishPaper(pubkey, paper, displayName);
  else {
    log(job.id, { type: "publish", state: "confirm" });
    update(job.id, (j) => ({ ...j, publish: { state: "confirm", paper } }));
  }
}

/** The reader said Publish to the notice. */
export function confirmPublish(pubkey: string, displayName: string) {
  if (!job || job.pubkey !== pubkey || job.publish.state !== "confirm") return;
  markNoticeSeen(pubkey);
  void publishPaper(pubkey, job.publish.paper, displayName);
}

/** Not now, or publishing turned off while asked: nothing goes out. */
export function declinePublish(pubkey: string) {
  if (!job || job.pubkey !== pubkey || job.publish.state !== "confirm") return;
  update(job.id, (j) => ({ ...j, publish: { state: "idle" } }));
}

async function publishPaper(pubkey: string, printed: Printed, displayName: string) {
  if (!job || job.pubkey !== pubkey) return;
  const id = job.id;
  publishAbort?.abort();
  const controller = new AbortController();
  publishAbort = controller;
  log(id, { type: "publish", state: "publishing" });
  update(id, (j) => ({ ...j, publish: { state: "publishing" } }));
  let reasonOf = (_err: unknown): PublishFailure | null | undefined => undefined;
  try {
    const { PublishError, leadHeadline, publishToObserver } = await loadEngine();
    reasonOf = (err) => (err instanceof PublishError ? err.reason : undefined);
    if (controller.signal.aborted) return;
    const out = await publishToObserver({
      signal: controller.signal,
      pubkey,
      html: printed.html,
      name: displayName,
      printedAt: printed.printedAt,
      headline: leadHeadline(printed.html),
      code: printed.code,
      posts: printed.events,
      quotesVerified: printed.quotes,
      model: printed.model,
    });
    if (controller.signal.aborted) return;
    // The paper is on the site now: a reload of the tab doesn't offer it again.
    const onSite: Printed = { ...printed, published: true };
    if (readLast(pubkey)?.printedAt === printed.printedAt) writeLast(pubkey, onSite);
    log(id, { type: "publish", state: "published" });
    update(id, (j) => ({
      ...j,
      paper: j.paper && j.paper.printedAt === printed.printedAt ? onSite : j.paper,
      publish: { state: "published" },
      published: { editions: out.editions, servers: out.servers },
    }));
  } catch (err) {
    // Stopped because the account went: nothing to say, and nobody to say it to.
    if (controller.signal.aborted) return;
    // A PublishError says what went wrong and why; anything else is said plainly.
    const reason = reasonOf(err);
    const message = reason !== undefined ? (err as Error).message : "Couldn't publish to your Observer.";
    log(id, { type: "publish", state: "failed", message });
    update(id, (j) => ({ ...j, publish: { state: "failed", message, reason: reason ?? null } }));
  } finally {
    if (publishAbort === controller) publishAbort = null;
  }
}

/** Tests: start from nothing. */
export function resetPrintJob() {
  abort?.abort();
  abort = null;
  publishAbort?.abort();
  publishAbort = null;
  job = null;
  chosen.clear();
  if (notifyTimer !== null) clearTimeout(notifyTimer);
  notifyTimer = null;
  notifyNow();
}
