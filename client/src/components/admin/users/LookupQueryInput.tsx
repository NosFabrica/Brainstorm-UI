import { useState } from "react";
import { Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Lookup's text box and button. What is typed stays here, so a keystroke
 * re-renders this row and not the whole admin console.
 */
export function LookupQueryInput({
  running,
  onSubmit,
  onEdit,
}: {
  running: boolean;
  onSubmit: (text: string) => void;
  /** Called on every edit, to clear a stale error or result list. */
  onEdit: () => void;
}) {
  const [text, setText] = useState("");
  return (
    <div className="flex min-w-0 gap-2">
      <input
        type="text"
        placeholder="Name, npub, or hex pubkey"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          onEdit();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !running) onSubmit(text);
        }}
        className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-xs focus:border-brand-accent/40 focus:outline-none focus:ring-2 focus:ring-brand-accent/30 dark:border-slate-800 dark:bg-slate-900/80"
        data-testid="input-lookup-pubkey"
      />
      <Button
        size="sm"
        onClick={() => onSubmit(text)}
        disabled={running || !text.trim()}
        className="no-default-hover-elevate no-default-active-elevate shrink-0 gap-1.5 text-xs"
        data-testid="button-submit-lookup"
      >
        {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
        {running ? "..." : "Lookup"}
      </Button>
    </div>
  );
}
