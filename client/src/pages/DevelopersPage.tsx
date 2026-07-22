import { Link } from "wouter";
import { ArrowRight, BadgeCheck } from "lucide-react";
import { InfoPageLayout } from "@/components/InfoPageLayout";
import { ConnectionIcon, FavoriteChartIcon, OpenSourceSection } from "@/components/developers/DevShared";

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
    icon: <ConnectionIcon className="h-5 w-5 text-[#333286]" />,
    title: "NIP-50 relay search",
    description:
      "Full-text profile search over the nostr relay protocol (WebSocket), with web-of-trust sort/filter extensions.",
    testId: "card-method-nip50",
  },
  {
    href: "/developers/open-ranking",
    icon: <FavoriteChartIcon className="h-5 w-5 text-[#333286]" />,
    title: "Open Ranking (ORE)",
    description:
      "An HTTP/JSON interface to the web of trust — capability discovery, per-pubkey stats, and ranked profile search.",
    testId: "card-method-open-ranking",
  },
  {
    href: "/developers/trusted-assertions",
    icon: <BadgeCheck className="h-5 w-5 text-[#333286]" />,
    title: "Trusted Assertions",
    description:
      "Web-of-trust scores published as ordinary nostr events (NIP-85), so any client can fetch and verify them.",
    testId: "card-method-trusted-assertions",
  },
];

export default function DevelopersPage() {
  return (
    <InfoPageLayout testId="page-developers">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10 sm:py-16">
        <div className="space-y-10 animate-fade-up">
          {/* Editorial hero */}
          <header className="max-w-3xl" data-testid="section-dev-header">
            <div className="flex items-center gap-2.5 mb-5">
              <span className="text-[11px] font-mono font-semibold tracking-[0.25em] text-[#7c86ff] uppercase">
                For developers
              </span>
              <div className="h-px w-12 bg-[#7c86ff]/40" />
            </div>
            <h1
              className="text-4xl sm:text-5xl font-bold text-slate-900 tracking-tight leading-[1.08]"
              style={{ fontFamily: "var(--font-display)" }}
              data-testid="text-dev-title"
            >
              Integrate the web of trust into <span className="text-[#333286]">your nostr client</span>.
            </h1>
            <p className="mt-5 text-lg text-slate-600 leading-relaxed max-w-2xl" data-testid="text-dev-subtitle">
              Three ways to bring this instance's Brainstorm scores into your app. Pick a method.
            </p>
          </header>

          {/* Method cards */}
          <div className="space-y-4" data-testid="section-dev-methods">
            {METHODS.map((m) => (
              <Link
                key={m.href}
                href={m.href}
                className="group flex items-center gap-5 rounded-2xl border border-slate-200 bg-white hover:border-[#7c86ff]/40 hover:shadow-sm transition-all p-6"
                data-testid={m.testId}
              >
                <div className="h-12 w-12 rounded-xl bg-[#7c86ff]/10 border border-[#7c86ff]/20 flex items-center justify-center shrink-0">
                  {m.icon}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-lg font-bold text-slate-900 tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
                    {m.title}
                  </p>
                  <p className="mt-1 text-[15px] text-slate-600 leading-relaxed">{m.description}</p>
                </div>
                <ArrowRight className="h-5 w-5 text-[#7c86ff] shrink-0 group-hover:translate-x-1 transition-transform" />
              </Link>
            ))}
          </div>

          {/* Quick "which one?" chooser — organized by goal, not by method, so it
              stays useful alongside the cards above (a method can serve more than
              one goal; Open Ranking appears under both). */}
          <div className="rounded-xl border border-[#7c86ff]/20 bg-[#7c86ff]/[0.04] px-5 py-4" data-testid="dev-chooser">
            <p className="text-sm font-semibold text-slate-700">Which one do you need?</p>
            <ul className="mt-2 space-y-1.5 text-[14px] text-slate-600">
              <li>
                <span className="text-slate-500">Looking up pubkeys (search / discovery)</span> →{" "}
                <Link href="/developers/nip-50" className="font-medium text-[#333286] hover:underline">NIP-50</Link>{" "}
                <span className="text-slate-400">(WebSocket)</span> or{" "}
                <Link href="/developers/open-ranking" className="font-medium text-[#333286] hover:underline">Open Ranking</Link>{" "}
                <span className="text-slate-400">(HTTP)</span>
              </li>
              <li>
                <span className="text-slate-500">Have a pubkey, want its scores</span> →{" "}
                <Link href="/developers/trusted-assertions" className="font-medium text-[#333286] hover:underline">Trusted Assertions</Link>{" "}
                or{" "}
                <Link href="/developers/open-ranking" className="font-medium text-[#333286] hover:underline">Open Ranking</Link>
              </li>
            </ul>
          </div>

          <OpenSourceSection />
        </div>
      </div>
    </InfoPageLayout>
  );
}
