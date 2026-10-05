import { useMemo, useState, type MouseEvent } from "react";
import { PublicPageHeader } from "@/components/PublicPageHeader";
import { useMyFollows } from "@/hooks/useMyFollows";
import { useLiveProfiles } from "@/hooks/useLiveProfile";
import { useScoreDisplayMode } from "@/hooks/useScoreDisplayMode";
import { useTierRing } from "@/components/score/VerificationCoin";
import { useHopsOrigin } from "@/hooks/useHopsOrigin";
import { useRoute, Redirect, Link } from "wouter";
import { useGoBack } from "@/hooks/useGoBack";
import { useQuery } from "@tanstack/react-query";
import { Loader2, ShieldAlert, Flag, UserPlus, Check, ChevronDown } from "lucide-react";
import { decodeShareId, npubFromPubkey } from "@/lib/shareId";
import { useLiveProfile } from "@/hooks/useLiveProfile";
import { useActiveAccountDisplay } from "@/hooks/useActiveAccountDisplay";
import { reportUser, followUser } from "@/services/socialActions";
import { useToast } from "@/hooks/use-toast";
import { apiClient } from "@/services/api";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { DefaultAvatarImg } from "@/components/share/DefaultAvatarImg";
import { ordinal } from "@/components/DegreeChip";
import { shareTierFor } from "@/components/share/TrustScoreBadge";
import { useTierGranularity } from "@/hooks/useTierGranularity";
import { TrustScoreModal, PovIcon, povChrome, useScorePov } from "@/components/score/TrustScorePov";
import { useHasSession } from "@/hooks/useHasSession";
import { usePathNetwork } from "@/hooks/usePathNetwork";
import { useAuthorScores } from "@/hooks/useAuthorScores";
import { useAuthorFlags } from "@/hooks/useAuthorFlags";
import {
  firstRiskyIndex,
  networkJudged,
  nodeRisk,
  pathAt,
  riskyAccounts,
  type RiskKind,
  type RiskSignals,
} from "@/lib/hopsPaths";
import { PathChecking, PathRiskLine, PathStepper } from "@/components/hops/PathSummary";
import { Chip } from "@/components/ui/chip";

/** Signals that judge nothing, so the order falls back to pubkey. */
const UNJUDGED: RiskSignals = { flaggedOf: () => false, scoreOf: () => 1 };

function shortNpub(npub: string): string {
  return `${npub.slice(0, 10)}…${npub.slice(-4)}`;
}

/**
 * The Connection page (`/p/:id/hops`): explains the degree metric and walks
 * the shortest follow-paths from the origin (you, or Brainstorm) to this
 * profile. The safest path leads and a stepper walks every path in a fixed
 * order; the risk lines name the flagged and unverified accounts and step
 * through them (hooks/usePathSet fetches the Path network, lib/hopsPaths
 * judges and orders it). Each node links to that person's profile — the core use case
 * being to spot the one weak-link account to report so a whole swarm
 * downstream of it drops out of your trust network.
 */
