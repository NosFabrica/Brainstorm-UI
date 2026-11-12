import { useSyncExternalStore } from "react";
import { providerName, type AgentKey } from "@/lib/agentKeys";
import { accountKey, tabKey } from "@/lib/accountStorage";
import type { EditionEntry } from "@/lib/frontPage/observerSite";
import { reduceProgress, startProgress, type PrintEvent, type PrintProgress } from "@/lib/frontPage/printProgress";
import type { ResolveChange } from "@/lib/frontPage/resolve";
import type { Violation } from "@/lib/frontPage/validate";
import type { Usage } from "@/lib/frontPage/writer";
import { WriterError, printFrontPage } from "@/services/frontPage";
import { PublishError, leadHeadline, publishToObserver, type PublishFailure } from "@/services/observerSite";

/**
 * The print that is running, owned by the app rather than the Observer page: it keeps
 * going while the reader browses Brainstorm (a paper may already be paid for), and the
 * page shows it, or its result, whenever it is open. One print at a time, for one
 * account: switching accounts cancels it (`cancelPrintUnlessFor`), since its paper would
 * be published under the account that is signed in. In memory only: closing the tab ends
 * it, which PrintJobHost asks the reader to confirm.
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
}

export type Run =
  | { state: "idle" }
  | { state: "running" }
  | { state: "refused"; violations: Violation[]; changes: ResolveChange[] }
  /** The relay turned the print away: not ranking yet. `at`: when, so a later check clears it. */
  | { state: "pending"; at: number }
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

/** "Publish to my Observer": on unless this account turned it off. */
export function readPublish(pubkey: string): boolean {
  try {
    return localStorage.getItem(publishKey(pubkey)) !== "off";
  } catch {
    return true;
  }
}

export function writePublish(pubkey: string, on: boolean) {
  try {
    localStorage.setItem(publishKey(pubkey), on ? "on" : "off");
  } catch {
    // remembered for this visit only
  }
}

function noticeSeen(pubkey: string): boolean {
  try {
    return localStorage.getItem(noticeKey(pubkey)) === "1";
  } catch {
    return false;
  }
}

function markNoticeSeen(pubkey: string) {
  try {
    localStorage.setItem(noticeKey(pubkey), "1");
  } catch {
    // shown again next time
  }
}

// --- the store -----------------------------------------------------------------------

let job: PrintJob | null = null;
let abort: AbortController | null = null;
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

/** Print, replacing any print before it. */
export function startPrint({ pubkey, key, model, readerName, displayName }: StartPrint) {
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
    progress: startProgress(providerName(key.url), model, now),
    paper,
    publish: { state: "idle" },
    published: null,
    finishedAt: null,
    outcome: null,
  };
  notifyNow();
  void runPrint(id, controller, { pubkey, key, model, readerName, displayName });
}

async function runPrint(id: number, controller: AbortController, opts: StartPrint) {
  const { pubkey, key, model, readerName, displayName } = opts;
  const finish = (outcome: PrintOutcome, run: Run, change: Partial<PrintJob> = {}) =>
    update(id, (j) => ({ ...j, ...change, run, outcome, finishedAt: Date.now() }));
  try {
    const result = await printFrontPage({
      key,
      model,
      observer: pubkey,
      readerName,
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
      writeLast(pubkey, null);
      log(id, { type: "end", outcome: "refused" });
      finish("refused", { state: "refused", violations: result.violations, changes: result.changes }, { paper: null });
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
      log(id, { type: "end", outcome: "printed" });
      finish("printed", { state: "idle" }, { paper: printed });
      // Only a page the check passed gets here: that is the only one published. Whether to
      // is read now, when the paper is ready, not when Print was pressed: turning publishing
      // off while the paper is written keeps that paper private.
      if (readPublish(pubkey)) offerPublish(pubkey, printed, displayName);
    }
  } catch (err) {
    if (controller.signal.aborted) return;
    const message = err instanceof WriterError ? err.message : "Something went wrong while printing. Try again.";
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

/** Another account is signed in: its print, publish and paper don't carry over. */
export function cancelPrintUnlessFor(pubkey: string | null) {
  if (!job || job.pubkey === pubkey) return;
  abort?.abort();
  abort = null;
  job = null;
  notifyNow();
}

/** The turned-away state has been answered by a later check: back to idle. */
export function settlePending(pubkey: string) {
  if (job?.pubkey !== pubkey || job.run.state !== "pending") return;
  update(job.id, (j) => ({ ...j, run: { state: "idle" } }));
}

/** Publish, once the reader has said yes to a public site: asked before the first one. */
export function offerPublish(pubkey: string, paper: Printed, displayName: string) {
  if (!job || job.pubkey !== pubkey) return;
  if (noticeSeen(pubkey)) void publishPaper(pubkey, paper, displayName);
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
  log(id, { type: "publish", state: "publishing" });
  update(id, (j) => ({ ...j, publish: { state: "publishing" } }));
  try {
    const out = await publishToObserver({
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
    log(id, { type: "publish", state: "published" });
    update(id, (j) => ({
      ...j,
      publish: { state: "published" },
      published: { editions: out.editions, servers: out.servers },
    }));
  } catch (err) {
    const message = err instanceof PublishError ? err.message : "Couldn't publish to your Observer.";
    log(id, { type: "publish", state: "failed", message });
    update(id, (j) => ({
      ...j,
      publish: { state: "failed", message, reason: err instanceof PublishError ? err.reason : null },
    }));
  }
}

/** Tests: start from nothing. */
export function resetPrintJob() {
  abort?.abort();
  abort = null;
  job = null;
  if (notifyTimer !== null) clearTimeout(notifyTimer);
  notifyTimer = null;
  notifyNow();
}
