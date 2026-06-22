import { useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Loader2, ArrowRight, Search as SearchIcon, Network as NetworkIcon, Gauge, BadgeCheck } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { BrainLogo } from "@/components/BrainLogo";
import { getCurrentUser, fetchProfile, triggerScoringAndAnchor } from "@/services/nostr";
import { apiClient } from "@/services/api";
import { knownFollowCount } from "@/lib/followStore";
import { useHasMywot } from "@/hooks/useHasMywot";
import { initialsFor } from "@/lib/profileDefaults";
import { useToast } from "@/hooks/use-toast";

/**
 * First-run for EXISTING Nostr users (logged in via extension/nsec) who already
 * have a profile + follows but have never had their Web of Trust scored. No
 * setup chores (follow / profile / backup) — their network is already here; the
 * one payload is "calculate my scores". Shown once on first login.
 */
export default function ActivatePage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const user = getCurrentUser();
  const pubkey = user?.pubkey || "";
  const { hasMywot } = useHasMywot();

  const seenKey = pubkey ? `brainstorm_activate_seen:${pubkey}` : "";
  const markSeen = () => { try { if (seenKey) localStorage.setItem(seenKey, "true"); } catch {} };

  useEffect(() => {
    if (!user) { navigate("/login", { replace: true }); return; }
    // Already scored (e.g. returning user whose localStorage was cleared) — no
    // activation needed; send them straight in.
    if (hasMywot) { markSeen(); navigate("/", { replace: true }); }
  }, [user, hasMywot]); // eslint-disable-line react-hooks/exhaustive-deps

  const profileQuery = useQuery({
    queryKey: ["activate-profile", pubkey],
    queryFn: () => fetchProfile(pubkey),
    enabled: !!pubkey,
    staleTime: 5 * 60_000,
    retry: false,
  });
  const overviewQuery = useQuery({
    queryKey: ["activate-overview", pubkey],
    queryFn: async () => (await apiClient.getUserOverview(pubkey))?.data ?? null,
    enabled: !!pubkey,
    staleTime: 5 * 60_000,
    retry: false,
  });

  const prof = profileQuery.data as { display_name?: string; name?: string; picture?: string; nip05?: string } | undefined;
  const counts = (overviewQuery.data as { counts?: Record<string, number> } | null)?.counts ?? {};
  const followingCount = counts.following ?? knownFollowCount(pubkey);
  const followersCount = counts.followed_by ?? 0;
  const name = prof?.display_name || prof?.name || user?.displayName || (user?.npub ? user.npub.slice(0, 12) + "…" : "there");
  const picture = prof?.picture || user?.picture;

  const calc = useMutation({
    mutationFn: async () => { if (pubkey) await triggerScoringAndAnchor(pubkey); },
    onSuccess: () => {
      markSeen();
      toast({ title: "Calculating your Web of Trust", description: "We're scoring your network — explore while it runs." });
      navigate("/", { replace: true });
    },
    onError: () => {
      markSeen();
      toast({ variant: "destructive", title: "Couldn't start the calculation", description: "Please try again from your dashboard in a moment." });
      navigate("/", { replace: true });
    },
  });

  const VALUE = [
    { icon: <SearchIcon className="h-4 w-4" />, label: "Trust-ranked search" },
    { icon: <NetworkIcon className="h-4 w-4" />, label: "Network explorer" },
    { icon: <Gauge className="h-4 w-4" />, label: "Your trust dashboard" },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur">
        <div className="mx-auto max-w-xl flex items-center justify-between px-4 sm:px-6 h-14">
          <div className="flex items-center gap-2">
            <BrainLogo size={26} className="text-indigo-500" />
            <span className="text-lg font-bold text-slate-900" style={{ fontFamily: "var(--font-display)" }}>Brainstorm</span>
          </div>
          <button
            type="button"
            onClick={() => { markSeen(); navigate("/", { replace: true }); }}
            className="text-sm font-semibold text-slate-400 hover:text-slate-600"
            data-testid="activate-skip"
          >
            Skip — just let me search
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-xl px-4 sm:px-6 py-8 sm:py-12">
        {/* Editorial header */}
        <div className="flex items-center gap-2.5 mb-5">
          <span className="text-[11px] font-mono font-semibold tracking-[0.25em] text-[#7c86ff] uppercase">Welcome to Brainstorm</span>
          <div className="h-px w-12 bg-[#7c86ff]/40" />
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 tracking-tight leading-[1.08]" style={{ fontFamily: "var(--font-display)" }}>
          Your network's already here. <span className="text-[#333286]">Let's score it.</span>
        </h1>
        <p className="mt-4 text-lg text-slate-600 leading-relaxed">
          Brainstorm reads the people you already follow and scores how trusted they are — so you can
          search by trust, explore your network, and see who's actually real.
        </p>

        {/* Identity recap */}
        <div className="mt-6 flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" data-testid="activate-identity">
          <Avatar className="h-12 w-12 rounded-full bg-white border border-slate-200">
            {picture ? <AvatarImage src={picture} alt={name} className="object-cover" /> : null}
            <AvatarFallback className="rounded-full bg-indigo-100 text-indigo-700 font-bold">{initialsFor(name)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-base font-bold text-slate-900 truncate">{name}</span>
              {prof?.nip05 && <BadgeCheck className="h-4 w-4 text-sky-500 shrink-0" />}
            </div>
            <p className="text-sm text-slate-500">
              <span className="font-semibold text-slate-700">{followingCount}</span> following
              {followersCount ? <> · <span className="font-semibold text-slate-700">{followersCount}</span> followers</> : null}
            </p>
          </div>
          <span className="ml-auto text-[11px] font-bold uppercase tracking-wide text-emerald-600 bg-emerald-50 border border-emerald-100 rounded-full px-2.5 py-1 shrink-0">Found you</span>
        </div>

        {/* What you unlock */}
        <div className="mt-4 grid grid-cols-3 gap-2">
          {VALUE.map((v) => (
            <div key={v.label} className="flex flex-col items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2 py-3 text-center">
              <span className="h-8 w-8 rounded-lg bg-[#7c86ff]/10 border border-[#7c86ff]/20 text-[#333286] flex items-center justify-center">{v.icon}</span>
              <span className="text-[11px] font-semibold text-slate-600 leading-tight">{v.label}</span>
            </div>
          ))}
        </div>

        {/* CTA */}
        <button
          type="button"
          onClick={() => calc.mutate()}
          disabled={calc.isPending || !pubkey}
          className="mt-6 w-full h-12 rounded-xl bg-[#3730a3] hover:bg-[#312e81] disabled:opacity-50 text-white font-semibold text-sm shadow-sm transition-colors flex items-center justify-center gap-2"
          data-testid="activate-calculate"
        >
          {calc.isPending ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Starting…</>
          ) : (
            <>Calculate my Web of Trust <ArrowRight className="h-4 w-4" /></>
          )}
        </button>
        <p className="mt-2 text-center text-xs text-slate-400">
          We read your existing follows — nothing to set up. This can take a few minutes; you can search while it runs.
        </p>
      </main>
    </div>
  );
}
