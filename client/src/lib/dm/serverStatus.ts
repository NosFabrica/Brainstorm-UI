/**
 * A message server (inbox relay) as a reader can act on it, from the inbox's
 * live state: working, not answering, asks you to sign in, or still checking.
 * Settings › Messages shows it beside each server; the inbox list says the
 * not-answering ones in a line.
 */
import type { DmEngineState } from "@/services/dm/engine";

export type ServerStatus = "working" | "not-answering" | "sign-in" | "checking";

const same = (a: string, b: string) => a.replace(/\/+$/, "") === b.replace(/\/+$/, "");

/** How long a server may take to connect, once another has, before it reads as not answering. */
export const ANSWER_WITHIN_MS = 15_000;

/**
 * `waitedMs` is how long the caller has been watching. The inbox learns a server
 * is silent by asking it for history; a page that doesn't page (Settings) would
 * otherwise say "Checking…" for a dead server forever.
 */
export function serverStatus(
  url: string,
  state: Pick<DmEngineState, "live" | "history">,
  { waitedMs = 0 }: { waitedMs?: number } = {},
): ServerStatus {
  const history = state.history.relays.find((r) => same(r.url, url));
  const live = Object.entries(state.live).find(([u]) => same(u, url))?.[1];
  if (history?.state === "auth" || live === "auth") return "sign-in";
  if (history?.state === "stalled") return "not-answering";
  if (live === "synced" || history?.state === "done" || (history?.pages ?? 0) > 0) return "working";
  const anotherAnswered =
    Object.entries(state.live).some(([u, v]) => !same(u, url) && v === "synced") ||
    state.history.relays.some((r) => !same(r.url, url) && (r.state === "done" || r.pages > 0));
  if (anotherAnswered && waitedMs >= ANSWER_WITHIN_MS) return "not-answering";
  return "checking";
}
