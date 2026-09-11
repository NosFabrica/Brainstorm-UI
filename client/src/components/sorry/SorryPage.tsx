import { useState, type ReactNode } from "react";
import { Link } from "wouter";
import { Loader2, RefreshCw } from "lucide-react";
import { GlossBackground } from "@/components/GlossBackground";
import { Wordmark } from "@/components/Wordmark";

/**
 * What the app shows where the thing that is down would have been. The UI
 * is a JavaScript payload that never goes down; the API and the search
 * relay do, and lib/serverStatus notices. This page is the answer — the
 * mockup's "Oops!" over the house's quiet body, the wordmark from the
 * supplied artwork, a Try again that keeps trying on its own, and the
 * site's links so nobody is stranded (Benjamin, 2026-09-09; Twitter's fail
 * whale as the reference, nginx's bare 500 as the thing never to show).
 *
 * Two shapes: the full page, for a route that cannot work at all; and the
 * inline state, for the results area of a search page whose box and tabs
 * still work.
 */
export type SorryScope = "api" | "search" | "app";

/**
 * The drawing and the words have to agree. An earlier line said the service
 * was "taking a quick break", which is rest — and the illustration is a bird
 * sprinting flat out (Benjamin, 2026-09-09: "it doesn't look like the image
 * is taking a quick break"). Running behind hands straight off to the body's
 * "catch up": one thought across two lines.
 */
const COPY: Record<SorryScope, { headline: string; line: string; body: string }> = {
  search: {
    headline: "Oops!",
    line: "Search is running behind.",
    body: "Our servers are working hard to catch up. Please try again soon!",
  },
  api: {
    headline: "Oops!",
    line: "Brainstorm is running behind.",
    body: "Our servers are working hard to catch up. Please try again soon!",
  },
  app: {
    headline: "Something went wrong.",
    line: "This page hit a snag.",
    body: "Reload to try again — nothing you did caused it.",
  },
};

const SITE_LINKS = [
  { label: "About", href: "/about" },
  { label: "How search works", href: "/how-search-works" },
  { label: "Developers", href: "/developers" },
  { label: "Q&A", href: "/faq" },
];

/**
 * The illustration slot. The file lands at client/public/brand/sorry-ostrich.png
 * when the mockup's art is ready (Benjamin, 2026-09-09: wait for it); until
 * then the image errors and the slot leaves the layout, so the page reads
 * complete without it.
 */
function SorryArt({ className = "" }: { className?: string }) {
  const [gone, setGone] = useState(false);
  if (gone) return null;
  return (
    <div className={`relative mx-auto ${className}`}>
      {/* A soft pool under the feet, not a halo around the figure: it grounds
          the bird the way an error page's illustration sits still on the
          page. Benjamin, 2026-09-09: the bob "looks dizzy" — nothing here
          moves. */}
      <div
        className="pointer-events-none absolute inset-x-[12%] bottom-[6%] -z-10 h-[18%] rounded-[50%] bg-brand-primary/10 blur-2xl dark:bg-brand-primary/20"
        aria-hidden="true"
      />
      <img src="/brand/sorry-ostrich.png" alt="" className="mx-auto w-full" onError={() => setGone(true)} data-testid="sorry-art" />
    </div>
  );
}

/** The house error page's two button shapes — the 404's too. */
export const PRIMARY_ACTION =
  "inline-flex items-center gap-2 rounded-full bg-brand-primary px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand-primary/25 transition-colors hover:bg-brand-primary-hover disabled:opacity-70";
export const SECONDARY_LINK =
  "inline-flex items-center rounded-full border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:border-brand-primary hover:text-brand-primary dark:border-slate-700 dark:text-slate-200";

