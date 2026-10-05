import { useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Search as SearchIcon, Network as NetworkIcon, Gauge } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useLiveProfile } from "@/hooks/useLiveProfile";
import { triggerScoringAndAnchor } from "@/services/trustAnchor";
import { useActiveAccountDisplay } from "@/hooks/useActiveAccountDisplay";
import { apiClient } from "@/services/api";
import { knownFollowCount } from "@/lib/followStore";
import { useHasMywot } from "@/hooks/useHasMywot";
import { initialsFor } from "@/lib/profileDefaults";
import { useToast } from "@/hooks/use-toast";
import { accountKey } from "@/lib/accountStorage";
import { OnboardingHeader } from "@/components/OnboardingHeader";
import { Nip05Check } from "@/components/Nip05Check";

/**
 * First-run for EXISTING Nostr users (logged in via extension/nsec) who already
 * have a profile + follows but have never had their Web of Trust scored. No
 * setup chores (follow / profile / backup) — their network is already here; the
 * one payload is "calculate my scores". Shown once on first login.
 */
export default function ActivatePage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const user = useActiveAccountDisplay();
  const pubkey = user?.pubkey || "";
  const { hasMywot } = useHasMywot();

  const seenKey = pubkey ? accountKey("brainstorm_activate_seen", pubkey) : "";
  const markSeen = () => {
    try {
      if (seenKey) localStorage.setItem(seenKey, "true");
    } catch {}
  };

  useEffect(() => {
    if (!user) {
      navigate("/login", { replace: true });
      return;
    }
    // Already scored (e.g. returning user whose localStorage was cleared) — no
    // activation needed; send them straight in.
    if (hasMywot) {
      markSeen();
      navigate("/", { replace: true });
    }
  }, [user, hasMywot]); // eslint-disable-line react-hooks/exhaustive-deps

  const { profile: prof } = useLiveProfile(pubkey || undefined);
  const overviewQuery = useQuery({
    queryKey: ["activate-overview", pubkey],
    queryFn: async () => (await apiClient.getUserOverview(pubkey))?.data ?? null,
    enabled: !!pubkey,
    staleTime: 5 * 60_000,
    retry: false,
  });

  const counts = (overviewQuery.data as { counts?: Record<string, number> } | null)?.counts ?? {};
  const followingCount = counts.following ?? knownFollowCount(pubkey);
  const followersCount = counts.followed_by ?? 0;
  const name =
    prof?.display_name || prof?.name || user?.displayName || (user?.npub ? user.npub.slice(0, 12) + "…" : "there");
  const picture = prof?.picture || user?.picture;

  // Navigate to search immediately; trigger scoring in the background so the user
  // never waits on the POST. The global ScoringStatusBar shows the calculating state.
  const calc = () => {
    markSeen();
    if (pubkey) {
      try {
        localStorage.setItem(accountKey("brainstorm_calc_triggered_at", pubkey), String(Date.now()));
      } catch {}
    }
    toast({ title: "Calculating your network", description: "We're scoring it now — explore while it runs." });
    navigate("/", { replace: true });
    if (pubkey) void triggerScoringAndAnchor(pubkey).catch(() => {});
  };

  const VALUE = [
    { icon: <SearchIcon className="h-4 w-4" />, label: "Trust-ranked search" },
    { icon: <NetworkIcon className="h-4 w-4" />, label: "Network explorer" },
    { icon: <Gauge className="h-4 w-4" />, label: "Your trust dashboard" },
  ];

  return (
    <div className="min-h-page bg-gradient-to-b from-slate-50 to-white dark:from-slate-950 dark:to-slate-900">
      <OnboardingHeader
        onSkip={() => {
          markSeen();
          navigate("/", { replace: true });
        }}
        skipLabel="Skip — just let me search"
        skipTestId="activate-skip"
      />

      <main className="mx-auto max-w-xl px-4 py-8 sm:px-6 sm:py-12">
        {/* Editorial header */}
        <div className="mb-5 flex items-center gap-2.5">
          <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.25em] text-brand-accent">
            Welcome to Brainstorm
          </span>
          <div className="h-px w-12 bg-brand-accent/40" />
        </div>
        <h1
          className="text-3xl font-bold leading-[1.08] tracking-tight text-slate-900 dark:text-slate-100 sm:text-4xl"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Your network's already here. <span className="text-brand-link">Let's score it.</span>
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-slate-600 dark:text-slate-300">
          Brainstorm reads the people you already follow and scores how trusted they are — so you can search by trust,
          explore your network, and see who's actually real.
        </p>

        {/* Identity recap */}
        <div
          className="mt-6 flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
          data-testid="activate-identity"
        >
          <Avatar className="h-12 w-12 rounded-full border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            {picture ? <AvatarImage src={picture} alt={name} className="object-cover" /> : null}
            <AvatarFallback className="rounded-full bg-brand-primary/15 font-bold text-brand-primary">
              {initialsFor(name)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-base font-bold text-slate-900 dark:text-slate-100">{name}</span>
              <Nip05Check nip05={prof?.nip05} pubkey={pubkey} className="h-4 w-4 shrink-0 text-sky-500" />
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              <span className="font-semibold text-slate-700 dark:text-slate-200">{followingCount}</span> following
              {followersCount ? (
                <>
                  {" "}
                  · <span className="font-semibold text-slate-700 dark:text-slate-200">{followersCount}</span> followers
                </>
              ) : null}
            </p>
          </div>
          <span className="ml-auto shrink-0 rounded-full border border-emerald-100 bg-emerald-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-emerald-600">
            Found you
          </span>
        </div>

        {/* What you unlock */}
        <div className="mt-4 grid grid-cols-3 gap-2">
          {VALUE.map((v) => (
            <div
              key={v.label}
              className="flex flex-col items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2 py-3 text-center dark:border-slate-800 dark:bg-slate-900"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-brand-accent/20 bg-brand-accent/10 text-brand-deep">
                {v.icon}
              </span>
              <span className="text-[11px] font-semibold leading-tight text-slate-600 dark:text-slate-300">
                {v.label}
              </span>
            </div>
          ))}
        </div>

        {/* CTA */}
        <button
          type="button"
          onClick={calc}
          disabled={!pubkey}
          className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand-primary text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-primary-hover disabled:opacity-50"
          data-testid="activate-calculate"
        >
          Calculate my scores <ArrowRight className="h-4 w-4" />
        </button>
        <p className="mt-2 text-center text-xs text-slate-400 dark:text-slate-500">
          We read your existing follows — nothing to set up. This can take a few minutes; you can search while it runs.
        </p>
      </main>
    </div>
  );
}
