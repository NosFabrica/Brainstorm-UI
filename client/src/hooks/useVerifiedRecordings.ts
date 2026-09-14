import { useEffect, useState } from "react";
import { verifyRecording } from "@/lib/liveStream";

/**
 * Which of these recordings still answer. A replay is advertised only after
 * its recording does (lib/liveStream.verifyRecording, one HEAD per URL,
 * remembered) — so the Replays shelf counts what will actually play. `pending`
 * says how many answers are still out, so a page can hold a skeleton rather
 * than a verdict.
 */
export function useVerifiedRecordings(urls: string[]): { ok: Set<string>; pending: number } {
  const [ok, setOk] = useState<Set<string>>(() => new Set());
  const [settled, setSettled] = useState<Set<string>>(() => new Set());
  const key = urls.join("\n");
  useEffect(() => {
    if (!key) return;
    let alive = true;
    for (const url of key.split("\n")) {
      void verifyRecording(url).then((good) => {
        if (!alive) return;
        setSettled((prev) => (prev.has(url) ? prev : new Set(prev).add(url)));
        if (good) setOk((prev) => (prev.has(url) ? prev : new Set(prev).add(url)));
      });
    }
    return () => {
      alive = false;
    };
  }, [key]);
  const pending = urls.filter((u) => !settled.has(u)).length;
  return { ok, pending };
}
