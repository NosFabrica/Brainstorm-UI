import { describe, it, expect, vi, beforeEach } from "vitest";
import { verifyRecording, __resetRecordingChecks } from "./liveStream";

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
