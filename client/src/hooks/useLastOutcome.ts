import { useMutationState, type MutationKey } from "@tanstack/react-query";

/** Where a publish stands: under way, or how it ended. */
export type PublishOutcome = "pending" | "success" | "error";

/**
 * How the newest mutation under `mutationKey` stands, whichever component
 * started it; null before any. Lets one surface see a publish another started
 * — Account Setup's rows and count see the background publish
 * (components/AutoAssistantSetup).
 */
export function useLastOutcome(mutationKey: MutationKey): PublishOutcome | null {
  const outcomes = useMutationState({ filters: { mutationKey }, select: (m) => m.state.status });
  const last = outcomes.at(-1);
  return last === "pending" || last === "success" || last === "error" ? last : null;
}
