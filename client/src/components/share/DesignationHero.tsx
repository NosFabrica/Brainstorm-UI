/**
 * A kind-10040 on /e — a NIP-85 designation: whose trust assertions this
 * person reads, and from where. It has no content; it is its rows. Every
 * one on the search relay is a Brainstorm activation, so the page is also
 * where a reader who has not activated finds the way.
 */
import { Link } from "wouter";
import { ArrowRight } from "lucide-react";
import { BrainLogo } from "@/components/BrainLogo";
import { Chip } from "@/components/ui/chip";
import { nip19 } from "nostr-tools";
import { CANONICAL_SPECS, describeDesignation } from "@/lib/nip85Declaration";

type DesignationEvent = { kind: number; pubkey: string; tags: string[][]; content: string; created_at: number };

const host = (relay: string) => relay.replace(/^wss?:\/\//, "").replace(/\/+$/, "");

export function DesignationHero({ event }: { event: DesignationEvent }) {
  const d = describeDesignation(event);
  const specPath = (spec: { kind: number; pubkey: string; identifier: string }) => `/a/${nip19.naddrEncode(spec)}`;
  const named = [...d.signals, ...(d.lists ? ["Trusted Lists"] : [])];
  const relays = [...new Set(d.providers.map((p) => host(p.relay)).filter(Boolean))];
  // The mark only where it is true: every designated provider is ours.
  const ours = d.providers.length > 0 && d.providers.every((p) => p.brainstorm);

  return (
    <div data-testid="designation-hero">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100" style={{ fontFamily: "var(--font-display)" }}>
            Trust designation
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{d.summary}</p>
        </div>
        {ours && (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800" data-testid="designation-mark">
            <BrainLogo size={22} className="dark:hidden" />
            <BrainLogo size={22} mono className="hidden text-white dark:block" />
          </div>
        )}
      </div>

      {named.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5" data-testid="designation-signals">
          <span className="mr-1 font-mono text-[11px] uppercase tracking-wider text-slate-400 dark:text-slate-500">Signals</span>
          {named.map((s) => (
            <Chip key={s} size="sm" tone={ours ? "brand" : "slate"}>{s}</Chip>
          ))}
        </div>
      )}
      {relays.length > 0 && (
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          Served from <span className="font-mono">{relays.join(", ")}</span>
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <Link href="/activate" className="inline-flex items-center gap-1 font-medium text-brand-primary hover:underline dark:text-brand-link" data-testid="designation-activate">
          Activate yours <ArrowRight className="h-3.5 w-3.5" />
        </Link>
        <Link href={specPath(CANONICAL_SPECS.assertions)} className="text-slate-500 hover:text-brand-link hover:underline dark:text-slate-400" data-testid="designation-spec">
          Read the spec · {CANONICAL_SPECS.assertions.title}
        </Link>
        {d.lists && (
          <Link href={specPath(CANONICAL_SPECS.lists)} className="text-slate-500 hover:text-brand-link hover:underline dark:text-slate-400" data-testid="designation-lists-spec">
            {CANONICAL_SPECS.lists.title}
          </Link>
        )}
      </div>
    </div>
  );
}
