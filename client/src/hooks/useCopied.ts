import { useCallback, useEffect, useRef, useState } from "react";
import { copyToClipboard } from "@/lib/clipboard";

/**
 * The copy→check moment: `copy(text)` puts the text on the clipboard and
 * `copied` is true for `ttlMs` — long enough for the glyph to flip to a
 * check and back. The timer dies with the component, and a copy the
 * browser refused never claims success.
 */
export function useCopied(ttlMs = 1500): { copied: boolean; copy: (text: string) => Promise<boolean> } {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const copy = useCallback(
    async (text: string) => {
      const ok = await copyToClipboard(text);
      if (!ok) return false;
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        timer.current = null;
        setCopied(false);
      }, ttlMs);
      return true;
    },
    [ttlMs],
  );
  return { copied, copy };
}
