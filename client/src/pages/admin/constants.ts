/**
 * The whole-table reads (every user, every run in the range) are paged in
 * full each time, so they poll once a minute and only on the tabs that draw
 * them; elsewhere the header's figures read the last answer.
 */
export const POLL_OVERVIEW_MS = 60_000;
export const POLL_USERS_MS = 10_000;
export const POLL_ACTIVITY_MS = 10_000;
export const POLL_STATS_MS = 30_000;
export const BOOST_INTERVAL_MS = 4_000;
export const BOOST_DURATION_MS = 60_000;

export const PRIMARY_RELAY = "wss://dcosl.brainstorm.world";
export const NONE: never[] = [];
