import { useCallback, useEffect, useRef, useState } from "react";
import { copyToClipboard } from "@/lib/clipboard";

/**
 * The copy→check moment: `copy(text)` puts the text on the clipboard and
 * `copied` is true for `ttlMs` — long enough for the glyph to flip to a
 * check and back. A copy the browser refused never claims success: `failed`
 * is true for the same moment instead, so the button can say "Couldn't copy"
 * rather than nothing. The timer dies with the component.
 */
export function useCopied(ttlMs = 1500): {
  copied: boolean;
  failed: boolean;
  copy: (text: string, write?: (text: string) => Promise<boolean>) => Promise<boolean>;
} {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const copy = useCallback(
    async (text: string, write: (text: string) => Promise<boolean> = copyToClipboard) => {
      const ok = await write(text);
      setState(ok ? "copied" : "failed");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        timer.current = null;
        setState("idle");
      }, ttlMs);
      return ok;
    },
    [ttlMs],
  );
  return { copied: state === "copied", failed: state === "failed", copy };
}
