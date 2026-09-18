/** The part of an admin user row that says whether their trust network is in place. */
export interface ReadinessRow {
  times_calculated?: number | null;
  latest_status?: string | null;
  last_updated?: string | null;
}

/**
 * Whether an observer's trust network is ready to build lists from. Trusted
 * Lists come from the observer's own Ranks, so until a calculation has
 * succeeded nobody qualifies and a publish comes back empty
 * ("no_qualifying_asserters"). Reads the row the way the Users tab does.
 */
export type Readiness =
  | { kind: "ready"; calculatedAt: string | null }
  | { kind: "never" }
  | { kind: "failed" }
  | { kind: "pending" };

export function readinessOf(row: ReadinessRow | null | undefined): Readiness {
  if (!row || !row.times_calculated) return { kind: "never" };
  const status = row.latest_status?.toLowerCase();
  if (status === "success") return { kind: "ready", calculatedAt: row.last_updated ?? null };
  if (status === "failure" || status === "failed" || status === "error") return { kind: "failed" };
  return { kind: "pending" };
}
