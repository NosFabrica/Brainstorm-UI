// @vitest-environment node
/**
 * `/user/graperankResult` is polled by the status pill alone, and only while
 * there is something to wait for. A reader who never calculated used to be
 * asked every 20 s forever; a run that finished, every 60 s for 25 minutes.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";

vi.mock("@/services/api", () => ({ apiClient: {} }));
vi.mock("@/accounts/signing", () => ({ activeAccount: () => undefined }));

import {
  AWAITING_RUN_POLL_MS,
  IN_FLIGHT_POLL_MS,
  TRIGGER_WINDOW_MS,
  __resetGrapeRankTrigger,
  grapeRankPollMs,
  invalidateOwnScoreReads,
  noteGrapeRankTriggered,
} from "./graperank";

const NOW = Date.parse("2026-11-23T12:00:00Z");
const envelope = (data: unknown) => ({ code: 200, message: "ok", data });
const finished = (at: string) => ({
  status: "success",
  internal_publication_status: "success",
  ta_status: "success",
  created_at: at,
  updated_at: at,
});

afterEach(() => __resetGrapeRankTrigger());

describe("grapeRankPollMs", () => {
  it("asks nothing when there is no run and none was asked for", () => {
    expect(grapeRankPollMs(envelope(null), 0, NOW)).toBe(false);
    expect(grapeRankPollMs(undefined, 0, NOW)).toBe(false);
  });

  it("asks nothing about a run that finished", () => {
    expect(grapeRankPollMs(envelope(finished("2026-11-23T11:00:00")), 0, NOW)).toBe(false);
  });

  it("asks every 15 s while a run is in flight, calculated but not yet published included", () => {
    expect(grapeRankPollMs(envelope({ status: "ongoing", internal_publication_status: "waiting" }), 0, NOW)).toBe(
      IN_FLIGHT_POLL_MS,
    );
    expect(
      grapeRankPollMs(
        envelope({ status: "success", internal_publication_status: "success", ta_status: "ongoing" }),
        0,
        NOW,
      ),
    ).toBe(IN_FLIGHT_POLL_MS);
  });

  it("stops at a failure, at either step", () => {
    expect(grapeRankPollMs(envelope({ status: "failure" }), 0, NOW)).toBe(false);
    expect(
      grapeRankPollMs(
        envelope({ status: "success", internal_publication_status: "success", ta_status: "failure" }),
        0,
        NOW,
      ),
    ).toBe(false);
  });

  it("after a trigger, keeps asking until a run newer than it shows up — for half an hour at most", () => {
    const triggeredAt = NOW - 60_000;
    // No record yet: the run hasn't been created.
    expect(grapeRankPollMs(envelope(null), triggeredAt, NOW)).toBe(AWAITING_RUN_POLL_MS);
    // The previous, finished run is all the server has.
    expect(grapeRankPollMs(envelope(finished("2026-11-22T09:00:00")), triggeredAt, NOW)).toBe(AWAITING_RUN_POLL_MS);
    // The new one, finished: done.
    expect(grapeRankPollMs(envelope(finished("2026-11-23T11:59:30")), triggeredAt, NOW)).toBe(false);
    // Long ago: given up.
    expect(grapeRankPollMs(envelope(null), NOW - TRIGGER_WINDOW_MS, NOW)).toBe(false);
  });

  it("hears a Recalculate pressed in this tab, which writes no marker", () => {
    noteGrapeRankTriggered(NOW - 1000);
    expect(grapeRankPollMs(envelope(finished("2026-11-22T09:00:00")), 0, NOW)).toBe(AWAITING_RUN_POLL_MS);
  });
});

describe("invalidateOwnScoreReads", () => {
  const ME = "a".repeat(64);
  const THEM = "b".repeat(64);

  it("refetches the reader's own reads, and leaves everyone else's alone", () => {
    const qc = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
    const mine = [
      ["/user/overview", ME, "viewer"],
      ["/user/overview", ME, "house"],
      ["/user/stats", ME, "viewer"],
      ["/user/history", ME],
      ["/networkAlerts", ME, 100],
    ];
    const theirs = [
      ["/user/overview", THEM, "viewer"],
      ["/user/stats", THEM, "house"],
    ];
    for (const key of [...mine, ...theirs]) qc.setQueryData(key, { seeded: true });

    invalidateOwnScoreReads(qc, ME);

    for (const key of mine) expect(qc.getQueryState(key)?.isInvalidated).toBe(true);
    for (const key of theirs) expect(qc.getQueryState(key)?.isInvalidated).toBe(false);
  });
});
