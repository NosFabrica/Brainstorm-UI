/**
 * What Settings reads off the Account's last GrapeRank run (`/user/graperankResult`)
 * and its history (`/user/history`): whether one is running or failed, the status
 * word to show, when it last ran and was asked for, and the Assistant's key.
 */
export interface CalcRun {
  status?: string | null;
  ta_status?: string | null;
  internal_publication_status?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
}

export interface CalcHistory {
  last_time_calculated_graperank?: string | null;
  last_time_triggered_graperank?: string | null;
  ta_pubkey?: string | null;
}

export function calcStatusOf(run: CalcRun | null | undefined, history: CalcHistory | null | undefined) {
  return {
    isRecalcInProgress: run?.internal_publication_status === "waiting" || run?.status === "waiting",
    isGrapeRankFailedState:
      (typeof run?.status === "string" && run.status.toLowerCase() === "failure") ||
      (typeof run?.ta_status === "string" && run.ta_status.toLowerCase() === "failure"),
    grapeRankStatus: run?.ta_status || run?.status || null,
    lastCalculated: history?.last_time_calculated_graperank || run?.updated_at || null,
    lastTriggered: history?.last_time_triggered_graperank || run?.created_at || null,
    taPubkey: history?.ta_pubkey || null,
  };
}

/** A server time as "Nov 2, 2026, 10:30 AM"; a zoneless one is read as UTC. */
export function formatCalcTime(value: string): string {
  return new Date(typeof value === "string" && !value.endsWith("Z") ? value + "Z" : value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
