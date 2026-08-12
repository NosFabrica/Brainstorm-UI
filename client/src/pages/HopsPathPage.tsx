import { useMemo, useState, type MouseEvent } from "react";
import { useRoute, Redirect, Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Shuffle, ShieldAlert, Flag, UserPlus, Check, ChevronDown } from "lucide-react";
import { decodeShareId, npubFromPubkey } from "@/lib/shareId";
import { fetchProfileForShare, fetchProfileMap, logout } from "@/services/nostr";
import { AccountMenu } from "@/components/AccountMenu";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { reportUser, followUser, fetchContactList, getFollowedPubkeys } from "@/services/socialActions";
import { useToast } from "@/hooks/use-toast";
import { apiClient, hasSessionToken } from "@/services/api";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { DefaultAvatarImg } from "@/components/share/DefaultAvatarImg";
import { Wordmark } from "@/components/Wordmark";
import { ordinal } from "@/components/DegreeChip";
import { tierForScore } from "@/components/share/TrustScoreBadge";
import { TrustScoreModal, PovIcon, povChrome, useScorePov } from "@/components/score/TrustScorePov";

function shortNpub(npub: string): string {
  return `${npub.slice(0, 10)}…${npub.slice(-4)}`;
}

/**
 * The "shortest path" page (`/p/:id/hops`): explains the degree metric and shows
 * ONE randomly-chosen shortest follow-path from the viewer to this profile, with a
 * "show another path" shuffle. Each node links to that person's profile — the core
 * use case being to spot the one weak-link account to report so a whole swarm
 * downstream of it drops out of your trust network. Signed-in + scored viewers only.
 */
