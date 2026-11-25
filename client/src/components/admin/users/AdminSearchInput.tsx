import { useEffect, useRef, useState } from "react";
import { XCircle } from "lucide-react";

/**
 * A search box that keeps what is being typed to itself and hands the parent
 * the text once typing pauses. The admin console is one very large component:
 * holding the keystrokes there re-rendered all of it on every key.
 *
 * `value` is the committed text; setting it from outside (a "jump to user")
 * replaces what is in the box.
 */
export function AdminSearchInput({
  value,
  onCommit,
  onClear,
  placeholder,
  className,
  testId,
  clearTestId,
  delayMs = 300,
}: {
  value: string;
  onCommit: (text: string) => void;
  onClear: () => void;
  placeholder?: string;
  className?: string;
  testId?: string;
  clearTestId?: string;
  delayMs?: number;
}) {
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

  return (
    <>
      <input
        type="text"
        placeholder={placeholder}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        className={className}
        data-testid={testId}
      />
      {draft && (
        <button
          type="button"
          onClick={() => {
            setDraft("");
            committed.current = "";
            onClear();
          }}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-300"
          data-testid={clearTestId}
        >
          <XCircle className="h-3.5 w-3.5" />
        </button>
      )}
    </>
  );
}
