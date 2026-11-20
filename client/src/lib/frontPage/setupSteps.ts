import type { ScoringStatus } from "@/hooks/useScoringStatus";

/**
 * The web of trust step before a paper. The server mints the reader's assistant at
 * sign-in, so having one says nothing about scores: the scoring status says whether a
 * calculation is running, finished, failed or never ran, and search ranking through the
 * assistant says the paper can use it.
 */
export type WotStep =
  | { state: "done" }
  /**
   * `setup`: no assistant yet. `uncalculated`: no calculation ran. `failed`: the last one
   * didn't finish. `activate`: scores are published, but the reader's kind 10040 doesn't
   * name Brainstorm, so search has no provider to rank through (the `observer:` lens
   * resolves the observer's NIP-85 rank service from it).
   */
  | { state: "todo"; why: "setup" | "uncalculated" | "failed" | "activate" }
  /** `indexing`: scores published, the search relay not ranking through them yet. */
  | { state: "pending"; phase: "calculating" | "publishing" | "indexing" };

export function wotStepOf({
  hasAssistant,
  ranked,
  scoring,
  activated,
}: {
  hasAssistant: boolean;
  /** Search ranks through the reader's assistant: what the paper reads. */
  ranked: boolean;
  scoring: ScoringStatus;
  /** The reader's kind 10040 names Brainstorm's assistant; undefined until the relays said. */
  activated?: boolean;
}): WotStep {
  if (!hasAssistant) return { state: "todo", why: "setup" };
  if (ranked) return { state: "done" };
  switch (scoring) {
    case "calculating":
    case "publishing":
      return { state: "pending", phase: scoring };
    case "ready":
      // Waiting for search only makes sense when it has a provider to rank through.
      return activated === false ? { state: "todo", why: "activate" } : { state: "pending", phase: "indexing" };
    case "failed":
      return { state: "todo", why: "failed" };
    default:
      return { state: "todo", why: "uncalculated" };
  }
}
