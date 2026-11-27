/** The admin console's wire shapes (the backend's admin endpoints) and its table state. */

export type SortDir = "asc" | "desc";
export type PageSizeOption = 25 | 50 | 100;

export interface SortState {
  key: AdminSortKey;
  dir: SortDir;
}

export interface GrapeRankData {
  internal_publication_status?: string;
  ta_status?: string;
  status?: string;
  how_many_others_with_priority?: number;
  updated_at?: string;
  created_at?: string;
  count_values?: string | Record<string, Record<string, number>>;
  average?: number;
  score?: number;
  graperank?: number;
  result?: number;
  confidence?: number;
  value?: number;
}

export interface GrapeRankApiResponse {
  data?: GrapeRankData;
}

export interface AdminUserListItem {
  pubkey: string;
  ta_pubkey: string | null;
  times_calculated: number;
  last_triggered: string;
  last_updated: string;
  latest_status: string | null;
  latest_ta_status: string | null;
  latest_algorithm: string | null;
  scheduling_id: number | null;
  scheduling_name: string;
}

export interface AdminUsersPage {
  items: AdminUserListItem[];
  total: number;
  page: number;
  size: number;
  pages: number;
}

export interface GrapeRankError {
  code: string;
  message: string | null;
  /** "warning": caused by the user's own graph (e.g. no follows), not a fault of ours. */
  severity?: "warning" | "error";
}

export interface BrainstormRequestInstance {
  created_at: string;
  updated_at: string;
  private_id: number;
  status: string;
  ta_status: string | null;
  internal_publication_status: string | null;
  error: GrapeRankError | null;
  count_values: string | null;
  password: string;
  algorithm: string;
  parameters: string;
  how_many_others_with_priority: number;
  pubkey: string | null;
  trigger_source: string | null;
}

export interface AdminUserHistoryPage {
  items: BrainstormRequestInstance[];
  total: number;
  page: number;
  size: number;
  pages: number;
}

export type AdminSortKey = "pubkey" | "times_calculated" | "last_triggered" | "last_updated";

export interface RelayLatency {
  url: string;
  latencyMs: number | null;
  status: "connected" | "degraded" | "disconnected";
  checkedAt: Date;
}

/** The header card a directory filter came from. */
export type KpiFilter = "scored" | "sp_adopters" | "queue" | "failed";
