import { Link } from "wouter";
import { ArrowRight } from "lucide-react";

/**
 * Anonymous signup funnel — same WoT hook as the profile page. The page shows
 * it only to signed-out readers, and not while the thread's own signup gate is
 * showing (no duplicate).
 */
export function EventFunnel({
  loggedIn,
  firstName,
  authorNpub,
  funnelLoginHref,
}: {
  loggedIn: boolean;
  firstName: string;
  authorNpub: string;
  funnelLoginHref: string;
}) {
  return (
    <div
      className="mt-6 rounded-2xl border border-brand-accent/25 bg-gradient-to-br from-brand-deep/[0.04] to-brand-accent/[0.06] p-5 text-center"
      data-testid="event-funnel"
    >
      <p
        className="text-base font-bold text-slate-900 dark:text-slate-100"
        style={{ fontFamily: "var(--font-display)" }}
      >
        Who can you trust online?
      </p>
      <p className="mx-auto mt-1 max-w-md text-sm text-slate-600 dark:text-slate-300">
        Brainstorm scores reputation from real human connections — no algorithm. See{" "}
        <span className="font-bold text-slate-900 dark:text-slate-100">{firstName}</span> and everyone else through your
        own network.
      </p>
      <Link
        href={loggedIn ? (authorNpub ? `/p/${authorNpub}?pov=mywot` : "/") : funnelLoginHref}
        className="mt-3 inline-flex items-center justify-center gap-1.5 rounded-xl bg-brand-primary px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-primary-hover"
        data-testid="event-cta"
      >
        {loggedIn ? "See it through your network" : "Create your free account"} <ArrowRight className="h-4 w-4" />
      </Link>
      {!loggedIn && (
        <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">Free, takes a minute — no email required</p>
      )}
      {!loggedIn && (
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          Already part of the network?{" "}
          <Link
            href={funnelLoginHref}
            className="font-semibold text-brand-link hover:underline"
            data-testid="event-funnel-signin"
          >
            Sign in →
          </Link>
        </p>
      )}
    </div>
  );
}
