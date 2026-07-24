import { type ReactNode } from "react";

/**
 * The canonical page header used across the app — a mono kicker with a short
 * accent line, a Space Grotesk (brand) title in slate-900 (highlight a word with
 * `<span className="text-brand-deep">…</span>`), and an optional subtitle. This is
 * the single source of truth so every page's masthead reads on the same sheet of
 * music as the About / How-Search / Personalization pages.
 *
 * `size="hero"` is for full marketing headers (text-4xl→5xl); the default
 * `"page"` is the slightly more compact app-page size (text-3xl→4xl).
 */
export function PageHeader({
  kicker,
  title,
  subtitle,
  size = "page",
  className = "",
  testId,
}: {
  kicker: string;
  title: ReactNode;
  subtitle?: ReactNode;
  size?: "page" | "hero";
  className?: string;
  testId?: string;
}) {
  const titleSize = size === "hero" ? "text-4xl sm:text-5xl" : "text-3xl sm:text-4xl";
  return (
    <header className={`max-w-3xl ${className}`} data-testid={testId}>
      <div className="flex items-center gap-2.5 mb-5">
        <span className="text-[11px] font-mono font-semibold tracking-[0.25em] text-brand-accent uppercase">
          {kicker}
        </span>
        <div className="h-px w-12 bg-brand-accent/40" />
      </div>
      <h1 className={`font-brand ${titleSize} font-bold text-slate-900 dark:text-slate-100 tracking-tight leading-[1.1]`}>
        {title}
      </h1>
      {subtitle && (
        <p className="mt-5 text-lg text-slate-600 dark:text-slate-300 leading-relaxed max-w-2xl">
          {subtitle}
        </p>
      )}
    </header>
  );
}
