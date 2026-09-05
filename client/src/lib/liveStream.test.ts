import { describe, it, expect, vi, beforeEach } from "vitest";
import { liveCategoryOf, liveNeedsCheck, liveStateOf, onAirLabel, verifyRecording, __resetRecordingChecks } from "./liveStream";

// Odell's year-old replay: the recording host (data.zap.stream) no longer
// answers at all, and the panel advertised a black player. A recording is
// advertised only after it has answered.
describe("verifyRecording", () => {
  beforeEach(() => __resetRecordingChecks());

  it("a recording that answers is playable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 200 })));
    expect(await verifyRecording("https://customer-51tz.cloudflarestream.com/abc/manifest/video.m3u8")).toBe(true);
  });

  it("a missing or dead recording is not", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 404 })));
    expect(await verifyRecording("https://data.zap.stream/recording/gone.m3u8")).toBe(false);
    __resetRecordingChecks();
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    expect(await verifyRecording("https://data.zap.stream/recording/dead.m3u8")).toBe(false);
  });

  it("trusts YouTube without asking — its player answers for itself", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await verifyRecording("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("asks once per recording", async () => {
    const fetchMock = vi.fn(async () => new Response("", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await verifyRecording("https://cdn.example/replay.mp4");
    await verifyRecording("https://cdn.example/replay.mp4");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

// The Live tab's three shelves. Probed 2026-09-05: of the 200 newest 30311s,
// 97 say live (62 with viewers, 80 with a poster; half on air for over a day —
// radio and Owncast servers that never end), 80 ended (16 with a recording),
// none planned; kind 30313 meetings carry the planned ones; kind 30312 rooms
// are 8k mostly-closed, untitled machine records.
describe("liveStateOf — which shelf a NIP-53 event belongs on, if any", () => {
  const now = 1_800_000_000;
  const ev = (kind: number, tags: string[][]) => ({ id: "x", pubkey: "a".repeat(64), kind, created_at: now - 60, tags, content: "" });
  it("a live stream is live; an ended one is a replay only with a recording", () => {
    expect(liveStateOf(ev(30311, [["d", "s"], ["title", "Show"], ["status", "live"]]), now)).toBe("live");
    expect(liveStateOf(ev(30311, [["d", "s"], ["title", "Show"], ["status", "ended"], ["recording", "https://r/x.m3u8"]]), now)).toBe("replay");
    expect(liveStateOf(ev(30311, [["d", "s"], ["title", "Show"], ["status", "ended"]]), now)).toBeNull();
  });
  it("planned, or starting later, is upcoming — for streams and for 30313 meetings", () => {
    expect(liveStateOf(ev(30311, [["d", "s"], ["title", "Show"], ["status", "planned"], ["starts", String(now + 3600)]]), now)).toBe("upcoming");
    expect(liveStateOf(ev(30313, [["d", "m"], ["title", "Grounded Value"], ["status", "planned"], ["starts", String(now + 7200)]]), now)).toBe("upcoming");
    // Planned long ago and never started is not upcoming.
    expect(liveStateOf(ev(30313, [["d", "m"], ["title", "Old"], ["status", "planned"], ["starts", String(now - 86_400)]]), now)).toBeNull();
  });
  it("rooms count only while open and titled; untitled machine records never", () => {
    expect(liveStateOf(ev(30312, [["d", "r"], ["title", "JB's Voice Room"], ["status", "open"]]), now)).toBe("live");
    expect(liveStateOf(ev(30312, [["d", "r"], ["title", "JB's Voice Room"], ["status", "closed"]]), now)).toBeNull();
    expect(liveStateOf(ev(30312, [["d", "r"], ["status", "open"]]), now)).toBeNull();
    expect(liveStateOf(ev(30313, [["d", "m"], ["t", "x"]]), now)).toBeNull();
  });
});

describe("onAirLabel — how long a stream has been on, when that still means something", () => {
  const now = 1_800_000_000;
  it("says hours and minutes under a day, nothing past it (radio never ends)", () => {
    expect(onAirLabel(now - (2 * 3600 + 15 * 60), now)).toBe("2h 15m");
    expect(onAirLabel(now - 40 * 60, now)).toBe("40m");
    expect(onAirLabel(now - 30 * 3600, now)).toBeNull();
    expect(onAirLabel(0, now)).toBeNull();
  });
});

describe("liveCategoryOf — one category worth a word", () => {
  const ev = (tags: string[][]) => ({ id: "x", pubkey: "a".repeat(64), kind: 30311, created_at: 1, tags, content: "" });
  it("skips the platform words every stream carries and keeps the first real one", () => {
    expect(liveCategoryOf(ev([["t", "streaming"], ["t", "tech"]]))).toBe("tech");
    expect(liveCategoryOf(ev([["t", "livestream"], ["t", "Owncast"], ["t", "video-games"]]))).toBe("video-games");
    expect(liveCategoryOf(ev([["t", "streaming"]]))).toBeNull();
  });
});

// Benjamin, over "Joe Martin — Live from Barnoldswick" wearing a LIVE pill:
// the event was published 2.4 years ago and never updated; "Revolution Rocks
// — Belgrade" 78 days ago. Platforms republish a live event as viewers come
// and go, so a "live" nobody has touched in a week is stale; one a day or
// more old must prove its stream still answers (probed 2026-09-05: half the
// two-day-old "live" manifests return 404, every fresh one answers).
describe("stale live — a status nobody updated is not a broadcast", () => {
  const now = 1_800_000_000;
  const live = (ageSec: number, extra: string[][] = []) => ({ id: "x", pubkey: "a".repeat(64), kind: 30311, created_at: now - ageSec, tags: [["d", "s"], ["title", "Show"], ["status", "live"], ["streaming", "https://cdn/live.m3u8"], ...extra], content: "" });
  it("a live older than a week is over — a replay only with a recording", () => {
    expect(liveStateOf(live(8 * 86_400), now)).toBeNull();
    expect(liveStateOf(live(8 * 86_400, [["recording", "https://r/x.m3u8"]]), now)).toBe("replay");
    expect(liveStateOf(live(2 * 86_400), now)).toBe("live");
  });
  it("a live whose own end has passed is over", () => {
    expect(liveStateOf(live(3600, [["ends", String(now - 60)]]), now)).toBeNull();
    expect(liveStateOf(live(3600, [["ends", String(now + 3600)]]), now)).toBe("live");
  });
  it("a live a day or more old must prove its stream answers; a fresh one is trusted", () => {
    expect(liveNeedsCheck(live(2 * 86_400), now)).toBe("https://cdn/live.m3u8");
    expect(liveNeedsCheck(live(3600), now)).toBeNull();
    expect(liveNeedsCheck(live(2 * 86_400, [["current_participants", "12"]]), now)).toBeNull();
    // Nothing to ask: a LiveKit room or a platform page is not a URL a HEAD can answer for.
    expect(liveNeedsCheck({ ...live(2 * 86_400), tags: [["d", "s"], ["title", "Show"], ["status", "live"], ["streaming", "wss+livekit://nostrnests.com:443"]] }, now)).toBeNull();
  });
});