export default function HopsPathPage() {
  const [, navigate] = useLocation();
  const [, params] = useRoute("/p/:id/hops");
  const rawId = params?.id || "";
  const decoded = useMemo(() => decodeShareId(rawId), [rawId]);
  const relayHints = decoded?.relays || [];

  const [me, setMe] = useCurrentUser();
  const handleLogout = () => { logout(); setMe(null); };
  const fromPubkey = me?.pubkey || "";
  const toPubkey = decoded?.pubkey || "";
  const signedIn = hasSessionToken();
  const calcDone = (() => {
    try {
      return localStorage.getItem("brainstorm_calc_completed") === "true";
    } catch {
      return false;
    }
  })();
  const eligible = signedIn && calcDone && !!fromPubkey && !!toPubkey && fromPubkey !== toPubkey;

  // Shuffle: each bump re-fetches, and the endpoint returns a different random path.
  const [nonce, setNonce] = useState(0);
  // Sitewide score-POV (personalized vs global) + the shared explainer modal.
  const { pov: scorePov } = useScorePov();
  const [scoreExplainOpen, setScoreExplainOpen] = useState(false);

  const pathQuery = useQuery({
    queryKey: ["shortestPath", fromPubkey, toPubkey, nonce],
    queryFn: () => apiClient.getShortestPath({ from: fromPubkey, to: toPubkey }),
    enabled: eligible,
    // Stable per nonce — the shuffle bumps `nonce` to force a fresh random path,
    // so we don't want background refetches remounting the list (resets node state).
    staleTime: 5 * 60_000,
    retry: false,
  });

  const subjectQuery = useQuery({
    queryKey: ["share-profile", toPubkey],
    queryFn: () => fetchProfileForShare(toPubkey, { relayHints }),
    enabled: !!toPubkey,
    staleTime: 5 * 60_000,
    retry: false,
  });

  const d = pathQuery.data;
  const profilesQuery = useQuery({
    queryKey: ["hops-profiles", (d?.path ?? []).join(",")],
    queryFn: () => fetchProfileMap(d!.path),
    enabled: !!d?.path?.length,
    staleTime: 5 * 60_000,
    retry: false,
  });

  // Each node's trust score (0–1) from BOTH views — yours (authed overview) and
  // everyone's (house). Fetching both makes the POV toggle instant and lets the
  // pill hint when the two views disagree. Short paths → few calls.
  const scoresQuery = useQuery({
    queryKey: ["hops-scores-both", signedIn, (d?.path ?? []).join(",")],
    queryFn: async () => {
      const entries = await Promise.all(
        d!.path.map(async (pk) => {
          const [mine, house] = await Promise.all([
            signedIn
              ? apiClient.getUserOverview(pk).then((r) => {
                  const inf = r?.data?.influence;
                  return typeof inf === "number" ? inf : null;
                }).catch(() => null)
              : Promise.resolve(null),
            apiClient.getHouseInfluence(pk).catch(() => null),
          ]);
          return [pk, { mine, house }] as const;
        }),
      );
      return new Map(entries);
    },
    enabled: !!d?.path?.length,
    staleTime: 5 * 60_000,
    retry: false,
  });
  // The ACTIVE view's number per node (drives tiers + the weak-link pick).
  const scores = useMemo(() => {
    if (!scoresQuery.data) return undefined;
    const m = new Map<string, number | null>();
    scoresQuery.data.forEach((v, pk) => m.set(pk, scorePov === "personalized" ? (v.mine ?? v.house) : v.house));
    return m;
  }, [scoresQuery.data, scorePov]);

  // My own follow list once → know which path nodes I already follow.
  const followingQuery = useQuery({
    queryKey: ["my-following", fromPubkey],
    queryFn: async () => getFollowedPubkeys(await fetchContactList(fromPubkey)),
    enabled: eligible && !!fromPubkey,
    staleTime: 5 * 60_000,
    retry: false,
  });

  // replace, not push — see ConnectionListPage. These guards fire on the first
  // render before params/auth resolve, and a pushed entry poisons the back stack.
  // Same as ConnectionListPage: an unresolved route is not an invalid one.
  if (!rawId) return null;
  if (!toPubkey) return <Redirect to="/" replace />;
  // v1 is signed-in + scored only; send everyone else back to the profile.
  if (!eligible) return <Redirect to={`/p/${rawId}`} replace />;

  const subjectName =
    subjectQuery.data?.display_name || subjectQuery.data?.name || shortNpub(npubFromPubkey(toPubkey));
  const profs = profilesQuery.data;
  const myFollows = followingQuery.data;

  // Weak link = the DECISION-MAKER, not the scammer: the last trusted account before
  // trust collapses — the node that follows the first low-trust ("bad") node in the
  // path. Its follow-decision is how a flagged account reached your network (Vitor:
  // "the person who decided a scammer is worth following"). We surface two roles:
  //   • weakLinkIndex — the decision-maker (authentic → usually an honest mistake).
  //   • entryBadIndex — the first low-trust node it follows: the account to REPORT,
  //     whose takedown disconnects the swarm downstream of it (David's scammer hub).
  // If YOU follow the first bad node directly, there's no intermediate decision-maker.
  let entryBadIndex = -1;
  if (d?.path && scores) {
    for (let i = 1; i < d.path.length; i++) {
      const s = scores.get(d.path[i]);
      if (typeof s !== "number") continue;
      const key = tierForScore(s).key;
      if (key === "low" || key === "unverified") { entryBadIndex = i; break; }
    }
  }
  const weakLinkIndex = entryBadIndex > 1 ? entryBadIndex - 1 : -1; // -1 ⇒ it's You, or none
  const youFollowBadDirectly = entryBadIndex === 1;

  // Display name for a path node by index (subject resolves via relay-hint profile).
  const nameAt = (i: number): string => {
    const pk = d?.path?.[i];
    if (!pk) return "";
    const sp = i === (d!.path.length - 1) ? subjectQuery.data : undefined;
    const pp = profs?.get(pk);
    return sp?.display_name || sp?.name || pp?.display_name || pp?.name || shortNpub(npubFromPubkey(pk));
  };

  const backLink = `/p/${rawId}`;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 dark:from-slate-950 to-white dark:to-slate-900">
      <header className="border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur sticky top-0 z-10">
        <div className="mx-auto max-w-xl flex items-center gap-3 px-4 sm:px-6 h-14">
          {/* Pops history instead of pushing the profile again — same fix and
              same reasoning as ConnectionListPage. `backLink` is the fallback
              for a cold deep-link with nothing to pop. */}
          <button
            type="button"
            onClick={() => {
              if (typeof window !== "undefined" && window.history.length > 1) window.history.back();
              else navigate(backLink);
            }}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 dark:text-slate-100 hover:text-slate-900 dark:hover:text-white transition-colors"
            data-testid="hops-back"
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
          <div className="ml-auto flex items-center gap-3">
            <Link href="/" className="flex items-center" aria-label="Brainstorm home">
              <Wordmark height={24} className="dark:hidden" />
              <Wordmark height={24} variant="white" className="hidden dark:block" />
            </Link>
            {me && <AccountMenu user={me} onLogout={handleLogout} />}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-xl px-4 sm:px-6 py-8">
        <div className="flex items-center gap-2.5 mb-3">
          <span className="text-[11px] font-mono font-semibold tracking-[0.25em] text-brand-accent uppercase">Connection</span>
          <div className="h-px w-10 bg-brand-accent/40" />
        </div>

        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100 tracking-tight leading-tight" style={{ fontFamily: "var(--font-display)" }}>
          Your connection to <span className="text-brand-link">{subjectName}</span>
        </h1>

        {pathQuery.isPending ? (
          <div className="mt-8 flex items-center gap-2 text-slate-400 dark:text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Finding your connection…</div>
        ) : !d || !d.reachable || d.hops === 0 ? (
          <p className="mt-4 text-slate-600 dark:text-slate-300" data-testid="hops-unreachable">
            {d && d.hops === 0
              ? "That's you."
              : `Not connected — ${subjectName} can't be reached through the people you follow.`}
          </p>
        ) : (
          <>
            <p className="mt-3 text-[15px] text-slate-600 dark:text-slate-300 leading-relaxed">
              <span className="font-semibold text-slate-900 dark:text-slate-100">{ordinal(d.hops)} degree</span> —{" "}
              {d.hops === 1 ? (
                <>you follow {subjectName} directly.</>
              ) : (
                <>you're connected to {subjectName} through <span className="font-semibold">{d.hops - 1}</span> {d.hops - 1 === 1 ? "person" : "people"}.</>
              )}{" "}
              {d.pathCount === 1 ? (
                <>This is the only connection this direct:</>
              ) : (
                <>There are <span className="font-semibold text-slate-900 dark:text-slate-100">{d.pathCount.toLocaleString()}{d.pathCountCapped ? "+" : ""}</span> connections this direct — here's one:</>
              )}
            </p>

            {/* The path — each node links to their profile. The weak-link explanation
                lives INSIDE the weak-link card (progressive disclosure), not up here. */}
            {/* The route — one connected timeline. A rail threads through the avatars
                so it reads as a single path (you → them), not a stack of cards. Uniform
                across mobile / desktop / PWA — no breakpoint reflow. */}
            <ol className="mt-5 rounded-2xl border border-slate-100 dark:border-slate-800/60 bg-white dark:bg-slate-900 p-3 sm:p-4 shadow-sm" data-testid="hops-path">
              {d.path.map((pk, i) => {
                const p = profs?.get(pk);
                const npub = npubFromPubkey(pk);
                const isMe = i === 0;
                const isSubject = i === d.path.length - 1;
                // The target's kind-0 usually lives on its own relays, which the
                // bulk profile map (fixed relay set) misses — so for the subject
                // reuse the relay-hint-resolved profile the page title already
                // fetched. Keeps name + avatar consistent with the header/SharePage.
                const subj = isSubject ? subjectQuery.data : undefined;
                const picture = subj?.picture || p?.picture;
                const name = subj?.display_name || subj?.name || p?.display_name || p?.name || shortNpub(npub);
                const roleLabel = isMe ? "You" : isSubject ? "Them" : "Connector";
                const score = scores?.get(pk);
                const tier = typeof score === "number" ? tierForScore(score) : null;
                const isWeakLink = i === weakLinkIndex; // decision-maker (authentic)
                const isEntryBad = i === entryBadIndex; // low-trust account to report (score-derived, NOT an existing report/mute)
                const tint = isWeakLink
                  ? "bg-amber-50 dark:bg-amber-500/10 ring-1 ring-amber-200 dark:ring-amber-500/25"
                  : isEntryBad
                    ? "bg-rose-50 dark:bg-rose-500/10 ring-1 ring-rose-200 dark:ring-rose-500/25"
                    : "";
                return (
                  <li key={`${pk}-${i}`} className="flex gap-3" data-testid={`hops-node-${i}`}>
                    {/* Rail column: avatar sits on the thread; the line fills the rest of
                        the row height, connecting down to the next avatar. */}
                    <div className="flex flex-col items-center shrink-0">
                      <Link href={`/p/${npub}`} className="group">
                        <Avatar className="h-10 w-10 ring-1 ring-slate-200 dark:ring-slate-800">
                          {picture ? <AvatarImage src={picture} alt="" className="object-cover" /> : null}
                          <AvatarFallback className="bg-transparent p-0"><DefaultAvatarImg flagged={isEntryBad} /></AvatarFallback>
                        </Avatar>
                      </Link>
                      {!isSubject && <div className="mt-1.5 w-px flex-1 bg-slate-200 dark:bg-slate-700" aria-hidden />}
                    </div>

                    {/* Content, tinted for weak-link / flagged; pb creates the rail gap. */}
                    <div className={`min-w-0 flex-1 ${isSubject ? "" : "pb-4"}`}>
                      <div className={`rounded-xl px-2.5 py-1.5 transition-colors ${tint}`}>
                        <div className="flex items-start justify-between gap-2">
                          <Link href={`/p/${npub}`} className="group min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate group-hover:text-brand-deep transition-colors">{name}</span>
                              {isWeakLink && (
                                <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-amber-100 dark:bg-amber-500/20 border border-amber-300 dark:border-amber-500/30 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300" data-testid={`hops-weaklink-${i}`} title="The trusted account whose follow let a low-trust account into your network">
                                  Weak link
                                </span>
                              )}
                              {isEntryBad && (
                                <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-rose-100 dark:bg-rose-500/20 border border-rose-300 dark:border-rose-500/30 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700 dark:text-rose-300" data-testid={`hops-flagged-${i}`} title="Scored low in your network — reporting it disconnects it and anything downstream. This reflects its score, not an existing report.">
                                  Low trust
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] uppercase tracking-wide text-slate-400 dark:text-slate-500">{roleLabel}</div>
                          </Link>
                          {!isMe && tier && (
                            <button
                              type="button"
                              onClick={() => setScoreExplainOpen(true)}
                              className={`shrink-0 min-w-[64px] rounded-lg border px-2 py-1 text-right transition-colors hover:brightness-[0.98] ${povChrome(scorePov)}`}
                              title="What does this score mean?"
                              data-testid={`hops-score-${i}`}
                            >
                              <div className={`flex items-center justify-end gap-1 text-sm font-bold tabular-nums leading-tight ${tier.text}`}>
                                <PovIcon pov={scorePov} className="h-2.5 w-2.5" />
                                {Math.round((score as number) * 100)}%
                              </div>
                              <div className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">{tier.name}</div>
                              {(() => {
                                // Subtle hint when the OTHER view disagrees (after
                                // rounding): its number + which way it moves.
                                const both = scoresQuery.data?.get(pk);
                                const other = scorePov === "personalized" ? both?.house : both?.mine;
                                if (typeof other !== "number") return null;
                                const shownPct = Math.round((score as number) * 100);
                                const otherPct = Math.round(other * 100);
                                if (otherPct === shownPct) return null;
                                const mine = scorePov === "global";
                                return (
                                  <div
                                    className={`mt-0.5 flex items-center justify-end gap-0.5 text-[9px] font-semibold tabular-nums leading-tight ${mine ? "text-brand-primary" : "text-slate-400 dark:text-slate-500"}`}
                                    data-testid={`hops-score-delta-${i}`}
                                  >
                                    <PovIcon pov={mine ? "personalized" : "global"} className="h-2 w-2" />
                                    {otherPct > shownPct ? "▲" : "▼"} {otherPct} {mine ? "for you" : "everyone"}
                                  </div>
                                );
                              })()}
                            </button>
                          )}
                        </div>

                        {!isMe && (
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <NodeFollow pubkey={pk} name={name} alreadyFollowing={myFollows?.has(pk) ?? false} />
                            <NodeReport pubkey={pk} name={name} emphasize={isEntryBad} />
                          </div>
                        )}

                        {/* Weak-link explanation — unlocked in place. */}
                        {isWeakLink && <WeakLinkNote scammerName={nameAt(entryBadIndex)} />}
                        {isEntryBad && youFollowBadDirectly && <DirectFollowNote name={name} />}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => setNonce((n) => n + 1)}
                disabled={d.pathCount <= 1 || pathQuery.isFetching}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3.5 h-10 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                data-testid="hops-shuffle"
              >
                {pathQuery.isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shuffle className="h-4 w-4" />}
                Show another path
              </button>
              {d.pathCount <= 1 && <span className="text-xs text-slate-400 dark:text-slate-500">This is the only shortest path.</span>}
            </div>
          </>
        )}

        {/* What the metric means + the practical use. */}
        <div className="mt-8 rounded-2xl border border-slate-100 dark:border-slate-800/60 bg-slate-50 dark:bg-slate-900 p-4 sm:p-5 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
          <div className="flex items-center gap-2 font-semibold text-slate-800 dark:text-slate-200">
            <ShieldAlert className="h-4 w-4 text-brand-accent" /> What "degree" means
          </div>
          <p className="mt-1.5">
            Your degree shows how closely you're connected to someone.{" "}
            <span className="font-medium text-slate-700 dark:text-slate-200">1st degree</span> means you follow them directly.{" "}
            <span className="font-medium text-slate-700 dark:text-slate-200">2nd degree</span> means someone you follow, follows them — and so on.
            Being connected, even a few steps out, means they're part of your trusted network.
          </p>
          <p className="mt-2">
            It's also a safety tool. Scam accounts usually get into your network because{" "}
            <span className="font-medium text-slate-700 dark:text-slate-200">one person you trust followed them</span> — often by mistake. That
            person is the <span className="font-medium text-slate-700 dark:text-slate-200">weak link</span>. Report the scam account itself and it —
            plus everything hiding behind it — drops out of your network.
          </p>
        </div>
      </main>
      <TrustScoreModal open={scoreExplainOpen} onOpenChange={setScoreExplainOpen} />
    </div>
  );
}

/**
 * The weak-link explanation, revealed INSIDE the weak-link card (progressive
 * disclosure) instead of a banner at the top. Names the flagged account the
 * trusted connector followed and steers the report to it.
 */
function WeakLinkNote({ scammerName }: { scammerName: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-3 border-t border-amber-200/70 dark:border-amber-500/25 pt-2.5">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-amber-700 dark:text-amber-300 hover:text-amber-800 dark:hover:text-amber-200 transition-colors"
        data-testid="hops-weaklink-why"
      >
        <ShieldAlert className="h-3.5 w-3.5" />
        Why this is the weak link
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <p className="mt-2 text-[12.5px] leading-relaxed text-amber-900 dark:text-amber-200/90" data-testid="hops-weaklink-detail">
          This is an account you trust, but it follows <span className="font-semibold">{scammerName}</span> — a low-trust
          account. Likely an honest mistake, but it's how {scammerName} got into your network.{" "}
          <span className="font-semibold">Report {scammerName}</span> below to remove it — and anything hiding behind it —
          from your network.
        </p>
      )}
    </div>
  );
}

/**
 * Shown on the flagged card when YOU follow it directly — there's no intermediate
 * connector, so the follow-decision was yours.
 */
function DirectFollowNote({ name }: { name: string }) {
  return (
    <div className="mt-3 border-t border-rose-200/70 dark:border-rose-500/25 pt-2.5">
      <p className="flex items-start gap-1.5 text-[12.5px] leading-relaxed text-rose-800 dark:text-rose-300">
        <ShieldAlert className="h-3.5 w-3.5 shrink-0 mt-0.5" />
        <span>
          You follow <span className="font-semibold">{name}</span> directly — this low-trust account is in your network
          through your own follow. Review it, and if it's a scammer, report it (or unfollow) to cut it off.
        </span>
      </p>
    </div>
  );
}

/**
 * The positive per-node action: follow a connector you discovered on the path, or
 * a quiet "Following" indicator if you already do (unfollow lives on the profile,
 * to avoid an accidental one-tap unfollow here). Click-through preserved.
 */
function NodeFollow({ pubkey, name, alreadyFollowing }: { pubkey: string; name: string; alreadyFollowing: boolean }) {
  const { toast } = useToast();
  const [justFollowed, setJustFollowed] = useState(false);
  const [busy, setBusy] = useState(false);
  const following = justFollowed || alreadyFollowing;

  const follow = async (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setBusy(true);
    const res = await followUser(pubkey);
    setBusy(false);
    if (res.success) {
      setJustFollowed(true);
      toast({ title: `Following ${name}` });
    } else {
      toast({ variant: "destructive", title: "Couldn't follow", description: res.error || "Try again." });
    }
  };

  if (following) {
    return (
      <span className="shrink-0 inline-flex items-center gap-1 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 px-2 py-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400" data-testid="hops-following">
        <Check className="h-3 w-3 text-emerald-500" /> Following
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={follow}
      disabled={busy}
      className="shrink-0 inline-flex items-center gap-1 rounded-md border border-brand-accent/40 bg-white dark:bg-slate-900 px-2 py-1 text-[11px] font-semibold text-brand-deep hover:bg-brand-accent/[0.06] disabled:opacity-50 transition-colors"
      data-testid="hops-follow"
    >
      {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <UserPlus className="h-3 w-3" />} Follow
    </button>
  );
}

/**
 * Inline report control for a path node — the payoff of the whole page: report the
 * weak-link account (NIP-56 kind 1984) to drive its score down and disconnect the
 * swarm downstream of it. Click-through to the profile is preserved because these
 * buttons stopPropagation. `emphasize` styles it for the flagged weak link.
 */
function NodeReport({ pubkey, name, emphasize }: { pubkey: string; name: string; emphasize?: boolean }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (reason: string) => {
    setBusy(true);
    const res = await reportUser(pubkey, reason);
    setBusy(false);
    setOpen(false);
    if (res.success) {
      setDone(true);
      toast({ title: `Reported ${name}`, description: "Their score drops in your network — so does anyone whose standing came only through them." });
    } else {
      toast({ variant: "destructive", title: "Couldn't report", description: res.error || "Try again." });
    }
  };

  const stop = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  if (done) {
    return (
      <span className="shrink-0 inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
        <Flag className="h-3 w-3" /> Reported
      </span>
    );
  }

  if (open) {
    return (
      <div className="flex flex-wrap items-center gap-1">
        {["spam", "impersonation", "other"].map((r) => (
          <button
            key={r}
            type="button"
            onClick={(e) => { stop(e); void submit(r); }}
            disabled={busy}
            className="rounded-md border border-amber-300 dark:border-amber-500/40 bg-white dark:bg-amber-500/10 px-2 py-1 text-[11px] font-semibold capitalize text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-500/20 disabled:opacity-50"
          >
            {r}
          </button>
        ))}
        <button type="button" onClick={(e) => { stop(e); setOpen(false); }} className="px-1 text-[11px] text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300" aria-label="Cancel">✕</button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={(e) => { stop(e); setOpen(true); }}
      className={`shrink-0 inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-semibold transition-colors ${
        emphasize
          ? "border-amber-300 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-500/20"
          : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 hover:border-amber-300 hover:text-amber-700 dark:hover:border-amber-500/40 dark:hover:text-amber-300"
      }`}
      data-testid="hops-report"
    >
      <Flag className="h-3 w-3" /> Report
    </button>
  );
}