export default function HopsPathPage() {
  const [displayMode] = useScoreDisplayMode();
  const [granularity] = useTierGranularity();
  const tierRing = useTierRing();
  const goBack = useGoBack();
  const [, params] = useRoute("/p/:id/hops");
  const rawId = params?.id || "";
  const decoded = useMemo(() => decodeShareId(rawId), [rawId]);
  const relayHints = decoded?.relays || [];

  const me = useActiveAccountDisplay();
  const myPubkey = me?.pubkey || "";
  // The path ORIGIN follows the perspective toggle — the viewer under
  // personalized (when usable), House otherwise, logged out included. The
  // VIEWER (`myPubkey`) still owns the follow-ticks and the action buttons;
  // conflating the two would show Brainstorm's follows as yours.
  const { origin, originPov, loading: originLoading } = useHopsOrigin();
  const fromPubkey = origin || "";
  const toPubkey = decoded?.pubkey || "";
  const signedIn = useHasSession();
  // No signed-in or calc gate any more: the origin hook already resolved a
  // usable start (falling back to House), and the endpoint is public.
  const eligible = !!fromPubkey && !!toPubkey && fromPubkey !== toPubkey;

  // Which risk group the reader narrowed to, and where they are. Keyed to
  // from/to: the page stays mounted across targets, so a stale pick resets.
  const networkKey = `${fromPubkey}/${toPubkey}`;
  const [picked, setPicked] = useState<{ of: string; group: RiskKind | null; pos: number }>({
    of: networkKey,
    group: null,
    pos: 0,
  });
  const pick = picked.of === networkKey ? picked : { group: null, pos: 0 };
  const choose = (group: RiskKind | null, pos: number) => setPicked({ of: networkKey, group, pos });
  // Sitewide score-POV (personalized vs global) + the shared explainer modal.
  const { pov: scorePov } = useScorePov();
  const [scoreExplainOpen, setScoreExplainOpen] = useState(false);

  const { network, tooLarge, hops: hopsOnly, isPending } = usePathNetwork(fromPubkey, toPubkey, { enabled: eligible });
  const reach = tooLarge ? hopsOnly : network;

  const connectors = useMemo(() => network?.layers.flat() ?? [], [network]);
  // Every account the card can show, fetched once per network so stepping asks for nothing.
  const accounts = useMemo(() => (network ? [network.from, ...connectors, network.to] : []), [network, connectors]);
  const scoreOf = useAuthorScores(accounts);
  const flaggedOf = useAuthorFlags(connectors);
  // Not memoised on the hook closures — that would freeze the page at "checking".
  const signals = { flaggedOf, scoreOf };
  const judged = !!network && networkJudged(network, signals);
  // Until every connector is judged the card stays unmarked, in pubkey order.
  const marks = judged ? signals : UNJUDGED;
  const total = network?.pathCount ?? 0;
  const riskGroups =
    network && judged
      ? {
          flagged: riskyAccounts(network, "flagged", signals),
          unverified: riskyAccounts(network, "unverified", signals),
        }
      : null;
  const narrowed = pick.group && riskGroups?.[pick.group].accounts.length ? riskGroups[pick.group].accounts : null;
  const steps = narrowed ? narrowed.length : total;
  const pos = steps ? pick.pos % steps : 0;
  const focus = narrowed ? narrowed[pos].pubkey : null;
  // Rebuilt only when the network, a verdict or the position changes.
  const verdicts = connectors.map((pk) => `${flaggedOf(pk)}:${scoreOf(pk)}`).join();
  const shown: string[] = useMemo(
    () => (network ? (pathAt(network, marks, focus ? 0 : pos, focus ?? undefined) ?? []) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [network, judged, verdicts, pos, focus],
  );
  const stepTo = (next: number) => choose(pick.group, (next + steps) % steps);
  // "…through 1 person, 130 different ways." — the count rides on the sentence.
  const ways =
    !tooLarge && total > 1 ? (
      <>
        , <span className="font-semibold">{total.toLocaleString()}</span> different ways.
      </>
    ) : (
      "."
    );

  const subject = useLiveProfile(toPubkey, relayHints).profile;

  const profileMap = useLiveProfiles(accounts);

  // Your own scores for the same accounts, in one batch; the house's come from useAuthorScores.
  const myScoresQuery = useQuery({
    queryKey: ["hops-my-scores", myPubkey, accounts],
    queryFn: () => apiClient.getMyTrustSignals(accounts),
    enabled: signedIn && accounts.length > 0,
    staleTime: 5 * 60_000,
    retry: false,
  });
  const scoresOf = (pk: string) => {
    const house = scoreOf(pk);
    return { mine: myScoresQuery.data?.get(pk)?.influence ?? null, house: typeof house === "number" ? house : null };
  };
  // The ACTIVE view's number per node (drives tiers + the weak-link pick).
  const activeScore = (pk: string) => {
    const both = scoresOf(pk);
    return scorePov === "personalized" ? (both.mine ?? both.house) : both.house;
  };

  // My own follow list once → know which path nodes I already follow.
  // The LOGGED-IN viewer's follows, never the path origin's — under House the
  // origin is Brainstorm, and its follows must not render as your ticks.
  const viewerFollows = useMyFollows();

  // replace, not push — see ConnectionListPage. These guards fire on the first
  // render before params/auth resolve, and a pushed entry poisons the back stack.
  // Same as ConnectionListPage: an unresolved route is not an invalid one.
  if (!rawId) return null;
  if (!toPubkey) return <Redirect to="/" replace />;
  // An unresolved ORIGIN is not an invalid one either — the house pubkey
  // resolves async on first load, and redirecting during that beat bounced
  // every visitor back to the profile. Hold; redirect only once we know.
  if (originLoading) return null;
  if (!eligible) return <Redirect to={`/p/${rawId}`} replace />;

  const subjectName = subject?.display_name || subject?.name || shortNpub(npubFromPubkey(toPubkey));
  const profs = profileMap;
  const myFollows = signedIn && viewerFollows.signedIn && viewerFollows.ready ? viewerFollows.follows : undefined;

  // Weak link = the DECISION-MAKER, not the scammer: the last trusted account before
  // trust collapses — the node that follows the first risky connector in the
  // path. Its follow-decision is how a flagged account reached your network (Vitor:
  // "the person who decided a scammer is worth following"). We surface two roles:
  //   • weakLinkIndex — the decision-maker (authentic → usually an honest mistake).
  //   • entryBadIndex — the first flagged / unverified connector it follows: the
  //     account to REPORT, whose takedown disconnects the swarm downstream of it.
  // If YOU follow the first bad node directly, there's no intermediate decision-maker.
  // Weak-link analysis is a personalized promise ("report it and it drops out
  // of YOUR network") — under House the path is explanatory, nothing more.
  // While stepping through risky accounts, the one stepped to is the one to report.
  const focusIndex = focus ? shown.indexOf(focus) : -1;
  const entryBadIndex = originPov === "personalized" ? (focus ? focusIndex : firstRiskyIndex(shown, marks)) : -1;
  const weakLinkIndex = entryBadIndex > 1 ? entryBadIndex - 1 : -1; // -1 ⇒ it's You, or none
  const youFollowBadDirectly = entryBadIndex === 1;

  // Display name for a path node by index (subject resolves via relay-hint profile).
  const nameAt = (i: number): string => {
    const pk = shown[i];
    if (!pk) return "";
    const sp = i === shown.length - 1 ? subject : undefined;
    const pp = profs?.get(pk);
    return sp?.display_name || sp?.name || pp?.display_name || pp?.name || shortNpub(npubFromPubkey(pk));
  };

  const backLink = `/p/${rawId}`;

  return (
    <div className="min-h-page bg-gradient-to-b from-slate-50 to-white dark:from-slate-950 dark:to-slate-900">
      {/* The public pages' header — B mark, the shared search box, account — so
          search stays one tap away below a profile too, with Back pinned in it. */}
      <PublicPageHeader
        maxWidthClass="max-w-xl"
        // Pops history instead of pushing the profile again — same fix and
        // same reasoning as ConnectionListPage. `backLink` is the fallback
        // for a cold deep-link with nothing to pop.
        back={{ label: "Back", onClick: () => goBack(backLink) }}
      />

      <main className="mx-auto max-w-xl px-4 py-8 sm:px-6">
        <div className="mb-3 flex items-center gap-2.5">
          <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.25em] text-brand-accent">
            Connection
          </span>
          <div className="h-px w-10 bg-brand-accent/40" />
        </div>

        <h1
          className="text-2xl font-bold leading-tight tracking-tight text-slate-900 dark:text-slate-100 sm:text-3xl"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {originPov === "personalized" ? "Your connection to " : "Brainstorm's connection to "}
          <span className="text-brand-link">{subjectName}</span>
        </h1>

        {isPending ? (
          <div className="mt-8 flex items-center gap-2 text-slate-400 dark:text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />{" "}
            {originPov === "personalized" ? "Finding your connection…" : "Finding the connection…"}
          </div>
        ) : !reach || !reach.reachable || !reach.hops ? (
          <p className="mt-4 text-slate-600 dark:text-slate-300" data-testid="hops-unreachable">
            {reach?.hops === 0
              ? "That's you."
              : originPov === "personalized"
                ? `Not connected — ${subjectName} can't be reached through the people you follow.`
                : `Not connected — ${subjectName} can't be reached through the accounts Brainstorm follows.`}
          </p>
        ) : (
          <>
            <p
              className="mt-3 text-[15px] leading-relaxed text-slate-600 dark:text-slate-300"
              data-testid="hops-degree"
            >
              <span className="font-semibold text-slate-900 dark:text-slate-100">{ordinal(reach.hops)} degree</span> —{" "}
              {reach.hops === 1 ? (
                originPov === "personalized" ? (
                  <>you follow {subjectName} directly.</>
                ) : (
                  <>Brainstorm follows {subjectName} directly.</>
                )
              ) : originPov === "personalized" ? (
                <>
                  you're connected to {subjectName} through <span className="font-semibold">{reach.hops - 1}</span>{" "}
                  {reach.hops - 1 === 1 ? "person" : "people"}
                  {ways}
                </>
              ) : (
                <>
                  Brainstorm reaches {subjectName} through <span className="font-semibold">{reach.hops - 1}</span>{" "}
                  {reach.hops - 1 === 1 ? "person" : "people"}
                  {ways}
                </>
              )}
            </p>

            {tooLarge ? (
              <p className="mt-3 text-sm text-slate-500 dark:text-slate-400" data-testid="hops-too-large">
                This connection is too large to map right now, so the paths aren't shown.
              </p>
            ) : (
              <>
                {/* Loud only for risk: a line per kind, and only when there is one. */}
                {riskGroups &&
                  (["flagged", "unverified"] as const).map((kind) => (
                    <PathRiskLine
                      key={kind}
                      kind={kind}
                      accountCount={riskGroups[kind].accounts.length}
                      paths={riskGroups[kind].paths}
                      total={total}
                      pressed={pick.group === kind}
                      onToggle={() => choose(pick.group === kind ? null : kind, 0)}
                    />
                  ))}

                {/* The path — each node links to their profile. The weak-link explanation
                lives INSIDE the weak-link card (progressive disclosure), not up here. */}
                {/* The route — one connected timeline. A rail threads through the avatars
                so it reads as a single path (you → them), not a stack of cards. Uniform
                across mobile / desktop / PWA — no breakpoint reflow. */}
                <div className="mt-4 rounded-2xl border border-slate-100 bg-white p-3 shadow-sm dark:border-slate-800/60 dark:bg-slate-900 sm:p-4">
                  {judged && steps > 1 && (
                    <div className="-mt-1 mb-1 flex justify-end">
                      <PathStepper
                        label={narrowed ? `${pick.group === "flagged" ? "Flagged" : "Unverified"} account` : "Path"}
                        position={pos + 1}
                        total={steps}
                        onPrevious={() => stepTo(pos - 1)}
                        onNext={() => stepTo(pos + 1)}
                      />
                    </div>
                  )}
                  <ol data-testid="hops-path">
                    {shown.map((pk, i) => {
                      const p = profs?.get(pk);
                      const npub = npubFromPubkey(pk);
                      const isOrigin = i === 0;
                      const isMe = pk === myPubkey;
                      const isSubject = i === shown.length - 1;
                      // The target's kind-0 usually lives on its own relays, which the
                      // bulk profile map (fixed relay set) misses — so for the subject
                      // reuse the relay-hint-resolved profile the page title already
                      // fetched. Keeps name + avatar consistent with the header/SharePage.
                      const subj = isSubject ? subject : undefined;
                      const picture = subj?.picture || p?.picture;
                      // Node 0 under House is named by OUR copy — the fetched kind-0
                      // says "nosfabrica", which would contradict the rest of the UI.
                      const name =
                        isOrigin && originPov === "global"
                          ? "Brainstorm"
                          : subj?.display_name || subj?.name || p?.display_name || p?.name || shortNpub(npub);
                      const roleLabel = isOrigin
                        ? originPov === "personalized"
                          ? "You"
                          : "Brainstorm"
                        : isMe
                          ? "You"
                          : isSubject
                            ? "Them"
                            : "Connector";
                      const score = activeScore(pk);
                      // The network's standing of a connector — the same rule that
                      // sorted the paths. The origin and the target are never marked.
                      const risk = !isOrigin && !isSubject ? nodeRisk(pk, marks) : "verified";
                      const tier =
                        typeof score === "number" ? shareTierFor(score, granularity, risk === "flagged") : null;
                      const isWeakLink = i === weakLinkIndex; // decision-maker (authentic)
                      const isEntryBad = i === entryBadIndex; // the risky connector to report (personalized only)
                      const isFocus = i === focusIndex;
                      const tint = isWeakLink
                        ? "bg-amber-50 dark:bg-amber-500/10 ring-1 ring-amber-200 dark:ring-amber-500/25"
                        : isEntryBad || isFocus
                          ? "bg-rose-50 dark:bg-rose-500/10 ring-1 ring-rose-200 dark:ring-rose-500/25"
                          : "";
                      return (
                        <li
                          key={`${pk}-${i}`}
                          className="flex gap-3"
                          data-testid={`hops-node-${i}`}
                          data-focus={isFocus || undefined}
                        >
                          {/* Rail column: avatar sits on the thread; the line fills the rest of
                        the row height, connecting down to the next avatar. */}
                          <div className="flex shrink-0 flex-col items-center">
                            <Link href={`/p/${npub}`} className="group">
                              <Avatar
                                className={`h-10 w-10 ${tierRing(score) ?? "ring-1 ring-slate-200 dark:ring-slate-800"}`}
                              >
                                {picture ? <AvatarImage src={picture} alt="" className="object-cover" /> : null}
                                <AvatarFallback className="bg-transparent p-0">
                                  <DefaultAvatarImg flagged={risk === "flagged"} />
                                </AvatarFallback>
                              </Avatar>
                            </Link>
                            {!isSubject && (
                              <div className="mt-1.5 w-px flex-1 bg-slate-200 dark:bg-slate-700" aria-hidden />
                            )}
                          </div>

                          {/* Content, tinted for weak-link / flagged; pb creates the rail gap. */}
                          <div className={`min-w-0 flex-1 ${isSubject ? "" : "pb-4"}`}>
                            <div className={`rounded-xl px-2.5 py-1.5 transition-colors ${tint}`}>
                              <div className="flex items-start justify-between gap-2">
                                <Link href={`/p/${npub}`} className="group min-w-0">
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <span className="truncate text-sm font-semibold text-slate-800 transition-colors group-hover:text-brand-deep dark:text-slate-200">
                                      {name}
                                    </span>
                                    {isWeakLink && (
                                      <span
                                        className="inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-300 bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/20 dark:text-amber-300"
                                        data-testid={`hops-weaklink-${i}`}
                                        title="The trusted account whose follow let a low-trust account into your network"
                                      >
                                        Weak link
                                      </span>
                                    )}
                                    {risk === "flagged" && (
                                      <Chip
                                        tone="danger"
                                        size="sm"
                                        title="Flagged by the network"
                                        data-testid={`hops-flagged-${i}`}
                                      >
                                        Flagged
                                      </Chip>
                                    )}
                                    {risk === "unverified" && (
                                      <Chip
                                        tone="warning"
                                        size="sm"
                                        title="Not yet verified by the network"
                                        data-testid={`hops-unverified-${i}`}
                                      >
                                        Unverified
                                      </Chip>
                                    )}
                                  </div>
                                  <div className="text-[11px] uppercase tracking-wide text-slate-400 dark:text-slate-500">
                                    {roleLabel}
                                  </div>
                                </Link>
                                {/* Off means off — no score chip at all, same as the
                              coin everywhere else. The path itself stays: degree
                              is connection distance, not a verification score. */}
                                {displayMode !== "off" && !isOrigin && tier && (
                                  <button
                                    type="button"
                                    onClick={() => setScoreExplainOpen(true)}
                                    className={`min-w-[64px] shrink-0 rounded-lg border px-2 py-1 text-right transition-colors hover:brightness-[0.98] ${povChrome(scorePov)}`}
                                    title="What does this score mean?"
                                    data-testid={`hops-score-${i}`}
                                  >
                                    {displayMode === "number" ? (
                                      <>
                                        <div
                                          className={`flex items-center justify-end gap-1 text-sm font-bold tabular-nums leading-tight ${tier.text}`}
                                        >
                                          <PovIcon pov={scorePov} className="h-2.5 w-2.5" />
                                          {`${Math.round((score as number) * 100)}%`}
                                        </div>
                                        <div className="text-[10px] leading-tight text-slate-500 dark:text-slate-400">
                                          {tier.name}
                                        </div>
                                      </>
                                    ) : (
                                      // No digits, no two-storey layout: one line, the
                                      // word in the tier's own color.
                                      <div
                                        className="flex items-center justify-end gap-1.5 text-xs font-semibold leading-tight"
                                        style={{ color: tier.color }}
                                      >
                                        <PovIcon pov={scorePov} className="h-2.5 w-2.5" />
                                        {tier.name}
                                      </div>
                                    )}
                                    {(() => {
                                      // Subtle hint when the OTHER view disagrees (after
                                      // rounding): its number + which way it moves.
                                      const both = scoresOf(pk);
                                      const other = scorePov === "personalized" ? both?.house : both?.mine;
                                      if (typeof other !== "number") return null;
                                      if (displayMode !== "number") return null;
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

                              {/* Follow is meaningful in both modes for signed-in viewers;
                            Report belongs to the personalized promise only. */}
                              {!isOrigin && !isMe && signedIn && (
                                <div className="mt-2 flex flex-wrap items-center gap-2">
                                  <NodeFollow pubkey={pk} name={name} alreadyFollowing={myFollows?.has(pk) ?? false} />
                                  {originPov === "personalized" && (
                                    <NodeReport pubkey={pk} name={name} emphasize={isEntryBad} />
                                  )}
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
                </div>
                {!judged && <PathChecking />}
              </>
            )}
          </>
        )}

        {/* What the metric means + the practical use. */}
        <div className="mt-8 rounded-2xl border border-slate-100 bg-slate-50 p-4 text-sm leading-relaxed text-slate-600 dark:border-slate-800/60 dark:bg-slate-900 dark:text-slate-300 sm:p-5">
          <div className="flex items-center gap-2 font-semibold text-slate-800 dark:text-slate-200">
            <ShieldAlert className="h-4 w-4 text-brand-accent" /> What "degree" means
          </div>
          {originPov === "personalized" ? (
            <>
              <p className="mt-1.5">
                Your degree shows how closely you're connected to someone.{" "}
                <span className="font-medium text-slate-700 dark:text-slate-200">1st degree</span> means you follow them
                directly. <span className="font-medium text-slate-700 dark:text-slate-200">2nd degree</span> means
                someone you follow, follows them — and so on. Being connected, even a few steps out, means they're part
                of your trusted network.
              </p>
              <p className="mt-2">
                It's also a safety tool. Scam accounts usually get into your network because{" "}
                <span className="font-medium text-slate-700 dark:text-slate-200">
                  one person you trust followed them
                </span>{" "}
                — often by mistake. That person is the{" "}
                <span className="font-medium text-slate-700 dark:text-slate-200">weak link</span>. Report the scam
                account itself and it — plus everything hiding behind it — drops out of your network.
              </p>
            </>
          ) : (
            <p className="mt-1.5">
              The degree shows how closely Brainstorm's network reaches someone.{" "}
              <span className="font-medium text-slate-700 dark:text-slate-200">1st degree</span> means Brainstorm
              follows them directly. <span className="font-medium text-slate-700 dark:text-slate-200">2nd degree</span>{" "}
              means someone Brainstorm follows, follows them — and so on. Sign in and run your own calculation to
              measure this from your account instead.
            </p>
          )}
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
    <div className="mt-3 border-t border-amber-200/70 pt-2.5 dark:border-amber-500/25">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-amber-700 transition-colors hover:text-amber-800 dark:text-amber-300 dark:hover:text-amber-200"
        data-testid="hops-weaklink-why"
      >
        <ShieldAlert className="h-3.5 w-3.5" />
        Why this is the weak link
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <p
          className="mt-2 text-[12.5px] leading-relaxed text-amber-900 dark:text-amber-200/90"
          data-testid="hops-weaklink-detail"
        >
          This is an account you trust, but it follows <span className="font-semibold">{scammerName}</span> — a
          low-trust account. Likely an honest mistake, but it's how {scammerName} got into your network.{" "}
          <span className="font-semibold">Report {scammerName}</span> below to remove it — and anything hiding behind it
          — from your network.
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
    <div className="mt-3 border-t border-rose-200/70 pt-2.5 dark:border-rose-500/25">
      <p className="flex items-start gap-1.5 text-[12.5px] leading-relaxed text-rose-800 dark:text-rose-300">
        <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
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
    if (res.cancelled) return;
    if (res.success) {
      setJustFollowed(true);
      toast({ title: `Following ${name}` });
    } else {
      toast({ variant: "destructive", title: "Couldn't follow", description: res.error || "Try again." });
    }
  };

  if (following) {
    return (
      <span
        className="inline-flex shrink-0 items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400"
        data-testid="hops-following"
      >
        <Check className="h-3 w-3 text-emerald-500" /> Following
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={follow}
      disabled={busy}
      className="inline-flex shrink-0 items-center gap-1 rounded-md border border-brand-accent/40 bg-white px-2 py-1 text-[11px] font-semibold text-brand-deep transition-colors hover:bg-brand-accent/[0.06] disabled:opacity-50 dark:bg-slate-900"
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
    if (res.cancelled) return;
    if (res.success) {
      setDone(true);
      toast({
        title: `Reported ${name}`,
        description: "Their score drops in your network — so does anyone whose standing came only through them.",
      });
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
      <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
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
            onClick={(e) => {
              stop(e);
              void submit(r);
            }}
            disabled={busy}
            className="rounded-md border border-amber-300 bg-white px-2 py-1 text-[11px] font-semibold capitalize text-amber-700 hover:bg-amber-50 disabled:opacity-50 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300 dark:hover:bg-amber-500/20"
          >
            {r}
          </button>
        ))}
        <button
          type="button"
          onClick={(e) => {
            stop(e);
            setOpen(false);
          }}
          className="px-1 text-[11px] text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
          aria-label="Cancel"
        >
          ✕
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        stop(e);
        setOpen(true);
      }}
      className={`inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-semibold transition-colors ${
        emphasize
          ? "border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300 dark:hover:bg-amber-500/20"
          : "border-slate-200 bg-white text-slate-500 hover:border-amber-300 hover:text-amber-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:border-amber-500/40 dark:hover:text-amber-300"
      }`}
      data-testid="hops-report"
    >
      <Flag className="h-3 w-3" /> Report
    </button>
  );
}
