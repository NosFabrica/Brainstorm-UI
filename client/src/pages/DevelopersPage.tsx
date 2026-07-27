import { Link } from "wouter";
import { ArrowRight, BadgeCheck } from "lucide-react";
import { InfoPageLayout } from "@/components/InfoPageLayout";
import { ConnectionIcon, FavoriteChartIcon, OpenSourceSection } from "@/components/developers/DevShared";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { tone as getTone } from "@/lib/tones";

// The developer landing/index: an editorial hero + one clickable card per way to
// bring Brainstorm's web-of-trust scores into a nostr client. Each card links to
// its own detail page. (Relay Tools is intentionally omitted until confirmed.)
const METHODS: {
  href: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  testId: string;
}[] = [
  {
    href: "/developers/nip-50",
    icon: <ConnectionIcon className="h-5 w-5 text-brand-deep" />,
    title: "NIP-50 relay search",
    description:
      "Full-text profile search over the nostr relay protocol (WebSocket), with web-of-trust sort/filter extensions.",
    testId: "card-method-nip50",
  },
  {
    href: "/developers/open-ranking",
    icon: <FavoriteChartIcon className="h-5 w-5 text-brand-deep" />,
    title: "Open Ranking (ORE)",
    description:
      "An HTTP/JSON interface to the web of trust — capability discovery, per-pubkey stats, and ranked profile search.",
    testId: "card-method-open-ranking",
  },
  {
    href: "/developers/trusted-assertions",
    icon: <BadgeCheck className="h-5 w-5 text-brand-deep" />,
    title: "Trusted Assertions",
    description:
      "Web-of-trust scores published as ordinary nostr events (NIP-85), so any client can fetch and verify them.",
    testId: "card-method-trusted-assertions",
  },
];

export default function DevelopersPage() {
  const accent = getTone("accent");
  return (
    <InfoPageLayout testId="page-developers">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10 sm:py-16">
        <div className="space-y-10 animate-fade-up">
          {/* Editorial hero */}
          <header className="max-w-3xl" data-testid="section-dev-header">
            <div className="flex items-center gap-2.5 mb-5">
              <span className="text-[11px] font-mono font-semibold tracking-[0.25em] text-brand-accent uppercase">
                For developers
              </span>
              <div className="h-px w-12 bg-brand-accent/40" />
            </div>
            <h1
              className="text-4xl sm:text-5xl font-bold text-slate-900 dark:text-slate-100 tracking-tight leading-[1.08]"
              style={{ fontFamily: "var(--font-display)" }}
              data-testid="text-dev-title"
            >
              Integrate the web of trust into <span className="text-brand-link">your nostr client</span>.
            </h1>
            <p className="mt-5 text-lg text-slate-600 dark:text-slate-300 leading-relaxed max-w-2xl" data-testid="text-dev-subtitle">
              Three ways to bring this instance's Brainstorm scores into your app. Pick a method.
            </p>
          </header>

          {/* Method cards */}
          <div className="space-y-4" data-testid="section-dev-methods">
            {METHODS.map((m) => (
              <Link
                key={m.href}
                href={m.href}
                className="group block"
                data-testid={m.testId}
              >
                <Card interactive className="flex items-center gap-5 p-6">
                  <div className={cn("h-12 w-12 rounded-xl border flex items-center justify-center shrink-0", accent.bg, accent.border)}>
                    {m.icon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-lg font-bold text-slate-900 dark:text-slate-100 tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
                      {m.title}
                    </p>
                    <p className="mt-1 text-[15px] text-slate-600 dark:text-slate-300 leading-relaxed">{m.description}</p>
                  </div>
                  <ArrowRight className="h-5 w-5 text-brand-accent shrink-0 group-hover:translate-x-1 transition-transform" />
                </Card>
              </Link>
            ))}
          </div>

          {/* Quick "which one?" chooser — organized by goal, not by method, so it
              stays useful alongside the cards above (a method can serve more than
              one goal; Open Ranking appears under both). */}
          <div className="rounded-xl border border-brand-accent/20 bg-brand-accent/[0.04] px-5 py-4" data-testid="dev-chooser">
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Which one do you need?</p>
            <ul className="mt-2 space-y-1.5 text-[14px] text-slate-600 dark:text-slate-300">
              <li>
                <span className="text-slate-500 dark:text-slate-400">Looking up pubkeys (search / discovery)</span> →{" "}
                <Link href="/developers/nip-50" className="font-medium text-brand-deep hover:underline">NIP-50</Link>{" "}
                <span className="text-slate-400 dark:text-slate-500">(WebSocket)</span> or{" "}
                <Link href="/developers/open-ranking" className="font-medium text-brand-deep hover:underline">Open Ranking</Link>{" "}
                <span className="text-slate-400 dark:text-slate-500">(HTTP)</span>
              </li>
              <li>
                <span className="text-slate-500 dark:text-slate-400">Have a pubkey, want its scores</span> →{" "}
                <Link href="/developers/trusted-assertions" className="font-medium text-brand-deep hover:underline">Trusted Assertions</Link>{" "}
                or{" "}
                <Link href="/developers/open-ranking" className="font-medium text-brand-deep hover:underline">Open Ranking</Link>
              </li>
            </ul>
          </div>

          <OpenSourceSection />
        </div>
      </div>
    </InfoPageLayout>
  );
}
