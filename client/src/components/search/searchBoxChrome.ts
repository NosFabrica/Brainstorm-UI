/**
 * The search box's shell — one look for every place Brainstorm takes a query: the home
 * hero, the results band, and the header box on the shared pages (/p, /e, /a, /t). They
 * used to be styled apart, and the header box drifted into a smaller, flatter pill with a
 * different focus ring. Holding the classes here keeps them from drifting again.
 */

/** The rounded bar around the magnifier, the field and the ⓧ. */
export const SEARCH_BOX_CLASS =
  "relative flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-full pl-5 pr-2 py-1.5 shadow-[0_2px_12px_rgba(0,0,0,0.06)] hover:shadow-[0_4px_18px_rgba(0,0,0,0.08)] focus-within:border-brand-primary/[0.4] focus-within:shadow-[0_4px_18px_rgb(var(--brand-primary)/0.12)] transition-all duration-300";

/** The magnifier at the bar's left. */
export const SEARCH_ICON_CLASS = "h-5 w-5 text-slate-400 dark:text-slate-500 shrink-0";

/** The ⓧ that empties the bar. */
export const SEARCH_CLEAR_CLASS =
  "inline-flex items-center justify-center h-7 w-7 rounded-full text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0";

/** The words drawn over an empty field. */
export const SEARCH_PLACEHOLDER_CLASS = "truncate text-slate-400 dark:text-slate-500 text-base";
