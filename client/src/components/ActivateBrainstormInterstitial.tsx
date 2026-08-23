import { motion } from "framer-motion";
import { Check, FileSignature, Loader2, Lock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { BrainLogo } from "@/components/BrainLogo";
import amethystLogoImg from "@/assets/amethyst-logo.png";
import nostriaIconImg from "@/assets/nostria-icon.png";

/**
 * Full-page takeover shown on the dashboard when the account still needs to
 * sign its kind-10040 (see `needsActivationPrompt`). The dashboard's other
 * panels all radiate "everything is done", which buried the inline prompt —
 * so until the one action that makes scores visible in other apps happens,
 * the page shows only this.
 *
 * Framed as finishing setup, not complying: two checklist steps are already
 * earned, one remains. "Maybe later" is per-visit — the caller keeps the
 * dismissal in component state so navigating away and back re-raises it — and
 * its copy carries the consequence honestly.
 */

function AppBadge({ src, alt, testId }: { src: string; alt: string; testId: string }) {
  return (
    <div className="relative" data-testid={testId}>
      {/* Grayed, not erased — the logos must stay recognizable for "these
          specific apps are locked" to land. */}
      <img
        src={src}
        alt={alt}
        className="w-10 h-10 rounded-xl grayscale opacity-75 bg-white object-contain border border-slate-200 dark:border-slate-700"
      />
      <span className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full bg-slate-200 dark:bg-slate-700 border border-white dark:border-slate-900 flex items-center justify-center">
        <Lock className="h-2.5 w-2.5 text-slate-500 dark:text-slate-300" />
      </span>
    </div>
  );
}

interface StepProps {
  state: "done" | "active" | "busy";
  label: string;
  sub?: string;
  testId: string;
}

function ChecklistStep({ state, label, sub, testId }: StepProps) {
  return (
    <div className="flex items-start gap-3" data-testid={testId}>
      {state === "done" ? (
        <span className="h-6 w-6 rounded-full bg-emerald-500 flex items-center justify-center shrink-0 mt-px">
          <Check className="h-3.5 w-3.5 text-white" />
        </span>
      ) : state === "busy" ? (
        <span className="h-6 w-6 rounded-full bg-brand-primary/10 border border-brand-primary/25 flex items-center justify-center shrink-0 mt-px">
          <Loader2 className="h-3.5 w-3.5 text-brand-link animate-spin" />
        </span>
      ) : (
        <span className="h-6 w-6 rounded-full bg-brand-primary/10 border-2 border-brand-primary flex items-center justify-center shrink-0 mt-px">
          <FileSignature className="h-3 w-3 text-brand-link" />
        </span>
      )}
      <div className="min-w-0">
        <p
          className={`text-sm leading-6 ${
            state === "active"
              ? "font-bold text-slate-900 dark:text-slate-100"
              : "font-medium text-slate-600 dark:text-slate-300"
          }`}
        >
          {label}
        </p>
        {sub && <p className="text-xs text-slate-400 dark:text-slate-500 leading-relaxed">{sub}</p>}
      </div>
    </div>
  );
}

interface ActivateBrainstormInterstitialProps {
  /** First calculation finished — flips step two from busy to done. */
  scoresReady: boolean;
  onActivate: () => void;
  onDismiss: () => void;
}

export function ActivateBrainstormInterstitial({
  scoresReady,
  onActivate,
  onDismiss,
}: ActivateBrainstormInterstitialProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="flex-1 flex items-center justify-center py-6"
      data-testid="interstitial-activate-brainstorm"
    >
      <Card accent className="w-full max-w-xl overflow-hidden">
        <div className="p-6 sm:p-8">
          <div className="flex items-center gap-2.5 mb-3">
            <span className="text-[11px] font-mono font-bold tracking-[0.25em] text-brand-link uppercase">
              One step left
            </span>
            <div className="h-px w-10 bg-brand-link/30" />
          </div>

          <h1
            className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100 tracking-tight leading-[1.15]"
            style={{ fontFamily: "var(--font-display)" }}
            data-testid="text-interstitial-title"
          >
            Activate your <span className="text-brand-link">Brainstorm</span> account
          </h1>
          <p
            className="text-sm sm:text-[15px] text-slate-600 dark:text-slate-300 mt-2.5 leading-relaxed"
            data-testid="text-interstitial-subtitle"
          >
            Sign a note that tells other apps where to find your Brainstorm scores.
          </p>

          <div className="mt-6 space-y-4" data-testid="interstitial-checklist">
            <ChecklistStep state="done" label="Signed in" testId="interstitial-step-signin" />
            {scoresReady ? (
              <ChecklistStep state="done" label="Scores calculated" testId="interstitial-step-scores" />
            ) : (
              <ChecklistStep
                state="busy"
                label="Calculating your scores…"
                sub="Keeps running while you activate."
                testId="interstitial-step-scores"
              />
            )}
            <ChecklistStep
              state="active"
              label="Activate your account"
              sub="Takes one signature."
              testId="interstitial-step-activate"
            />
          </div>

          <div
            className="mt-6 flex items-center gap-3 rounded-xl bg-slate-50/80 dark:bg-slate-800/40 border border-slate-200/70 dark:border-slate-800 px-4 py-3"
            data-testid="interstitial-apps-locked"
          >
            <div className="flex items-center gap-2">
              <AppBadge src={amethystLogoImg} alt="Amethyst" testId="interstitial-app-amethyst" />
              <AppBadge src={nostriaIconImg} alt="Nostria" testId="interstitial-app-nostria" />
            </div>
            <p className="text-xs sm:text-[13px] text-slate-500 dark:text-slate-400 leading-snug">
              Amethyst and Nostria can't see your scores yet.
            </p>
          </div>

          <button
            type="button"
            onClick={onActivate}
            className="mt-6 w-full h-12 rounded-xl bg-brand-primary hover:bg-brand-primary-hover text-white font-bold text-sm tracking-wide shadow-lg shadow-brand-primary/20 transition-all duration-200 flex items-center justify-center gap-2"
            data-testid="button-interstitial-activate"
          >
            <BrainLogo mono size={16} className="text-white" />
            Activate Brainstorm
          </button>

          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={onDismiss}
              className="text-xs text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
              data-testid="button-interstitial-later"
            >
              Maybe later — my scores stay invisible in other apps for now
            </button>
          </div>
        </div>
      </Card>
    </motion.div>
  );
}
