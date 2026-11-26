import type { BrainstormRequestInstance, GrapeRankError } from "./types";

export function isWarningItem(item: { error?: GrapeRankError | null }): boolean {
  return item.error?.severity === "warning";
}

/** A failed calc that isn't a warning: what the dashboard counts as a failure. */
export function isFailedActivity(item: { status?: string | null; error?: GrapeRankError | null }): boolean {
  return isFailedStatus(item.status) && !isWarningItem(item);
}

export type FailureStage = "calculation" | "ta" | "publication";

export const FAILURE_STAGE_HINTS: Record<FailureStage, { label: string; hint: string }> = {
  calculation: {
    label: "Calculation",
    hint: "Common causes: user has too few trusted follows for graperank to converge, invalid algorithm parameters, or a calculation timeout. Re-trigger first; if it fails again, check server logs for the algorithm worker.",
  },
  ta: {
    label: "Trust Attestation",
    hint: "Common causes: TA pubkey unreachable or not configured. Check relay status and TA service health.",
  },
  publication: {
    label: "Publication",
    hint: "Common causes: relay outage, signing failure, or rate limiting. Check that the publisher is reaching at least one configured relay.",
  },
};

export function pickFailureStage(opts: {
  statusFailed: boolean;
  taFailed: boolean;
  pubFailed: boolean;
}): FailureStage | null {
  if (opts.statusFailed) return "calculation";
  if (opts.taFailed) return "ta";
  if (opts.pubFailed) return "publication";
  return null;
}

export function parseIsoMs(iso: string): number {
  return new Date(iso.endsWith("Z") ? iso : iso + "Z").getTime();
}

export function getActivityPipelineState(item: BrainstormRequestInstance) {
  const s = item.status?.toLowerCase() ?? "";
  if (s === "ongoing" || s === "in_progress" || s === "processing") return "active" as const;
  if (s === "waiting" || s === "queued" || s === "pending") return "waiting" as const;
  if (s === "failure" || s === "failed" || s === "error")
    return isWarningItem(item) ? ("warning" as const) : ("failed" as const);
  return "complete" as const;
}

export function isFailedStatus(value: string | null | undefined): boolean {
  if (!value) return false;
  const v = value.toLowerCase();
  return v === "failure" || v === "failed" || v === "error";
}

export function isItemFailed(item: BrainstormRequestInstance): boolean {
  if (isWarningItem(item)) return false;
  return (
    isFailedStatus(item.status) || isFailedStatus(item.ta_status) || isFailedStatus(item.internal_publication_status)
  );
}

export function getFailureStage(
  item: BrainstormRequestInstance,
): "Calculation" | "Trust Attestation" | "Publication" | null {
  if (isFailedStatus(item.status)) return "Calculation";
  if (isFailedStatus(item.ta_status)) return "Trust Attestation";
  if (isFailedStatus(item.internal_publication_status)) return "Publication";
  return null;
}

export function extractErrorMessage(item: BrainstormRequestInstance): string {
  const raw = item.error?.message?.trim();
  if (raw) return raw;
  const stage = getFailureStage(item);
  if (stage)
    return `No error details recorded for the ${stage} stage. Re-trigger this user to capture a fresh error message, or open the full request to inspect server logs.`;
  return "No error details recorded. Re-trigger this user to capture a fresh error message, or open the full request to inspect server logs.";
}

export function normalizeErrorKey(text: string): string {
  return text
    .toLowerCase()
    .replace(/0x[0-9a-f]{6,}/g, "<hex>")
    .replace(/\b[0-9a-f]{16,}\b/g, "<hex>")
    .replace(/\b\d{4,}\b/g, "<n>")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}
