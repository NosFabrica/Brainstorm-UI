/**
 * An event of a kind the page has no card for — kind 30078 app data, a
 * relay list, whatever a typed `kind:` finds — opened as an empty white
 * box. It is structural: its meaning is in its tags. The card names the
 * kind, links the spec that defines it, shows the author's own NIP-31 `alt`
 * line, and lays the tags out readably, the raw JSON behind a disclosure.
 */
import { useState } from "react";
import { Link } from "wouter";
import { Braces, ChevronDown, ChevronRight, Lock } from "lucide-react";
import { useSpecsForKind } from "@/hooks/useSpecsForKind";
import { contentShape } from "@/lib/contentShape";
import { kindTypeLabel } from "@/components/search/SerpRow";

type StructuralEvent = { id: string; kind: number; pubkey: string; tags: string[][]; content: string; created_at: number };

export function StructuralHero({ event }: { event: StructuralEvent }) {
  const specs = useSpecsForKind(event.kind);
  const specNames = specs.slice(0, 2).map((sp) => sp.tags.find((t) => t[0] === "title")?.[1] ?? "a spec").join(", ") + (specs.length > 2 ? ` +${specs.length - 2}` : "");
  const label = kindTypeLabel(event.kind);
  const named = !label.startsWith("Kind ");
  const shape = contentShape(event.content);
  const alt = event.tags.find((t) => t[0] === "alt" && t[1]?.trim())?.[1];
  const tags = event.tags.filter((t) => t[0] !== "alt");
  const [rawOpen, setRawOpen] = useState(false);

  return (
    <div data-testid="structural-hero">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100" style={{ fontFamily: "var(--font-display)" }}>
            {label}
            {named && <span className="ml-2 font-mono text-sm font-normal text-slate-400 dark:text-slate-500">kind {event.kind}</span>}
          </h1>
          {specs.length > 0 ? (
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              Specs covering it:{" "}
              <Link href={`/?t=nips&q=${encodeURIComponent(`kind:${event.kind}`)}`} className="font-medium text-brand-primary hover:underline dark:text-brand-link" data-testid="structural-spec">
                {specNames}
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

      {/* Ciphertext is said, not shown; JSON is shown readably. */}
      {(shape.kind === "encrypted" || shape.kind === "json") && (
        <p className="mt-3 inline-flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400" data-testid="structural-content-shape">
          {shape.kind === "encrypted" ? <><Lock className="h-3 w-3" /> Encrypted — only its owner can read it</> : <><Braces className="h-3 w-3" /> Structured data · {shape.fields} {shape.fields === 1 ? "field" : "fields"}</>}
        </p>
      )}
      {shape.kind === "json" && (
        <pre className="mt-2 max-h-72 overflow-auto rounded-xl bg-slate-50 p-3 text-[11px] text-slate-700 dark:bg-slate-950 dark:text-slate-300" data-testid="structural-json">
          {JSON.stringify(JSON.parse(event.content), null, 2)}
        </pre>
      )}
      {shape.kind === "text" && (
        <p className="mt-3 whitespace-pre-wrap break-words text-sm text-slate-700 dark:text-slate-200">{event.content}</p>
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
