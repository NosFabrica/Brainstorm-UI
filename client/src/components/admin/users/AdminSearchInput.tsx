import { XCircle } from "lucide-react";
import { useDraftCommit } from "./useDraftCommit";

/**
 * A search box that keeps what is being typed to itself and hands the parent
 * the text once typing pauses (useDraftCommit): held in the console, the
 * keystrokes re-rendered all of it on every key.
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
  const { draft, setDraft, clear } = useDraftCommit(value, onCommit, delayMs);

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
            clear();
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
