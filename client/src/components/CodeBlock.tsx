import { useState } from "react";
import { copyToClipboard } from "@/lib/clipboard";
import { Check, Copy } from "lucide-react";

/**
 * A monospace code/prompt block with a copy-to-clipboard button (with a brief
 * "Copied" state). Shared by the Developers page and the "Set up with your AI
 * agent" card in Settings.
 */
export function CodeBlock({ code, testId }: { code: string; testId: string }) {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    try {
      await copyToClipboard(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div className="group/code relative overflow-hidden rounded-xl border border-slate-200 bg-slate-50 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <button
        type="button"
        onClick={onCopy}
        className="absolute right-2.5 top-2.5 inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 shadow-sm transition-colors hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
        data-testid={`button-copy-${testId}`}
        aria-label="Copy code"
      >
        {copied ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
        {copied ? "Copied" : "Copy"}
      </button>
      <pre className="overflow-x-auto p-4 pr-20 text-[13px] leading-relaxed" data-testid={`code-${testId}`}>
        <code className="whitespace-pre font-mono text-slate-800 dark:text-slate-200">{code}</code>
      </pre>
    </div>
  );
}
