import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Loader2, ArrowRight, Check, Download } from "lucide-react";
import { Wordmark } from "@/components/Wordmark";
import { ImageUpload } from "@/components/ImageUpload";
import { FollowPicker } from "@/components/FollowPicker";
import { publishProfile, triggerScoringAndAnchor } from "@/services/nostr";
import { useActiveAccountDisplay } from "@/hooks/useActiveAccountDisplay";
import { followPubkeys } from "@/services/socialActions";
import { downloadAccountBackup } from "@/lib/accountBackup";
import { DEFAULT_BANNER_CLASS, DEFAULT_BANNER_SRC, initialsFor } from "@/lib/profileDefaults";
import { useToast } from "@/hooks/use-toast";

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
 * PostSignupCard. Mostly orchestration over ImageUpload, FollowPicker,
 * publishProfile, and downloadAccountBackup.
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

  const [step, setStep] = useState<Step>("profile");
  const stepIndex = STEPS.findIndex((s) => s.key === step);

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
  const followAndNext = (pks: string[]) => {
    if (!pks.length) return;
    if (user?.pubkey) { try { localStorage.setItem(`brainstorm_calc_triggered_at:${user.pubkey}`, String(Date.now())); } catch {} }
    void (async () => {
      try {
        const res = await followPubkeys(pks);
        if (!res.success) {
          toast({ variant: "destructive", title: "Couldn't save your follows", description: res.error || "Try again from your dashboard." });
          return;
        }
        if (user?.pubkey) await triggerScoringAndAnchor(user.pubkey);
      } catch { /* the status chip reflects the outcome */ }
    })();
    setStep("backup");
  };

  // --- Backup step ---
  const [pass, setPass] = useState("");
  const [confirm, setConfirm] = useState("");
  const mismatch = confirm.length > 0 && pass !== confirm;
  const canBackup = pass.length >= 8 && pass === confirm;

  const finish = () => {
    toast({ title: "You're all set!", description: "Your trust network is calculating — explore while it works." });
    navigate(returnPath, { replace: true });
  };

  const handleDownloadBackup = () => {
    if (!canBackup) return;
    try {
      downloadAccountBackup(pass);
      const pk = user?.pubkey;
      if (pk) localStorage.setItem(`brainstorm_backup_done:${pk}`, "true");
      toast({ title: "Backup saved", description: "Keep that file safe — it's the only way back into your account." });
    } catch {
      toast({ variant: "destructive", title: "Couldn't create your backup", description: "Please try again." });
      return;
    }
    finish();
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
          {STEPS.map((s, i) => (
            <div key={s.key} className={`h-1.5 flex-1 rounded-full transition-colors ${i <= stepIndex ? "bg-brand-primary" : "bg-slate-200 dark:bg-slate-700"}`} />
          ))}
        </div>
      </header>

      <main className="mx-auto max-w-xl px-4 sm:px-6 py-8">
        <div className="flex items-center gap-2.5 mb-3">
          <span className="text-[11px] font-mono font-semibold tracking-[0.25em] text-brand-accent uppercase">
            Step {stepIndex + 1} of {STEPS.length}
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
              Your Web of Trust is built from who you follow. Pick at least one so Brainstorm can calculate your trust scores.
            </p>
            <div className="mt-6">
              <FollowPicker onContinue={followAndNext} continueLabel="Follow & continue" />
            </div>
          </div>
        )}

        {step === "backup" && (
          <div data-testid="onboarding-step-backup">
            <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 dark:text-slate-100 tracking-tight leading-[1.08]" style={{ fontFamily: "var(--font-display)" }}>
              Back up your account.
            </h1>
            <p className="mt-4 text-lg text-slate-600 dark:text-slate-300 leading-relaxed">
              Your account lives in this browser. Save an encrypted backup file so you can sign back in anywhere — no one can reset it for you.
            </p>

            <div className="mt-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
              <input
                type="password"
                value={pass}
                onChange={(e) => setPass(e.target.value)}
                placeholder="Password — at least 8 characters"
                autoComplete="new-password"
                className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3.5 py-2.5 text-[15px] text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-brand-accent focus:outline-none focus:ring-2 focus:ring-brand-accent/30"
                data-testid="onboarding-backup-password"
              />
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Confirm password"
                autoComplete="new-password"
                className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3.5 py-2.5 text-[15px] text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-brand-accent focus:outline-none focus:ring-2 focus:ring-brand-accent/30"
                data-testid="onboarding-backup-confirm"
              />
              {mismatch && <p className="text-xs font-medium text-red-600 dark:text-red-400">Passwords don't match.</p>}
              <button
                type="button"
                onClick={handleDownloadBackup}
                disabled={!canBackup}
                className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl bg-brand-primary hover:bg-brand-primary-hover text-white text-sm font-semibold py-3 shadow-lg shadow-brand-primary/25 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                data-testid="onboarding-backup-download"
              >
                <Download className="h-4 w-4" /> Download backup &amp; finish
              </button>
            </div>

            <div className="mt-6 flex items-center justify-between gap-3">
              <button type="button" onClick={finish} className="text-sm font-semibold text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300" data-testid="onboarding-backup-skip">
                Skip for now
              </button>
              <span className="inline-flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400"><Check className="h-3.5 w-3.5" /> Scores are calculating</span>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
