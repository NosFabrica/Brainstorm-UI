/**
 * Settings › Trust › Trust Perspective: the preset (Relaxed / Default / Strict,
 * saved to the Account) and, on this device only, how many rungs the trust
 * ladder has and how a person's standing is drawn.
 */
import { Link } from "wouter";
import { Loader2 } from "lucide-react";
import { useScoreDisplayMode, type ScoreDisplayMode } from "@/hooks/useScoreDisplayMode";
import { useTierGranularity } from "@/hooks/useTierGranularity";
import type { Granularity } from "@/lib/trustLadder";
import { presetDescription, presetDisplayLabel } from "@/services/trustThreshold";
import type { TrustPresetChoice } from "./useTrustPresetChoice";

// The three renderings of the one tier ladder (docs/score-display/DECISIONS.md).
const TIER_GRANULARITY_CHOICES: { key: Granularity; label: string; desc: string }[] = [
  { key: "simple", label: "Simple", desc: "Verified · Unknown · Flagged" },
  { key: "detailed", label: "Detailed", desc: "the full six-step ladder" },
];
const SCORE_DISPLAY_CHOICES: { key: ScoreDisplayMode; label: string; desc: string }[] = [
  { key: "number", label: "Number", desc: "0\u2013100 score" },
  { key: "level", label: "Level", desc: "5-step dots" },
  { key: "tier", label: "Tier", desc: "color ring, no words" },
  { key: "word", label: "Word", desc: "ring + tier label" },
  { key: "off", label: "Off", desc: "nothing shown" },
];

