import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Loader2, ArrowRight, Check, Download } from "lucide-react";
import { BrainLogo } from "@/components/BrainLogo";
import { ImageUpload } from "@/components/ImageUpload";
import { FollowPicker } from "@/components/FollowPicker";
import { getCurrentUser, publishProfile, triggerScoringAndAnchor } from "@/services/nostr";
import { followPubkeys } from "@/services/socialActions";
import { downloadAccountBackup } from "@/lib/accountBackup";
import { DEFAULT_BANNER_CLASS, DEFAULT_BANNER_SRC, initialsFor } from "@/lib/profileDefaults";
import { useToast } from "@/hooks/use-toast";
import { TIERS, deltaFeaturesForTier } from "@/lib/plans";
import { FlashIcon } from "@/components/FlashIcon";

type Step = "profile" | "follow" | "backup" | "plans";
const STEPS: { key: Step; label: string }[] = [
  { key: "profile", label: "Profile" },
  { key: "follow", label: "Network" },
  { key: "backup", label: "Backup" },
  { key: "plans", label: "Plans" },
];

// Persist wizard progress per-account so stepping out (e.g. to /pricing) and
// back resumes exactly where you were instead of resetting to step 1 with empty
// fields — which reads as "the product ate my data" even though it's all saved.
interface OnboardingState {
  step: Step;
  name: string;
  about: string;
  picture: string;
  banner: string;
}
const onboardingKey = (pubkey: string) => `brainstorm_onboarding_state:${pubkey}`;

