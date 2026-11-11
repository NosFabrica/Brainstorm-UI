import type { ScoringStatus } from "@/hooks/useScoringStatus";

/**
 * The web of trust step before a paper. The server mints the reader's assistant at
 * sign-in, so having one says nothing about scores: the scoring status says whether a
 * calculation is running, finished, failed or never ran, and search ranking through the
 * assistant says the paper can use it.
 */
export type WotStep =
  | { state: "done" }
  /** `setup`: no assistant yet. `uncalculated`: no calculation ran. `failed`: the last one didn't finish. */
  | { state: "todo"; why: "setup" | "uncalculated" | "failed" }
  /** `indexing`: scores published, the search relay not ranking through them yet. */
  | { state: "pending"; phase: "calculating" | "publishing" | "indexing" };

export function wotStepOf({
  hasAssistant,
  ranked,
  scoring,
}: {
  hasAssistant: boolean;
  /** Search ranks through the reader's assistant: what the paper reads. */
  ranked: boolean;
  scoring: ScoringStatus;
}): WotStep {
  if (!hasAssistant) return { state: "todo", why: "setup" };
  if (ranked) return { state: "done" };
  switch (scoring) {
    case "calculating":
    case "publishing":
      return { state: "pending", phase: scoring };
    case "ready":
      return { state: "pending", phase: "indexing" };
    case "failed":
      return { state: "todo", why: "failed" };
    default:
      return { state: "todo", why: "uncalculated" };
  }
}
