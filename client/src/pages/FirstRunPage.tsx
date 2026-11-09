import { useEffect, useRef, useState, type ComponentType } from "react";
import { useLocation } from "wouter";
import {
  ArrowLeft,
  ArrowRight,
  Bitcoin,
  Briefcase,
  Camera,
  Check,
  Cpu,
  FlaskConical,
  Gamepad2,
  HeartPulse,
  Loader2,
  Music,
  Newspaper,
  Palette,
  Trophy,
  Users,
} from "lucide-react";
import { BrainLogo } from "@/components/BrainLogo";
import { ConfirmNewFollowListDialog } from "@/components/ConfirmNewFollowListDialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useActiveAccountDisplay } from "@/hooks/useActiveAccountDisplay";
import { useOnboardingPeople } from "@/hooks/useOnboardingPeople";
import { useToast } from "@/hooks/use-toast";
import { markFirstRunDone } from "@/lib/firstRun";
import { knownFollowCount } from "@/lib/followStore";
import { recordNip85Consent } from "@/lib/nip85Consent";
import { PRESELECTED_PER_TOPIC, type SuggestedPerson } from "@/lib/onboardingPeople";
import { ONBOARDING_TOPICS, type OnboardingTopicKey } from "@/lib/onboardingTopics";
import { cn } from "@/lib/utils";
import { followPubkeys, recoverFollowListFromRelay, type FollowOptions } from "@/services/socialActions";
import { triggerScoringAndAnchor } from "@/services/trustAnchor";

const TOPIC_ICONS: Record<OnboardingTopicKey, ComponentType<{ className?: string }>> = {
  news: Newspaper,
  music: Music,
  sports: Trophy,
  tech: Cpu,
  art: Palette,
  photo: Camera,
  science: FlaskConical,
  health: HeartPulse,
  games: Gamepad2,
  business: Briefcase,
  bitcoin: Bitcoin,
};

type Step = "topics" | "people" | "found" | "done";

/** Where finishing lands: a threaded ?next=, else search. */
function nextPath(): string {
  try {
    const n = new URLSearchParams(window.location.search).get("next");
    if (n && n.startsWith("/") && !n.startsWith("//") && n !== "/login" && n !== "/start") return n;
  } catch {
    /* ignore */
  }
  return "/";
}

/**
 * The first run (/start): one question per screen, then search.
 *
 *   What are you into? → Follow people → You're all set.
 *
 * Each topic suggests trusted people (lib/onboardingPeople), its top three
 * ticked; dropping the topic drops them. A key that already follows people
 * skips to "your network is ready". The last screen asks whether other apps
 * may use their trust scores — on by default; for an account made here the
 * declaration then goes out by itself, and an extension asks once. Finishing
 * publishes one follow list (services/socialActions, merged into any they
 * have) and starts their scores; search works while those calculate.
 * Skipping publishes nothing. Either way the first run isn't offered again
 * (lib/firstRun). Decided 2026-11-08: plain words, nothing about the
 * protocol — the Assistant's own setup happens out of sight.
 */
