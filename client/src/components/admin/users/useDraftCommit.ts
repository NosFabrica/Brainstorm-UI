import { useEffect, useRef, useState } from "react";

/**
 * What is being typed, kept to the input that holds it, and handed on once
 * typing pauses: a keystroke re-renders the input, not the console around it.
 *
 * `value` is the committed text; setting it from outside (a "jump to user")
 * replaces the draft. `clear()` empties the draft and counts as committed, for
 * a clear button that reports the clearing itself.
 */
export function useDraftCommit(value: string, onCommit: (text: string) => void, delayMs = 300) {
  const [draft, setDraft] = useState(value);
  const committed = useRef(value);
  const commit = useRef(onCommit);
  commit.current = onCommit;

  useEffect(() => {
    if (value === committed.current) return;
    committed.current = value;
    setDraft(value);
  }, [value]);

  useEffect(() => {
    if (draft === committed.current) return;
    const timer = setTimeout(() => {
      committed.current = draft;
      commit.current(draft);
    }, delayMs);
    return () => clearTimeout(timer);
  }, [draft, delayMs]);

  const clear = () => {
    setDraft("");
    committed.current = "";
  };

  return { draft, setDraft, clear };
}
