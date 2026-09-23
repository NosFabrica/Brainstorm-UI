/** The admin page's sections, as `?tab=` names them. */
export type AdminTab =
  | "overview"
  | "users"
  | "health"
  | "activity"
  | "assistants"
  | "scheduling"
  | "billing"
  | "trusted-lists"
  | "support";

const ALWAYS: readonly AdminTab[] = ["users", "activity", "health", "scheduling", "billing", "trusted-lists", "support"];

/**
 * The section a `?tab=` value opens. Assistants only exists behind its feature
 * flag; anything unknown or switched off lands on Overview.
 */
export function parseAdminTab(value: string | null, opts: { assistants: boolean }): AdminTab {
  if (value && (ALWAYS as readonly string[]).includes(value)) return value as AdminTab;
  if (value === "assistants" && opts.assistants) return "assistants";
  return "overview";
}
