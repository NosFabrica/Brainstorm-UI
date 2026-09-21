import { BrainLogo } from "@/components/BrainLogo";

/**
 * The bar across the top of the setup screens (/welcome, /activate).
 *
 * Just the B mark, as on every other header: brand guidelines v1.0 put
 * navigation in the symbol column, and the wordmark is handwritten artwork that
 * must be used as supplied — so setting the name in a typeface beside the mark
 * was off-brand twice over, and made a lockup the identity doesn't have. The
 * gradient mark reads on the light bar, the white one on the dark, the same
 * pairing `PublicPageHeader` uses.
 *
 * The mark doesn't navigate here. Elsewhere it goes home, but on a setup screen
 * the deliberate way out is the skip button beside it, and a stray tap on a logo
 * shouldn't end someone's setup before anything has been published.
 */
export function OnboardingHeader({
  onSkip,
  skipLabel,
  skipTestId,
}: {
  onSkip: () => void;
  skipLabel: string;
  skipTestId: string;
}) {
  return (
    <header
      className="border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur"
      data-testid="onboarding-header"
    >
      <div className="mx-auto flex h-14 max-w-xl items-center justify-between px-4 sm:px-6">
        <BrainLogo size={26} className="shrink-0 dark:hidden" />
        <BrainLogo size={26} mono className="hidden shrink-0 text-white dark:block" />
        <button
          type="button"
          onClick={onSkip}
          className="text-sm font-semibold text-slate-400 transition-colors hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
          data-testid={skipTestId}
        >
          {skipLabel}
        </button>
      </div>
    </header>
  );
}