export default function FirstRunPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const user = useActiveAccountDisplay();
  const pubkey = user?.pubkey;

  useEffect(() => {
    if (!user) navigate("/login", { replace: true });
  }, [user, navigate]);

  // A key that already follows people has a network: nothing to rebuild.
  const [followCount] = useState(() => (pubkey ? knownFollowCount(pubkey) : 0));
  const returning = followCount > 0;
  const steps: Step[] = returning ? ["found", "done"] : ["topics", "people", "done"];
  const [index, setIndex] = useState(0);
  const step = steps[index];

  const [picked, setPicked] = useState<OnboardingTopicKey[]>([]);
  const [following, setFollowing] = useState<Set<string>>(new Set());
  const [share, setShare] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [confirmPks, setConfirmPks] = useState<string[] | null>(null);
  const confirmPksRef = useRef<string[] | null>(null);
  confirmPksRef.current = confirmPks;
  const { byTopic, loading } = useOnboardingPeople(picked);

  // Each topic's top three are ticked the moment its people arrive, once per pick.
  const preselected = useRef(new Set<string>());
  useEffect(() => {
    const fresh = picked.filter((t) => byTopic[t] && !preselected.current.has(t));
    if (!fresh.length) return;
    fresh.forEach((t) => preselected.current.add(t));
    setFollowing((f) => {
      const n = new Set(f);
      fresh.forEach((t) => byTopic[t].slice(0, PRESELECTED_PER_TOPIC).forEach((p) => n.add(p.pubkey)));
      return n;
    });
  }, [picked, byTopic]);

  const toggleTopic = (key: OnboardingTopicKey) => {
    if (!picked.includes(key)) {
      setPicked((p) => (p.includes(key) ? p : [...p, key]));
      return;
    }
    // Dropping a topic drops its people, unless another picked topic has them.
    const rest = picked.filter((t) => t !== key);
    const kept = new Set(rest.flatMap((t) => (byTopic[t] ?? []).map((p) => p.pubkey)));
    preselected.current.delete(key);
    setPicked(rest);
    setFollowing((f) => {
      const n = new Set(f);
      (byTopic[key] ?? []).forEach((p) => !kept.has(p.pubkey) && n.delete(p.pubkey));
      return n;
    });
  };

  const toggleFollow = (pk: string) =>
    setFollowing((f) => {
      const n = new Set(f);
      if (n.has(pk)) n.delete(pk);
      else n.add(pk);
      return n;
    });

  // Each person once, under the first picked topic that suggests them.
  const people: Array<{ person: SuggestedPerson; topic: string }> = [];
  const seen = new Set<string>();
  for (const t of picked) {
    for (const person of byTopic[t] ?? []) {
      if (seen.has(person.pubkey)) continue;
      seen.add(person.pubkey);
      people.push({ person, topic: ONBOARDING_TOPICS.find((x) => x.key === t)?.label ?? "" });
    }
  }

  const leave = () => {
    markFirstRunDone(pubkey);
    navigate(nextPath(), { replace: true });
  };

  // Their network is in (or they kept the one they had): start their scores
  // with the sharing choice, and go to search while they calculate.
  const finishWith = (published: boolean) => {
    if (pubkey) {
      if (published || returning) void triggerScoringAndAnchor(pubkey, { nip85Consent: share }).catch(() => {});
      else recordNip85Consent(pubkey, share);
    }
    if (published) {
      toast({ title: "You're all set", description: "Your trust scores are calculating — search works right away." });
    }
    leave();
  };

  const commitFollows = async (pks: string[], opts?: FollowOptions) => {
    setSubmitting(true);
    const res = await followPubkeys(pks, opts);
    setSubmitting(false);
    if (res.cancelled) return;
    if (res.needsBaseConfirmation) {
      setConfirmPks(pks);
      return;
    }
    if (!res.success) {
      toast({
        variant: "destructive",
        title: "Couldn't save your follows",
        description: res.error || "Please try again.",
      });
      return;
    }
    finishWith(true);
  };

  const searchRelay = async (url: string) => {
    if (!pubkey) return { found: false as const, error: "Not signed in" };
    const res = await recoverFollowListFromRelay(pubkey, url);
    if (res.found) {
      const pks = confirmPksRef.current;
      setConfirmPks(null);
      if (pks) void commitFollows(pks, { cachedBase: res.event });
    }
    return res;
  };

  const onNext = () => {
    if (step !== "done") return setIndex((i) => i + 1);
    if (submitting) return;
    if (!returning && following.size > 0) void commitFollows([...following]);
    else finishWith(false);
  };

  const nextLabel =
    step === "done"
      ? "Start searching"
      : step === "people"
        ? following.size > 0
          ? `Follow ${following.size} and continue`
          : "Continue without following"
        : "Continue";

  if (!user) return null;

  return (
    <div className="flex min-h-page flex-col bg-white dark:bg-slate-950" data-testid="page-first-run">
      <header className="flex items-center justify-between px-6 py-5">
        <BrainLogo size={28} />
        <div className="flex items-center gap-1.5" aria-hidden="true">
          {steps.map((s, i) => (
            <span
              key={s}
              className={cn(
                "h-1.5 rounded-full transition-all",
                i <= index ? "w-8 bg-brand-primary" : "w-4 bg-slate-200 dark:bg-slate-800",
              )}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={leave}
          className="text-sm font-medium text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
          data-testid="first-run-skip"
        >
          Skip
        </button>
      </header>

      <main className="mx-auto w-full max-w-xl flex-1 px-6 pb-36 pt-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-accent">
          Step {index + 1} of {steps.length}
        </p>

        {step === "topics" && (
          <>
            <Title>What are you into?</Title>
            <Lead>Pick a few. We'll suggest people worth following.</Lead>
            <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {ONBOARDING_TOPICS.map((t) => {
                const on = picked.includes(t.key);
                const Icon = TOPIC_ICONS[t.key];
                return (
                  <button
                    key={t.key}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleTopic(t.key)}
                    className={cn(
                      "flex items-center gap-2.5 rounded-xl border px-4 py-3.5 text-left text-sm font-semibold transition-all",
                      on
                        ? "border-brand-primary bg-brand-primary/[0.06] text-brand-primary ring-1 ring-brand-primary dark:text-brand-link"
                        : "border-slate-200 text-slate-700 hover:border-slate-300 dark:border-slate-800 dark:text-slate-200",
                    )}
                    data-testid={`first-run-topic-${t.key}`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {t.label}
                    {on && <Check className="ml-auto h-4 w-4 shrink-0" />}
                  </button>
                );
              })}
            </div>
          </>
        )}

        {step === "people" && (
          <>
            <Title>Follow people you'll trust.</Title>
            <Lead>Ranked by Brainstorm's web of trust. Your search gets better with every follow.</Lead>
            <ul className="mt-8 divide-y divide-slate-100 dark:divide-slate-800">
              {people.map(({ person, topic }) => {
                const on = following.has(person.pubkey);
                return (
                  <li key={person.pubkey}>
                    <button
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggleFollow(person.pubkey)}
                      className="flex w-full items-center gap-3 py-3 text-left"
                    >
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={person.picture} alt="" />
                        <AvatarFallback>{person.name.slice(0, 1).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold text-slate-900 dark:text-slate-100">
                          {person.name}
                        </span>
                        <span className="block truncate text-xs text-slate-400">{topic}</span>
                      </span>
                      <span
                        className={cn(
                          "shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold",
                          on
                            ? "bg-brand-primary text-white"
                            : "border border-slate-300 text-slate-700 dark:border-slate-700 dark:text-slate-200",
                        )}
                      >
                        {on ? "Following" : "Follow"}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {loading && (
              <p className="mt-4 flex items-center gap-2 text-sm text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin" /> Finding people…
              </p>
            )}
          </>
        )}

        {step === "found" && (
          <>
            <Title>Your network is ready.</Title>
            <Lead>
              <span data-testid="first-run-found">
                We found the <b className="text-slate-900 dark:text-slate-100">{followCount.toLocaleString()} people</b>{" "}
                you already follow.
              </span>{" "}
              Brainstorm ranks your search through them — nothing to rebuild.
            </Lead>
            <div className="mt-8 flex items-center gap-3 rounded-2xl bg-slate-50 p-5 dark:bg-slate-900">
              <Users className="h-6 w-6 shrink-0 text-brand-primary" />
              <span className="text-sm text-slate-600 dark:text-slate-300">
                Your trust scores will be calculated in the background.
              </span>
            </div>
          </>
        )}

        {step === "done" && (
          <>
            <Title>You're all set.</Title>
            <Lead>
              {returning
                ? "One last choice, then straight to search."
                : following.size > 0
                  ? `You'll follow ${following.size} people. Your trust scores calculate in the background — search works right away.`
                  : "Search works right away. Follow people anytime to make it yours."}
            </Lead>
            <label className="mt-8 flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-4 dark:border-slate-800">
              <input
                type="checkbox"
                checked={share}
                onChange={(e) => setShare(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-brand-primary"
                aria-describedby="first-run-share-detail"
              />
              <span>
                <span className="block text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Let other apps use my trust scores
                </span>
                <span
                  id="first-run-share-detail"
                  className="mt-0.5 block text-[13px] text-slate-500 dark:text-slate-400"
                >
                  Apps you use can rank and filter by the people you trust. You can turn this off anytime in Settings.
                </span>
              </span>
            </label>
          </>
        )}
      </main>

      <footer className="fixed inset-x-0 bottom-0 border-t border-slate-100 bg-white/90 px-6 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))] backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
        <div className="mx-auto flex max-w-xl items-center gap-3">
          {index > 0 && (
            <button
              type="button"
              onClick={() => setIndex((i) => i - 1)}
              className="rounded-xl border border-slate-200 p-3 text-slate-500 dark:border-slate-800"
              aria-label="Back"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
          )}
          <button
            type="button"
            onClick={onNext}
            disabled={(step === "topics" && picked.length === 0) || submitting}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand-primary py-3.5 font-semibold text-white transition-colors hover:bg-brand-primary-hover disabled:opacity-40"
            data-testid="first-run-next"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {nextLabel}
            {!submitting && <ArrowRight className="h-4 w-4" />}
          </button>
        </div>
      </footer>

      <ConfirmNewFollowListDialog
        open={confirmPks !== null}
        busy={submitting}
        onSearchRelay={searchRelay}
        onCancel={() => setConfirmPks(null)}
        onConfirm={() => {
          const pks = confirmPks;
          setConfirmPks(null);
          if (pks) void commitFollows(pks, { allowFromScratch: true });
        }}
      />
    </div>
  );
}

function Title({ children }: { children: string }) {
  return (
    <h1
      className="mt-3 text-4xl font-bold tracking-tight text-slate-900 dark:text-slate-100"
      style={{ fontFamily: "var(--font-display)" }}
    >
      {children}
    </h1>
  );
}

function Lead({ children }: { children: React.ReactNode }) {
  return <p className="mt-3 text-lg text-slate-500 dark:text-slate-400">{children}</p>;
}
