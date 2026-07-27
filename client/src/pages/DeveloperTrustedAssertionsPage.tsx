import { BadgeCheck, ExternalLink } from "lucide-react";
import { env } from "@/lib/runtimeEnv";
import { InfoPageLayout } from "@/components/InfoPageLayout";
import { CodeBlock } from "@/components/CodeBlock";
import { SectionCard, OpenSourceSection, DevBackLink } from "@/components/developers/DevShared";

const NIP85_URL = "https://github.com/nostr-protocol/nips/blob/master/85.md";
const NIP85_RELAY = (env.VITE_NIP85_RELAY_URL || "").trim().replace(/\/+$/, "");

export default function DeveloperTrustedAssertionsPage() {
  return (
    <InfoPageLayout testId="page-developers-trusted-assertions">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10 sm:py-16">
        <div className="space-y-10 animate-fade-up">
          {/* Editorial hero */}
          <header className="max-w-3xl">
            <div className="mb-5"><DevBackLink /></div>
            <div className="flex items-center gap-2.5 mb-5">
              <span className="text-[11px] font-mono font-semibold tracking-[0.25em] text-brand-accent uppercase">
                Trusted Assertions · NIP-85
              </span>
              <div className="h-px w-12 bg-brand-accent/40" />
            </div>
            <h1
              className="text-4xl sm:text-5xl font-bold text-slate-900 dark:text-slate-100 tracking-tight leading-[1.08]"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Portable scores, as <span className="text-brand-link">signed nostr events</span>.
            </h1>
            <p className="mt-5 text-lg text-slate-600 dark:text-slate-300 leading-relaxed max-w-2xl">
              Web-of-trust scores published as ordinary nostr events, so any client can fetch and verify them.
            </p>
          </header>

          <SectionCard icon={<BadgeCheck className="h-5 w-5 text-brand-deep" />} title="How it works" testId="card-ta-overview">
            <p className="text-[15px] text-slate-600 dark:text-slate-300 leading-relaxed">
              Trusted Assertions are{" "}
              <code className="font-mono text-[13px] text-indigo-600">kind 30382</code> nostr events carrying web-of-trust
              scores — rank, verified follower counts, and related metrics — published by a trust authority about
              other pubkeys.
            </p>
            <p className="text-[15px] text-slate-600 dark:text-slate-300 leading-relaxed">
              Because they are ordinary signed nostr events, any client can fetch them, verify who signed them, and
              apply its own trust perspective without depending on this instance.
            </p>
            <a
              href={NIP85_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-[15px] font-medium text-brand-deep hover:underline"
              data-testid="link-nip85-spec"
            >
              Read about Trusted Assertions in the NIP-85 specification
              <ExternalLink className="h-4 w-4" />
            </a>
            <p className="pt-2 text-[13px] text-slate-400 dark:text-slate-500">Documentation coming soon.</p>
          </SectionCard>

          <SectionCard icon={<BadgeCheck className="h-5 w-5 text-brand-deep" />} title="Where to find them" testId="card-ta-fetch">
            <p className="text-[15px] text-slate-600 dark:text-slate-300 leading-relaxed">
              Query <code className="font-mono text-[13px] text-indigo-600">kind 30382</code> events from this
              instance's NIP-85 relay, authored by its trust-authority pubkey. See the NIP-85 spec for the tag
              structure.
            </p>
            {NIP85_RELAY && (
              <>
                <p className="text-[15px] text-slate-600 dark:text-slate-300 leading-relaxed">NIP-85 relay:</p>
                <CodeBlock code={NIP85_RELAY} testId="ta-relay" />
              </>
            )}
          </SectionCard>

          <OpenSourceSection />
        </div>
      </div>
    </InfoPageLayout>
  );
}
