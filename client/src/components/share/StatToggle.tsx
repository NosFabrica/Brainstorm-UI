import { Link } from "wouter";
import { Eye } from "lucide-react";

export type StatLens = "verified" | "all";

/**
 * One profile stat. The count + label is a LINK to the full list (click to
 * browse). Which count it shows — "Verified" (web-of-trust filtered) or "All"
 * (raw, includes bots) — is driven by a single shared `lens` toggle for the whole
 * stats block (see StatLensToggle), so there's one clean control instead of a
 * per-stat switch.
 */
export function Stat({
  verified,
  all,
  verifiedLabel,
  allLabel,
  lens,
  href,
  danger = false,
  testId,
}: {
  verified: number | null;
  all: number | null;
  verifiedLabel: string;
  allLabel: string;
  lens: StatLens;
  href: string;
  danger?: boolean;
  testId?: string;
}) {
  const count = lens === "verified" ? verified : all;
  const effective = count ?? (lens === "verified" ? all : verified);
  if (effective == null) return null;

  const label = lens === "verified" ? verifiedLabel : allLabel;
  const numClass = danger ? "text-red-600" : "text-slate-700 dark:text-slate-200";
  const labelClass = danger ? "text-red-500" : "";

  return (
    <Link
      href={href}
      className={`group/stat inline-flex items-center gap-1 transition-colors ${danger ? "hover:text-red-700" : "hover:text-slate-700 dark:hover:text-slate-200"}`}
      data-testid={testId}
    >
      <span className={`font-semibold tabular-nums ${numClass}`}>{effective.toLocaleString()}</span>
      <span className={`border-b border-dotted border-transparent group-hover/stat:border-current/40 ${labelClass}`}>{label}</span>
    </Link>
  );
}

/**
 * The single lens switch for the stats block — one quiet flip-link under the
 * stats that toggles every count between verified (trust-filtered) and all (raw)
 * at once. Deliberately understated (reads like a footnote, not a control) so it
 * doesn't compete with the stats themselves.
 */
export function StatLensToggle({
  value,
  onChange,
}: {
  value: StatLens;
  onChange: (v: StatLens) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(value === "verified" ? "all" : "verified")}
      className="inline-flex items-center gap-1 text-[11px] text-slate-400 dark:text-slate-500 transition-colors hover:text-slate-600 dark:hover:text-slate-300"
      title={value === "verified" ? "Show all counts, including bots the web of trust filters out" : "Show only web-of-trust-verified counts"}
      data-testid="stat-lens-toggle"
      data-mode={value}
    >
      <Eye className="h-3 w-3 shrink-0" aria-hidden />
      {value === "verified" ? "Show all" : "Show verified"}
    </button>
  );
}
