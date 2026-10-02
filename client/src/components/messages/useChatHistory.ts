/**
 * Loading older messages from inside a chat.
 *
 * Gift wraps only name their recipient, so a chat's history comes from the
 * same account-wide pages as everything else: a page may bring a week of
 * other people's messages and nothing for this chat. So, when the relay
 * markers at the top of the chat come into view:
 *
 *  1. load ONE page from every relay automatically;
 *  2. if that brought something for this chat, the markers move above it and
 *     the next view of them loads another;
 *  3. if it brought nothing, stop and offer "Keep looking", which pages every
 *     relay, round after round, until a message for this chat appears or
 *     every relay is done.
 *
 * Only when the reader scrolled up to them. A chat that opens with the markers
 * already in view (a short chat, history incomplete) starts `paused` and
 * fetches nothing until Continue — so moving between chats doesn't pull
 * another page from every relay each time one is opened. After Continue the
 * chat pages as above until the reader leaves it.
 */
import { useEffect, useReducer, useRef } from "react";
import type { DmEngine, DmEngineState } from "@/services/dm/engine";

export type ChatHistoryPhase = "idle" | "auto" | "button" | "search" | "end" | "paused";

export function useChatHistory(
  engine: DmEngine | null,
  state: DmEngineState,
  room: string | null,
  count: number,
  /** `null` until the markers have reported in. */
  markersVisible: boolean | null,
): { phase: ChatHistoryPhase; keepLooking: () => void; stop: () => void; resume: () => void } {
  // `armed`: the markers have been out of view (or Continue was pressed), so
  // seeing them now means the reader went looking.
  const fresh = () => ({ room, phase: "idle" as ChatHistoryPhase, baseline: 0, armed: false });
  const memo = useRef(fresh());
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  if (memo.current.room !== room) memo.current = fresh();
  if (markersVisible === false) memo.current.armed = true;

  const relays = state.history.relays;
  // A page isn't in until its wraps are opened: judging "nothing for this chat"
  // before then would offer Keep looking — or call it the start — too early.
  const busy = relays.some((r) => r.state === "loading" || r.waiting || (r.opening ?? 0) > 0);
  const open = relays.filter((r) => r.state === "idle" || r.state === "loading" || (r.opening ?? 0) > 0);
  const ready = state.status === "ready" && state.liveSettled;
  const progressKey = relays
    .map((r) => `${r.state}:${r.reachedUntil}:${r.opening ?? 0}:${r.waiting ? 1 : 0}`)
    .join("|");

  useEffect(() => {
    const m = memo.current;
    if (!engine || !ready) return;
    const set = (phase: ChatHistoryPhase) => {
      if (m.phase === phase) return;
      m.phase = phase;
      rerender();
    };
    switch (m.phase) {
      case "idle":
        if (!open.length && !busy) set("end");
        else if (markersVisible && !busy) {
          if (!m.armed) set("paused");
          else {
            m.baseline = count;
            if (engine.advanceAll()) set("auto");
          }
        }
        break;
      case "paused":
        // Waits for Continue — or for the reader to scroll away, after which
        // scrolling back up is a request.
        if (!open.length && !busy) set("end");
        else if (m.armed) set("idle");
        break;
      case "auto":
        if (busy) break;
        if (count > m.baseline) set("idle");
        else set(open.length ? "button" : "end");
        break;
      case "button":
        if (count > m.baseline) set("idle");
        else if (!open.length && !busy) set("end");
        break;
      case "search":
        if (count > m.baseline) set("idle");
        else if (!open.length && !busy) set("end");
        else if (!busy) engine.advanceAll();
        break;
      case "end":
        if (open.length) set(count > m.baseline ? "idle" : "button");
        break;
    }
  }, [engine, ready, busy, open.length, count, markersVisible, progressKey, room]);

  return {
    phase: memo.current.phase,
    keepLooking: () => {
      memo.current.phase = "search";
      memo.current.baseline = count;
      engine?.advanceAll();
      rerender();
    },
    stop: () => {
      memo.current.phase = "button";
      rerender();
    },
    resume: () => {
      memo.current.armed = true;
      memo.current.baseline = count;
      memo.current.phase = engine?.advanceAll() ? "auto" : "idle";
      rerender();
    },
  };
}
