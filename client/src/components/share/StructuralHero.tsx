/**
 * An event of a kind the page has no card for — kind 30078 app data, a
 * relay list, whatever a typed `kind:` finds — opened as an empty white
 * box. It is structural: its meaning is in its tags. The card names the
 * kind, links the spec that defines it, shows the author's own NIP-31 `alt`
 * line, and lays the tags out readably, the raw JSON behind a disclosure.
 */
import { useState } from "react";
import { Link } from "wouter";
import { Braces, ChevronDown, ChevronRight } from "lucide-react";
import { naddrForEvent } from "@/lib/articleLinks";
import { useSpecsForKind } from "@/hooks/useSpecsForKind";

type StructuralEvent = { id: string; kind: number; pubkey: string; tags: string[][]; content: string; created_at: number };

export function StructuralHero({ event }: { event: StructuralEvent }) {
  const spec = useSpecsForKind(event.kind)[0];
  const specNaddr = spec ? naddrForEvent(spec) : null;
  const alt = event.tags.find((t) => t[0] === "alt" && t[1]?.trim())?.[1];
  const tags = event.tags.filter((t) => t[0] !== "alt");
  const [rawOpen, setRawOpen] = useState(false);

  return (
    <div data-testid="structural-hero">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100" style={{ fontFamily: "var(--font-display)" }}>
            Kind {event.kind}
          </h1>
          {spec && specNaddr ? (
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              Defined in{" "}
              <Link href={`/a/${specNaddr}`} className="font-medium text-brand-primary hover:underline dark:text-brand-link" data-testid="structural-spec">
                {spec.tags.find((t) => t[0] === "title")?.[1] ?? "a spec"}
              </Link>
            </p>
          ) : (
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">A structural event — its meaning is in its tags.</p>
          )}
        </div>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800">
          <Braces className="h-5 w-5 text-slate-400 dark:text-slate-500" />
        </div>
      </div>

      {alt && (
        <p className="mt-3 text-sm text-slate-700 dark:text-slate-200" data-testid="structural-alt">
          {alt}
        </p>
      )}

      {tags.length > 0 && (
        <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
          <table className="w-full text-left text-xs">
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {tags.map((t, i) => (
                <tr key={i} data-testid="structural-tag">
                  <th scope="row" className="w-24 px-3 py-1.5 align-top font-mono font-semibold text-slate-500 dark:text-slate-400">{t[0]}</th>
                  {t.slice(1).map((v, j) => (
                    <td key={j} className="px-3 py-1.5 align-top font-mono text-slate-700 dark:text-slate-200 break-all">{v}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <button
        type="button"
        onClick={() => setRawOpen((o) => !o)}
        className="mt-3 inline-flex items-center gap-1 text-xs text-slate-500 hover:text-brand-link dark:text-slate-400"
        data-testid="structural-raw-toggle"
      >
        {rawOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />} Raw event
      </button>
      {rawOpen && (
        <pre className="mt-2 max-h-96 overflow-auto rounded-xl bg-slate-50 p-3 text-[11px] text-slate-700 dark:bg-slate-950 dark:text-slate-300" data-testid="structural-raw">
          {JSON.stringify({ id: event.id, kind: event.kind, pubkey: event.pubkey, created_at: event.created_at, tags: event.tags, content: event.content }, null, 2)}
        </pre>
      )}
    </div>
  );
}
