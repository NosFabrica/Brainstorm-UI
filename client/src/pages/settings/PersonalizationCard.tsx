/** Settings › Profile › Preferences: the way to the public-profile customizer, and the theme. */
import { useLocation } from "wouter";
import { IdCard, SlidersHorizontal } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";

export function PersonalizationCard({ npub }: { npub: string | undefined }) {
  const [, navigate] = useLocation();
  return (
    <div
      className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"
      data-testid="card-settings-personalization"
    >
      {" "}
      <div className="border-b border-slate-200 px-5 py-4 transition-colors duration-500 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-100 bg-white shadow-sm ring-1 ring-slate-100 dark:border-slate-800/60 dark:bg-slate-900 dark:ring-slate-800/60">
            <IdCard className="h-4 w-4 text-brand-deep" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2
                className="text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100"
                style={{ fontFamily: "var(--font-display)" }}
                data-testid="text-personalization-title"
              >
                Preferences
              </h2>
              <span
                className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-emerald-700"
                data-testid="badge-personalization-preview"
              >
                <span className="h-1 w-1 rounded-full bg-emerald-500" /> Live
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400" data-testid="text-personalization-subtitle">
              Choose what your profile shows
            </p>
          </div>
        </div>
        {npub && (
          <button
            type="button"
            onClick={() => navigate(`/p/${npub}`)}
            className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-brand-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-primary-hover"
            data-testid="link-customize-profile"
          >
            <SlidersHorizontal className="h-4 w-4" /> Customize your public profile
          </button>
        )}
      </div>
      <div className="p-5">
        <p
          className="text-sm leading-relaxed text-slate-600 dark:text-slate-300"
          data-testid="text-personalization-desc"
        >
          Choose exactly what appears on your public profile — which sections show, the order they're in, and who's
          featured. Open the customizer to edit it live; your choices are published to Nostr, so you own them across
          every client. Tags are separate: add those from your profile, and anyone can add one to you.
        </p>
        <div
          className="flex items-center justify-between gap-4 border-t border-slate-100 pt-4 dark:border-slate-800/60"
          data-testid="row-appearance"
        >
          <div>
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Theme</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Light, Dark, or your system's. This device only.
            </p>
          </div>
          <ThemeToggle />
        </div>
      </div>
    </div>
  );
}