export function PresetsCard({ choice: presetChoice }: { choice: TrustPresetChoice }) {
  const { serverPreset, presetLoading, activePreset, setPresetMutation, handlePresetChange } = presetChoice;
  // Rendered from one list so labels can't drift from the store's values.
  const [scoreDisplayMode, setScoreDisplayModeChoice] = useScoreDisplayMode();
  const [tierGranularity, setTierGranularityChoice] = useTierGranularity();
  return (
    <div
      className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"
      data-testid="card-settings-presets"
    >
      {" "}
      <div className="border-b border-slate-200 px-5 py-4 transition-colors duration-500 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-100 bg-white shadow-sm ring-1 ring-slate-100 dark:border-slate-800/60 dark:bg-slate-900 dark:ring-slate-800/60">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-brand-deep"
            >
              <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </div>
          <div className="min-w-0">
            <h2
              className="text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100"
              style={{ fontFamily: "var(--font-display)" }}
              data-testid="text-presets-title"
            >
              Trust Perspective
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400" data-testid="text-presets-subtitle">
              Tune how Brainstorm weights trust signals
            </p>
          </div>
        </div>
      </div>
      <div className="space-y-4 p-5">
        <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300" data-testid="text-presets-desc">
          How strict your network is — who counts as verified. Counts update when you switch; saved to your account.{" "}
          <Link href="/faq" className="font-medium text-brand-link hover:underline" data-testid="link-presets-faq">
            What changes?
          </Link>
        </p>

        {presetLoading && !serverPreset ? (
          <div className="grid grid-cols-3 gap-2" data-testid="row-presets-chips-loading">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-[64px] animate-pulse rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 dark:border-slate-800 dark:bg-slate-900"
              />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2" data-testid="row-presets-chips">
            {/* Label + description come from trustThreshold, the shared preset
                vocabulary — the topic-page filter reads the same helpers, so the
                two surfaces can't drift into calling one setting by two names. */}
            {(["relax", "default", "strict"] as const)
              .map((key) => ({ key, label: presetDisplayLabel(key), desc: presetDescription(key) }))
              .map((preset) => {
                const isActive = activePreset === preset.key;
                const isPendingThis = setPresetMutation.isPending && setPresetMutation.variables === preset.key;
                return (
                  <button
                    key={preset.key}
                    onClick={() => handlePresetChange(preset.key)}
                    disabled={setPresetMutation.isPending}
                    className={
                      "cursor-pointer rounded-xl border px-3 py-2.5 text-center transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-70 " +
                      (isActive
                        ? "border-brand-accent/30 bg-brand-deep/5 ring-1 ring-brand-accent/20"
                        : "border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700 dark:hover:bg-slate-800")
                    }
                    data-testid={`chip-preset-${preset.key}`}
                  >
                    <span
                      className={
                        "block text-xs font-bold " +
                        (isActive ? "text-brand-deep" : "text-slate-500 dark:text-slate-400")
                      }
                    >
                      {preset.label}
                      {isPendingThis && <Loader2 className="ml-1 inline h-3 w-3 animate-spin" />}
                    </span>
                    <span className="mt-0.5 block text-[10px] text-slate-500 dark:text-slate-400">{preset.desc}</span>
                  </button>
                );
              })}
          </div>
        )}

        {/* How people's verification is SHOWN — sibling of the preset above:
            both are "how trust renders for me", which is why it lives in this
            card rather than under Appearance (that's app chrome; this is
            meaning). Viewer-side only, this device only — the coin, search
            rows, profiles and Insights all follow it instantly. Decisions in
            docs/score-display/DECISIONS.md. */}
        {/* Decision 6/8 (docs/trust-tiers/DECISIONS.md): how many rungs the
            ladder has is a data choice, separate from how a rung is drawn. */}
        <div className="border-t border-slate-100 pt-4 dark:border-slate-800/60">
          <p
            className="text-sm font-semibold text-slate-800 dark:text-slate-200"
            data-testid="text-tier-granularity-title"
          >
            How many levels of verification you see
          </p>
          <p
            className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400"
            data-testid="text-tier-granularity-desc"
          >
            Simple: verified, unknown or flagged. Detailed: the full ladder. This device only.
          </p>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2" data-testid="row-tier-granularity">
            {TIER_GRANULARITY_CHOICES.map((choice) => {
              const isActive = tierGranularity === choice.key;
              return (
                <button
                  key={choice.key}
                  onClick={() => setTierGranularityChoice(choice.key)}
                  className={
                    "flex cursor-pointer items-baseline justify-between gap-2 rounded-xl border px-3 py-2.5 text-left transition-all duration-200 sm:block sm:text-center " +
                    (isActive
                      ? "border-brand-accent/30 bg-brand-deep/5 ring-1 ring-brand-accent/20"
                      : "border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700 dark:hover:bg-slate-800")
                  }
                  data-testid={`chip-tier-granularity-${choice.key}`}
                >
                  <span
                    className={
                      "text-xs font-bold " + (isActive ? "text-brand-deep" : "text-slate-500 dark:text-slate-400")
                    }
                  >
                    {choice.label}
                  </span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 sm:mt-0.5 sm:block">
                    {choice.desc}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="border-t border-slate-100 pt-4 dark:border-slate-800/60">
          <p
            className="text-sm font-semibold text-slate-800 dark:text-slate-200"
            data-testid="text-score-display-title"
          >
            How people's verification is shown
          </p>
          <p
            className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400"
            data-testid="text-score-display-desc"
          >
            How a person's standing is drawn for you, everywhere — or not at all. Flag warnings stay. This device only.
          </p>
          {/* Five options, one row on desktop; stacked full-width rows on
              mobile (label left, description right) — five centered columns
              don't fit a phone, and 3-over-2 wrapping looked broken. */}
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-5" data-testid="row-score-display-modes">
            {SCORE_DISPLAY_CHOICES.map((choice) => {
              const isActive = scoreDisplayMode === choice.key;
              return (
                <button
                  key={choice.key}
                  onClick={() => setScoreDisplayModeChoice(choice.key)}
                  className={
                    "flex cursor-pointer items-baseline justify-between gap-2 rounded-xl border px-3 py-2.5 text-left transition-all duration-200 sm:block sm:text-center " +
                    (isActive
                      ? "border-brand-accent/30 bg-brand-deep/5 ring-1 ring-brand-accent/20"
                      : "border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700 dark:hover:bg-slate-800")
                  }
                  data-testid={`chip-score-display-${choice.key}`}
                >
                  <span
                    className={
                      "text-xs font-bold " + (isActive ? "text-brand-deep" : "text-slate-500 dark:text-slate-400")
                    }
                  >
                    {choice.label}
                  </span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 sm:mt-0.5 sm:block">
                    {choice.desc}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
