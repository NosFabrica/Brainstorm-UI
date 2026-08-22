import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Loader2, ArrowRight } from "lucide-react";
import { Wordmark } from "@/components/Wordmark";
import { ImageUpload } from "@/components/ImageUpload";
import { FollowPicker } from "@/components/FollowPicker";
import { Nip85ConsentCard } from "@/components/Nip85ConsentCard";
import { OnboardingBackupStep } from "@/components/OnboardingBackupStep";
import { publishProfile } from "@/services/nostr";
import { publishBrainstormTrustAnchor, triggerScoringAndAnchor } from "@/services/trustAnchor";
import { useActiveAccountDisplay } from "@/hooks/useActiveAccountDisplay";
import { useSelfHistory } from "@/hooks/useSelf";
import { isNip85Activated } from "@/lib/nip85Activation";
import { followPubkeys } from "@/services/socialActions";
import { canBackUp } from "@/accounts/backup";
import { DEFAULT_BANNER_CLASS, DEFAULT_BANNER_SRC, initialsFor } from "@/lib/profileDefaults";
import { useToast } from "@/hooks/use-toast";
import { accountKey } from "@/lib/accountStorage";

type Step = "profile" | "follow" | "backup";
const STEPS: { key: Step; label: string }[] = [
  { key: "profile", label: "Profile" },
  { key: "follow", label: "Network" },
  { key: "backup", label: "Backup" },
];

/**
 * Guided post-signup onboarding: name (captured at signup) → profile (photo/bio,
 * skippable) → follow people (required — turns on scoring) → back up (skippable).
 * Profile comes BEFORE follow so the avatar is in the kind-0 before the first
 * follow others see. Anything skipped is recovered by the home-page
 * PostSignupCard and then the recurring reminder — the backup step being last is
 * what makes that chain load-bearing.
 */
