import { useEffect, useState } from "react";
import { verifyRecording } from "@/lib/liveStream";

/**
 * Which of these recordings still answer. A replay is advertised only after
 * its recording does (lib/liveStream.verifyRecording, one HEAD per URL,
 * remembered) — so the Replays shelf counts what will actually play.
 */
export function useVerifiedRecordings(urls: string[]): Set<string> {
  const [ok, setOk] = useState<Set<string>>(() => new Set());
  const key = urls.join("\n");
  useEffect(() => {
    if (!key) return;
    let alive = true;
    for (const url of key.split("\n")) {
      void verifyRecording(url).then((good) => {
        if (!alive || !good) return;
        setOk((prev) => (prev.has(url) ? prev : new Set(prev).add(url)));
      });
    }
    return () => {
      alive = false;
    };
  }, [key]);
  return ok;
}