function Actions({
  onRetry,
  checking,
  nextTryInSec,
  secondary,
}: {
  onRetry: () => void;
  checking?: boolean;
  nextTryInSec?: number | null;
  secondary?: ReactNode;
}) {
  return (
    <>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={onRetry}
          disabled={checking}
          className={PRIMARY_ACTION}
          data-testid="sorry-retry"
        >
          {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {checking ? "Checking…" : "Try again"}
        </button>
        {secondary}
      </div>
      {nextTryInSec != null && nextTryInSec > 0 && !checking && (
        <p className="mt-3 text-xs text-slate-400 dark:text-slate-500" data-testid="sorry-countdown">
          Checking again in {nextTryInSec}s
        </p>
      )}
    </>
  );
}

export function SorryPage({
  scope,
  variant,
  onRetry,
  checking,
  nextTryInSec,
  signedIn = false,
}: {
  scope: SorryScope;
  variant: "page" | "inline";
  onRetry: () => void;
  /** A probe is in flight — the button says so and the countdown pauses. */
  checking?: boolean;
  /** Seconds until the next automatic try, when there is one. */
  nextTryInSec?: number | null;
  /** Decides the way out offered beside Try again. */
  signedIn?: boolean;
}) {
  const copy = COPY[scope];
  const secondary =
    scope === "api" ? (
      <Link href="/" className={SECONDARY_LINK} data-testid="sorry-secondary">Search still works →</Link>
    ) : scope === "search" && signedIn ? (
      <Link href="/dashboard" className={SECONDARY_LINK} data-testid="sorry-secondary">Go to your dashboard →</Link>
    ) : null;

  if (variant === "inline") {
    return (
      <div
        className="rounded-2xl border border-slate-100 dark:border-slate-800/60 bg-white/80 dark:bg-slate-900/80 px-5 py-8 text-center"
        data-testid={`sorry-${scope}`}
      >
        <SorryArt className="mb-5 max-w-[190px]" />
        <h3 className="text-xl font-medium tracking-tight text-slate-900 dark:text-slate-100" style={{ fontFamily: "var(--font-display)" }}>
          {copy.line}
        </h3>
        <p className="mx-auto mt-1.5 max-w-md text-sm text-slate-600 dark:text-slate-300">{copy.body}</p>
        <Actions onRetry={onRetry} checking={checking} nextTryInSec={nextTryInSec} secondary={secondary} />
      </div>
    );
  }

  return (
    <SorryFrame testId={`sorry-${scope}`} headline={copy.headline} line={copy.line} body={copy.body}>
      <Actions onRetry={onRetry} checking={checking} nextTryInSec={nextTryInSec} secondary={secondary} />
    </SorryFrame>
  );
}

/**
 * The full-page frame every error page shares — the wordmark, the ostrich, an
 * "Oops!"-sized headline, and the site's links so nobody is stranded. What's
 * wrong, and what to do about it, come from the caller: the sorry page's Try
 * again, the 404's way home.
 */
export function SorryFrame({
  testId,
  headline,
  line,
  body,
  children,
}: {
  testId: string;
  headline: string;
  line: string;
  body: string;
  children: ReactNode;
}) {
  return (
    <div
      className="relative flex min-h-[100dvh] flex-col bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-100 [overflow-x:clip]"
      data-testid={testId}
    >
      <GlossBackground />
      <header className="relative z-10 px-4 pt-5 sm:px-8">
        <Link href="/" className="inline-flex" aria-label="Brainstorm home">
          <Wordmark height={28} className="dark:hidden" />
          <Wordmark height={28} variant="white" className="hidden dark:block" />
        </Link>
      </header>
      <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-4 py-10 text-center sm:px-6">
        <SorryArt className="mb-7 max-w-[260px]" />
        <h1 className="text-5xl font-medium tracking-tight text-brand-deep dark:text-brand-link sm:text-6xl" style={{ fontFamily: "var(--font-display)" }}>
          {headline}
        </h1>
        <h2 className="mt-3 text-xl font-medium text-slate-800 dark:text-slate-100 sm:text-2xl">{line}</h2>
        <p className="mt-2 max-w-md text-base text-slate-600 dark:text-slate-300 sm:text-lg">{body}</p>
        {children}
      </main>
      {/* The site's doors, on phones too — this page has nothing else to offer. */}
      <footer className="relative z-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom)+var(--bs-bottom-chrome,0px))] pt-4 text-xs">
        {SITE_LINKS.map((l) => (
          <Link key={l.href} href={l.href} className="font-medium text-slate-500 transition-colors hover:text-brand-deep dark:text-slate-400 dark:hover:text-white">
            {l.label}
          </Link>
        ))}
      </footer>
    </div>
  );
}
