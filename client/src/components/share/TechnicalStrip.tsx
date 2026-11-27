/**
 * The technical strip on an event's page — kind, the short id, the address —
 * each a click to copy, for a power user who would otherwise open the ⋯ menu
 * three times. Only in the technical view (lib/technicalView); nothing with
 * it off. Mono, small, under the byline: present, not loud.
 */
import { useState } from "react";
import { Check } from "lucide-react";
import { copyToClipboard } from "@/lib/clipboard";
import { technicalView } from "@/lib/technicalView";
import { nipForKind } from "@/lib/kindNip";

export interface TechnicalId {
  label: string;
  value: string;
}

const short = (hex: string) => (hex.length > 16 ? `${hex.slice(0, 8)}…${hex.slice(-4)}` : hex);

export function TechnicalStrip({
  event,
  ids,
  className,
}: {
  event: { id: string; kind: number };
  ids: TechnicalId[];
  className?: string;
}) {
  // Which id was just copied, and whether the copy landed.
  const [copied, setCopied] = useState<{ label: string; ok: boolean } | null>(null);
  if (!technicalView()) return null;
  const nip = nipForKind(event.kind);
  const copy = async (id: TechnicalId) => {
    const ok = await copyToClipboard(id.value);
    const shown = { label: id.label, ok };
    setCopied(shown);
    setTimeout(() => setCopied((c) => (c === shown ? null : c)), ok ? 1200 : 2400);
  };
  const all = [{ label: "id", value: event.id }, ...ids];
  return (
    <p
      className={`flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px] text-slate-400 dark:text-slate-500 ${className ?? ""}`}
      data-testid="technical-strip"
    >
      <span title={nip ? `${nip} defines this kind` : undefined}>
        kind {event.kind}
        {nip ? ` · ${nip}` : ""}
      </span>
      {all.map((id) => (
        <button
          key={id.label}
          type="button"
          onClick={() => void copy(id)}
          aria-label={`Copy ${id.label}`}
          title={`Copy ${id.label}: ${id.value}`}
          className="inline-flex items-center gap-1 rounded hover:text-brand-link focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40"
        >
          {id.label} {short(id.value)}
          {copied?.label === id.label &&
            (copied.ok ? (
              <Check className="h-3 w-3 text-emerald-500" aria-label="copied" />
            ) : (
              <span className="text-red-600 dark:text-red-400">couldn't copy</span>
            ))}
        </button>
      ))}
    </p>
  );
}
