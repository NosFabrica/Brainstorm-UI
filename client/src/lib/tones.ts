// Tone system — the single source of truth for tinted "chip / badge / tile"
// surfaces in the Brainstorm Design System (brand guidelines p17 "UI Foundations":
// "Use colour to communicate, not decorate").
//
// Every tone carries BOTH its light and dark treatment, so components never
// re-derive theming (this is what caused the app-wide dark-mode drift).
// Named tones map 1:1 to the current bg-<color>-50 usage; semantic aliases
// (success/warning/danger/info/neutral) resolve to a named tone for new code.

export type NamedTone =
  | "emerald"
  | "amber"
  | "orange"
  | "red"
  | "rose"
  | "sky"
  | "blue"
  | "indigo"
  | "violet"
  | "fuchsia"
  | "teal"
  | "slate"
  | "brand"
  | "accent";

export type SemanticTone = "success" | "warning" | "danger" | "info" | "neutral";

export type Tone = NamedTone | SemanticTone;

export interface ToneClasses {
  /** Tinted surface background (light + dark). */
  bg: string;
  /** Readable label text on the tint (light + dark). */
  text: string;
  /** Border for the tinted surface (light + dark). */
  border: string;
  /** Slightly stronger color for a leading icon (light + dark). */
  icon: string;
  /** Solid status dot. */
  dot: string;
}

const RAW: Record<NamedTone, ToneClasses> = {
  emerald: { bg: "bg-emerald-50 dark:bg-emerald-500/10", text: "text-emerald-700 dark:text-emerald-300", border: "border-emerald-200 dark:border-emerald-500/25", icon: "text-emerald-600 dark:text-emerald-400", dot: "bg-emerald-500" },
  amber:   { bg: "bg-amber-50 dark:bg-amber-500/10",     text: "text-amber-700 dark:text-amber-300",     border: "border-amber-200 dark:border-amber-500/25",     icon: "text-amber-600 dark:text-amber-400",     dot: "bg-amber-500" },
  orange:  { bg: "bg-orange-50 dark:bg-orange-500/10",   text: "text-orange-700 dark:text-orange-300",   border: "border-orange-200 dark:border-orange-500/25",   icon: "text-orange-600 dark:text-orange-400",   dot: "bg-orange-500" },
  red:     { bg: "bg-red-50 dark:bg-red-500/10",         text: "text-red-700 dark:text-red-300",         border: "border-red-200 dark:border-red-500/25",         icon: "text-red-600 dark:text-red-400",         dot: "bg-red-500" },
  rose:    { bg: "bg-rose-50 dark:bg-rose-500/10",       text: "text-rose-700 dark:text-rose-300",       border: "border-rose-200 dark:border-rose-500/25",       icon: "text-rose-600 dark:text-rose-400",       dot: "bg-rose-500" },
  sky:     { bg: "bg-sky-50 dark:bg-sky-500/10",         text: "text-sky-700 dark:text-sky-300",         border: "border-sky-200 dark:border-sky-500/25",         icon: "text-sky-600 dark:text-sky-400",         dot: "bg-sky-500" },
  blue:    { bg: "bg-blue-50 dark:bg-blue-500/10",       text: "text-blue-700 dark:text-blue-300",       border: "border-blue-200 dark:border-blue-500/25",       icon: "text-blue-600 dark:text-blue-400",       dot: "bg-blue-500" },
  indigo:  { bg: "bg-indigo-50 dark:bg-indigo-500/10",   text: "text-indigo-700 dark:text-indigo-300",   border: "border-indigo-200 dark:border-indigo-500/25",   icon: "text-indigo-600 dark:text-indigo-400",   dot: "bg-indigo-500" },
  violet:  { bg: "bg-violet-50 dark:bg-violet-500/10",   text: "text-violet-700 dark:text-violet-300",   border: "border-violet-200 dark:border-violet-500/25",   icon: "text-violet-600 dark:text-violet-400",   dot: "bg-violet-500" },
  fuchsia: { bg: "bg-fuchsia-50 dark:bg-fuchsia-500/10", text: "text-fuchsia-700 dark:text-fuchsia-300", border: "border-fuchsia-200 dark:border-fuchsia-500/25", icon: "text-fuchsia-600 dark:text-fuchsia-400", dot: "bg-fuchsia-500" },
  teal:    { bg: "bg-teal-50 dark:bg-teal-500/10",       text: "text-teal-700 dark:text-teal-300",       border: "border-teal-200 dark:border-teal-500/25",       icon: "text-teal-600 dark:text-teal-400",       dot: "bg-teal-500" },
  slate:   { bg: "bg-slate-100 dark:bg-slate-800",       text: "text-slate-600 dark:text-slate-300",     border: "border-slate-200 dark:border-slate-700",       icon: "text-slate-500 dark:text-slate-400",     dot: "bg-slate-400" },
  // Brand tones — Aurora Purple (brand) + Aurora Cyan (accent), per the palette.
  brand:   { bg: "bg-indigo-50 dark:bg-indigo-500/10",   text: "text-brand-deep dark:text-brand-link",   border: "border-indigo-200 dark:border-indigo-500/25",   icon: "text-brand-primary dark:text-brand-link", dot: "bg-brand-primary" },
  accent:  { bg: "bg-brand-accent/[0.08] dark:bg-brand-accent/[0.14]", text: "text-brand-deep dark:text-brand-link", border: "border-brand-accent/25 dark:border-brand-accent/30", icon: "text-brand-accent", dot: "bg-brand-accent" },
};

const ALIAS: Record<SemanticTone, NamedTone> = {
  success: "emerald",
  warning: "amber",
  danger: "red",
  info: "sky",
  neutral: "slate",
};

/** Resolve a tone (named or semantic alias) to its light+dark class set. */
export function tone(t: Tone): ToneClasses {
  if (t in ALIAS) return RAW[ALIAS[t as SemanticTone]];
  return RAW[(t as NamedTone)] ?? RAW.slate;
}