function loadOnboardingState(pubkey: string): Partial<OnboardingState> | null {
  if (!pubkey) return null;
  try {
    const raw = localStorage.getItem(onboardingKey(pubkey));
    return raw ? (JSON.parse(raw) as Partial<OnboardingState>) : null;
  } catch {
    return null;
  }
}
function saveOnboardingState(pubkey: string, state: OnboardingState): void {
  if (!pubkey) return;
  try {
    localStorage.setItem(onboardingKey(pubkey), JSON.stringify(state));
  } catch {
    /* storage unavailable — degrade to in-memory only */
  }
}
function clearOnboardingState(pubkey: string): void {
  try {
    localStorage.removeItem(onboardingKey(pubkey));
  } catch {
    /* ignore */
  }
}

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
  const user = getCurrentUser();

  const returnPath = useMemo(() => {
    try {
      const n = new URLSearchParams(window.location.search).get("next");
      if (n && n.startsWith("/") && !n.startsWith("//") && n !== "/login" && n !== "/welcome" && n !== "/setup") return n;
    } catch { /* ignore */ }
    return "/";
  }, []);

  const pubkey = user?.pubkey ?? "";
  const persisted = useMemo(() => loadOnboardingState(pubkey), [pubkey]);
  const isValidStep = (s: unknown): s is Step => STEPS.some((st) => st.key === s);

  const [step, setStep] = useState<Step>(() => (isValidStep(persisted?.step) ? persisted!.step : "profile"));
  const stepIndex = STEPS.findIndex((s) => s.key === step);

  // --- Profile step — restore from a saved draft, else the account's real
  //     published values, so the form is never blank on a remount (and a
  //     re-continue can never overwrite a good kind-0 with empty fields). ---
  const [name, setName] = useState(() => persisted?.name ?? user?.displayName ?? "");
  const [about, setAbout] = useState(() => persisted?.about ?? user?.about ?? "");
  const [picture, setPicture] = useState(() => persisted?.picture ?? user?.picture ?? "");
  const [banner, setBanner] = useState(() => persisted?.banner ?? "");
  const [savingProfile, setSavingProfile] = useState(false);

  // Persist progress on every step / field change so navigating away and back
  // resumes exactly here instead of resetting to a blank step 1.
  useEffect(() => {
    if (pubkey) saveOnboardingState(pubkey, { step, name, about, picture, banner });
  }, [pubkey, step, name, about, picture, banner]);

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
    const u = getCurrentUser();
    if (u?.pubkey) { try { localStorage.setItem(`brainstorm_calc_triggered_at:${u.pubkey}`, String(Date.now())); } catch {} }
    void (async () => {
      try {
        const res = await followPubkeys(pks);
        if (!res.success) {
          toast({ variant: "destructive", title: "Couldn't save your follows", description: res.error || "Try again from your dashboard." });
          return;
        }
        if (u?.pubkey) await triggerScoringAndAnchor(u.pubkey);
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
    clearOnboardingState(pubkey); // onboarding done — don't resume the wizard later
    toast({ title: "You're all set!", description: "Your trust network is calculating — explore while it works." });
    navigate(returnPath, { replace: true });
  };

  const handleDownloadBackup = () => {
    if (!canBackup) return;
    try {
      downloadAccountBackup(pass);
      const pk = getCurrentUser()?.pubkey;
      if (pk) localStorage.setItem(`brainstorm_backup_done:${pk}`, "true");
      toast({ title: "Backup saved", description: "Keep that file safe — it's the only way back into your account." });
    } catch {
      toast({ variant: "destructive", title: "Couldn't create your backup", description: "Please try again." });
      return;
    }
    setStep("plans");
  };

  if (!user) {
    navigate("/login", { replace: true });
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur sticky top-0 z-10">
        <div className="mx-auto max-w-xl flex items-center justify-between px-4 sm:px-6 h-14">
          <div className="flex items-center gap-2">
            <BrainLogo size={26} className="text-indigo-500" />
            <span className="text-lg font-bold text-indigo-500 font-brand">Brainstorm</span>
          </div>
          <button type="button" onClick={finish} className="text-sm font-semibold text-slate-400 hover:text-slate-600" data-testid="onboarding-exit">
            Skip setup
          </button>
        </div>
        <div className="mx-auto max-w-xl px-4 sm:px-6 pb-3 flex items-center gap-2" data-testid="onboarding-progress">
          {STEPS.map((s, i) => (
            <div key={s.key} className={`h-1.5 flex-1 rounded-full transition-colors ${i <= stepIndex ? "bg-[#6366f1]" : "bg-slate-200"}`} />
          ))}
        </div>
      </header>

      <main className="mx-auto max-w-xl px-4 sm:px-6 py-8">
        <div className="flex items-center gap-2.5 mb-3">
          <span className="text-[11px] font-mono font-semibold tracking-[0.25em] text-[#7c86ff] uppercase">
            Step {stepIndex + 1} of {STEPS.length}
          </span>
          <div className="h-px w-10 bg-[#7c86ff]/40" />
        </div>

        {step === "profile" && (
          <div data-testid="onboarding-step-profile">
            <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 tracking-tight leading-[1.08]" style={{ fontFamily: "var(--font-display)" }}>
              Add a photo <span className="text-[#333286]">so people recognize you</span>.
            </h1>
            <p className="mt-4 text-lg text-slate-600 leading-relaxed">
              This is how you appear across Nostr. A photo and a short bio go a long way — or skip and add them later.
            </p>

            <div className="mt-6 rounded-2xl border border-slate-200 bg-white overflow-hidden">
              <ImageUpload
                aspect="banner"
                value={banner}
                onChange={setBanner}
                onRemove={() => setBanner("")}
                containerClassName="w-full h-24 sm:h-32 rounded-t-2xl"
                placeholder={
                  <div className={`relative w-full h-full ${DEFAULT_BANNER_CLASS}`}>
                    <img src={DEFAULT_BANNER_SRC} alt="" aria-hidden="true" className="absolute inset-0 w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-br from-[#7c86ff]/30 via-[#5b63d9]/20 to-[#333286]/40 mix-blend-multiply" />
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
                    containerClassName="h-20 w-20 sm:h-24 sm:w-24 rounded-full border-4 border-white shadow-lg bg-white"
                    placeholder={
                      <div className="w-full h-full flex items-center justify-center rounded-full bg-indigo-100 text-indigo-700 font-bold text-3xl" style={{ fontFamily: "var(--font-display)" }}>
                        {initialsFor(name)}
                      </div>
                    }
                  />
                </div>
                <label htmlFor="ob-name" className="block text-sm font-medium text-slate-700 mb-1.5">Display name</label>
                <input
                  id="ob-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={50}
                  placeholder="Your name"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-[15px] text-slate-900 placeholder:text-slate-400 shadow-sm focus:border-[#7c86ff] focus:outline-none focus:ring-2 focus:ring-[#7c86ff]/30"
                  data-testid="onboarding-name"
                />
                <label htmlFor="ob-bio" className="block text-sm font-medium text-slate-700 mb-1.5 mt-4">Bio <span className="text-xs font-normal text-slate-400">Optional</span></label>
                <textarea
                  id="ob-bio"
                  value={about}
                  onChange={(e) => setAbout(e.target.value)}
                  maxLength={500}
                  rows={3}
                  placeholder="A short bio"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-[15px] text-slate-900 placeholder:text-slate-400 shadow-sm focus:border-[#7c86ff] focus:outline-none focus:ring-2 focus:ring-[#7c86ff]/30 resize-none"
                  data-testid="onboarding-bio"
                />
              </div>
            </div>

            <div className="mt-6 flex items-center justify-between gap-3">
              <button type="button" onClick={() => setStep("follow")} className="text-sm font-semibold text-slate-400 hover:text-slate-600" data-testid="onboarding-profile-skip">
                Skip for now
              </button>
              <button
                type="button"
                onClick={saveProfileAndNext}
                disabled={!name.trim() || savingProfile}
                className="h-12 px-6 rounded-xl bg-[#6366f1] hover:bg-[#4f46e5] disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-sm shadow-sm transition-colors flex items-center justify-center gap-2"
                data-testid="onboarding-profile-continue"
              >
                {savingProfile ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</> : <>Continue <ArrowRight className="h-4 w-4" /></>}
              </button>
            </div>
          </div>
        )}

        {step === "follow" && (
          <div data-testid="onboarding-step-follow">
            <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 tracking-tight leading-[1.08]" style={{ fontFamily: "var(--font-display)" }}>
              Follow a few accounts <span className="text-[#333286]">to begin</span>.
            </h1>
            <p className="mt-4 text-lg text-slate-600 leading-relaxed">
              Your Web of Trust is built from who you follow. Pick at least one so Brainstorm can calculate your trust scores.
            </p>
            <div className="mt-6">
              <FollowPicker onContinue={followAndNext} continueLabel="Follow & continue" />
            </div>
          </div>
        )}

        {step === "backup" && (
          <div data-testid="onboarding-step-backup">
            <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 tracking-tight leading-[1.08]" style={{ fontFamily: "var(--font-display)" }}>
              Back up your account.
            </h1>
            <p className="mt-4 text-lg text-slate-600 leading-relaxed">
              Your account lives in this browser. Save an encrypted backup file so you can sign back in anywhere — no one can reset it for you.
            </p>

            <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
              <input
                type="password"
                value={pass}
                onChange={(e) => setPass(e.target.value)}
                placeholder="Password — at least 8 characters"
                autoComplete="new-password"
                className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-[15px] text-slate-900 placeholder:text-slate-400 focus:border-[#7c86ff] focus:outline-none focus:ring-2 focus:ring-[#7c86ff]/30"
                data-testid="onboarding-backup-password"
              />
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Confirm password"
                autoComplete="new-password"
                className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-[15px] text-slate-900 placeholder:text-slate-400 focus:border-[#7c86ff] focus:outline-none focus:ring-2 focus:ring-[#7c86ff]/30"
                data-testid="onboarding-backup-confirm"
              />
              {mismatch && <p className="text-xs font-medium text-red-600">Passwords don't match.</p>}
              <button
                type="button"
                onClick={handleDownloadBackup}
                disabled={!canBackup}
                className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#6366f1] hover:bg-[#4f46e5] text-white text-sm font-semibold py-3 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                data-testid="onboarding-backup-download"
              >
                <Download className="h-4 w-4" /> Download backup &amp; finish
              </button>
            </div>

            <div className="mt-6 flex items-center justify-between gap-3">
              <button type="button" onClick={() => setStep("plans")} className="text-sm font-semibold text-slate-400 hover:text-slate-600" data-testid="onboarding-backup-skip">
                Skip for now
              </button>
              <span className="inline-flex items-center gap-1.5 text-xs text-emerald-700"><Check className="h-3.5 w-3.5" /> Scores are calculating</span>
            </div>
          </div>
        )}

        {step === "plans" && (
          <div data-testid="onboarding-step-plans">
            <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 tracking-tight leading-[1.08]" style={{ fontFamily: "var(--font-display)" }}>
              You're all set on <span className="text-[#333286]">Grapevine</span> — free forever.
            </h1>
            <p className="mt-4 text-lg text-slate-600 leading-relaxed">
              Everything you need is free. When you want fresher scores and to truly own your data, {TIERS.sovereign.name} is there — no rush.
            </p>

            {/* Sovereign at-a-glance — awareness only, nothing to buy here */}
            <div className="mt-6 rounded-2xl border border-[#7c86ff]/40 bg-white p-5 shadow-sm" data-testid="onboarding-plans-sovereign">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-brand text-lg font-bold text-slate-900">{TIERS.sovereign.name}</div>
                  <div className="text-xs text-slate-400">{TIERS.sovereign.usdApprox} — {TIERS.sovereign.tagline}</div>
                </div>
                <div className="flex items-baseline gap-1 shrink-0">
                  <span className="text-2xl font-bold text-slate-900 tabular-nums">{TIERS.sovereign.satsPerMonth.toLocaleString()}</span>
                  <span className="text-sm font-semibold text-amber-600 inline-flex items-center gap-0.5"><FlashIcon className="h-3.5 w-3.5" />sats</span>
                  <span className="text-xs text-slate-400">/ mo</span>
                </div>
              </div>
              <ul className="mt-3 space-y-1.5 text-sm text-slate-600">
                {deltaFeaturesForTier("sovereign").slice(0, 3).map((f) => (
                  <li key={f.key} className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-emerald-500 shrink-0" /> {f.label}
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-6 flex items-center justify-between gap-3">
              <button type="button" onClick={() => navigate("/pricing")} className="text-sm font-semibold text-slate-500 hover:text-[#333286]" data-testid="onboarding-plans-see-all">
                Compare all plans
              </button>
              <button
                type="button"
                onClick={finish}
                className="h-12 px-6 rounded-xl bg-[#6366f1] hover:bg-[#4f46e5] text-white font-semibold text-sm shadow-sm transition-colors flex items-center justify-center gap-2"
                data-testid="onboarding-plans-continue"
              >
                Start exploring <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