export default function OnboardingWizard() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const user = useActiveAccountDisplay();

  const returnPath = useMemo(() => {
    try {
      const n = new URLSearchParams(window.location.search).get("next");
      if (n && n.startsWith("/") && !n.startsWith("//") && n !== "/login" && n !== "/welcome" && n !== "/setup") return n;
    } catch { /* ignore */ }
    return "/";
  }, []);

  const finish = () => {
    toast({ title: "You're all set!", description: "Your trust network is calculating — explore while it works." });
    navigate(returnPath, { replace: true });
  };

  // An Account whose key lives in an extension or a bunker has nothing to back
  // up, so it is never shown a step asking it to.
  const [backupOffered] = useState(() => canBackUp());
  const steps = useMemo(
    () => (backupOffered ? STEPS : STEPS.filter((s) => s.key !== "backup")),
    [backupOffered],
  );

  const [step, setStep] = useState<Step>("profile");
  const stepIndex = steps.findIndex((s) => s.key === step);

  // --- Profile step (prefilled with the name entered at signup) ---
  const [name, setName] = useState(() => user?.displayName || "");
  const [about, setAbout] = useState("");
  const [picture, setPicture] = useState("");
  const [banner, setBanner] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  const saveProfileAndNext = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSavingProfile(true);
    const content: Record<string, unknown> = { name: trimmed, display_name: trimmed };
    if (about.trim()) content.about = about.trim();
    if (picture.trim()) content.picture = picture.trim();
    if (banner.trim()) content.banner = banner.trim();
    try { await publishProfile(content); } catch { /* best-effort — the recovery card catches it */ }
    setSavingProfile(false);
    setStep("follow");
  };

  // --- Follow step → publish kind-3 + trigger scoring in background, advance ---
  // The NIP-85 ask lives beside the follow list; consent rides along with the
  // calculate trigger, and when the backend has already minted the service key
  // (it does so at first auth, independent of scoring) the kind-10040 publishes
  // right here — a freshly created key signs silently, no waiting on scores.
  const [nip85Consent, setNip85Consent] = useState(true);
  const historyQuery = useSelfHistory(user?.pubkey);
  const taPubkey = (historyQuery.data as { data?: { ta_pubkey?: string | null } } | undefined)?.data?.ta_pubkey;
  const followAndNext = (pks: string[]) => {
    if (!pks.length) return;
    if (user?.pubkey) { try { localStorage.setItem(accountKey("brainstorm_calc_triggered_at", user.pubkey), String(Date.now())); } catch {} }
    void (async () => {
      try {
        const res = await followPubkeys(pks);
        if (res.cancelled) return;
        if (!res.success) {
          toast({ variant: "destructive", title: "Couldn't save your follows", description: res.error || "Try again from your dashboard." });
          return;
        }
        if (!user?.pubkey) return;
        await triggerScoringAndAnchor(user.pubkey, { nip85Consent });
        if (nip85Consent && taPubkey && !isNip85Activated(user.pubkey)) {
          // Cancelled/failed publishes stay quiet — the consent-gated background
          // poll and app-load self-heal finish the job.
          const published = await publishBrainstormTrustAnchor(user.pubkey, taPubkey);
          if (published.status === "success") {
            toast({ title: "Scores shared", description: "Other apps can now find your Brainstorm scores." });
          }
        }
      } catch { /* the status chip reflects the outcome */ }
    })();
    if (backupOffered) setStep("backup");
    else finish();
  };

  if (!user) {
    navigate("/login", { replace: true });
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 dark:from-slate-950 to-white dark:to-slate-900">
      <header className="border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur sticky top-0 z-10">
        <div className="mx-auto max-w-xl flex items-center justify-between px-4 sm:px-6 h-14">
          <button
            type="button"
            onClick={() => navigate("/")}
            className="flex items-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/50"
            aria-label="Brainstorm home"
          >
            <Wordmark height={24} className="shrink-0 dark:hidden" />
            <Wordmark height={24} variant="white" className="hidden shrink-0 dark:block" />
          </button>
          <button type="button" onClick={finish} className="text-sm font-semibold text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300" data-testid="onboarding-exit">
            Skip setup
          </button>
        </div>
        <div className="mx-auto max-w-xl px-4 sm:px-6 pb-3 flex items-center gap-2" data-testid="onboarding-progress">
          {steps.map((s, i) => (
            <div key={s.key} className={`h-1.5 flex-1 rounded-full transition-colors ${i <= stepIndex ? "bg-brand-primary" : "bg-slate-200 dark:bg-slate-700"}`} />
          ))}
        </div>
      </header>

      <main className="mx-auto max-w-xl px-4 sm:px-6 py-8">
        <div className="flex items-center gap-2.5 mb-3">
          <span className="text-[11px] font-mono font-semibold tracking-[0.25em] text-brand-accent uppercase">
            Step {stepIndex + 1} of {steps.length}
          </span>
          <div className="h-px w-10 bg-brand-accent/40" />
        </div>

        {step === "profile" && (
          <div data-testid="onboarding-step-profile">
            <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 dark:text-slate-100 tracking-tight leading-[1.08]" style={{ fontFamily: "var(--font-display)" }}>
              Add a photo <span className="text-brand-link">so people recognize you</span>.
            </h1>
            <p className="mt-4 text-lg text-slate-600 dark:text-slate-300 leading-relaxed">
              This is how you appear across Nostr. A photo and a short bio go a long way — or skip and add them later.
            </p>

            <div className="mt-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
              <ImageUpload
                aspect="banner"
                value={banner}
                onChange={setBanner}
                onRemove={() => setBanner("")}
                containerClassName="w-full h-24 sm:h-32 rounded-t-2xl"
                placeholder={
                  <div className={`relative w-full h-full ${DEFAULT_BANNER_CLASS}`}>
                    <img src={DEFAULT_BANNER_SRC} alt="" aria-hidden="true" className="absolute inset-0 w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-br from-brand-accent/30 via-brand-accent-hover/20 to-brand-deep/40 mix-blend-multiply" />
                  </div>
                }
              />
              <div className="px-5 pb-6 -mt-12 relative">
                <div className="mb-4">
                  <ImageUpload
                    aspect="square"
                    value={picture}
                    onChange={setPicture}
                    onRemove={() => setPicture("")}
                    containerClassName="h-20 w-20 sm:h-24 sm:w-24 rounded-full border-4 border-white dark:border-slate-900 shadow-lg bg-white dark:bg-slate-900"
                    placeholder={
                      <div className="w-full h-full flex items-center justify-center rounded-full bg-brand-primary/10 dark:bg-brand-primary/20 text-brand-primary dark:text-brand-link font-bold text-3xl" style={{ fontFamily: "var(--font-display)" }}>
                        {initialsFor(name)}
                      </div>
                    }
                  />
                </div>
                <label htmlFor="ob-name" className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">Display name</label>
                <input
                  id="ob-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={50}
                  placeholder="Your name"
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3.5 py-2.5 text-[15px] text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 shadow-sm focus:border-brand-accent focus:outline-none focus:ring-2 focus:ring-brand-accent/30"
                  data-testid="onboarding-name"
                />
                <label htmlFor="ob-bio" className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5 mt-4">Bio <span className="text-xs font-normal text-slate-400 dark:text-slate-500">Optional</span></label>
                <textarea
                  id="ob-bio"
                  value={about}
                  onChange={(e) => setAbout(e.target.value)}
                  maxLength={500}
                  rows={3}
                  placeholder="A short bio"
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3.5 py-2.5 text-[15px] text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 shadow-sm focus:border-brand-accent focus:outline-none focus:ring-2 focus:ring-brand-accent/30 resize-none"
                  data-testid="onboarding-bio"
                />
              </div>
            </div>

            <div className="mt-6 flex items-center justify-between gap-3">
              <button type="button" onClick={() => setStep("follow")} className="text-sm font-semibold text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300" data-testid="onboarding-profile-skip">
                Skip for now
              </button>
              <button
                type="button"
                onClick={saveProfileAndNext}
                disabled={!name.trim() || savingProfile}
                className="h-12 px-6 rounded-xl bg-brand-primary hover:bg-brand-primary-hover disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-sm shadow-lg shadow-brand-primary/25 transition-all flex items-center justify-center gap-2"
                data-testid="onboarding-profile-continue"
              >
                {savingProfile ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</> : <>Continue <ArrowRight className="h-4 w-4" /></>}
              </button>
            </div>
          </div>
        )}

        {step === "follow" && (
          <div data-testid="onboarding-step-follow">
            <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 dark:text-slate-100 tracking-tight leading-[1.08]" style={{ fontFamily: "var(--font-display)" }}>
              Follow a few accounts <span className="text-brand-link">to begin</span>.
            </h1>
            <p className="mt-4 text-lg text-slate-600 dark:text-slate-300 leading-relaxed">
              Your network is built from who you follow. Pick at least one so Brainstorm can calculate your scores.
            </p>
            {/* A key created here minutes ago can't have a 10040 — skip the relay pre-check. */}
            <Nip85ConsentCard
              pubkey={user?.pubkey}
              taPubkey={taPubkey}
              value={nip85Consent}
              onChange={setNip85Consent}
              skipProviderCheck
              className="mt-5"
            />
            <div className="mt-4">
              <FollowPicker onContinue={followAndNext} continueLabel="Follow & continue" />
            </div>
          </div>
        )}

        {step === "backup" && (
          <OnboardingBackupStep onSkip={finish} onFinish={finish} />
        )}
      </main>
    </div>
  );
}
