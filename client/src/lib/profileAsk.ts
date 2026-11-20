/**
 * The ask a profile is fetched under (`lib/askOnce`): one key per person, shared by every
 * hook that shows them and by the sign-in warm-up, which fetches the signed-in account's
 * own kind 0 alongside the rest of what that account reads.
 */
import type { AskWindow } from "./askOnce";

/**
 * How long one ask for a person's profile covers every hook that shows them:
 * 10–15 minutes, picked per ask so a page of hundreds asked together doesn't
 * come due together.
 */
export const PROFILE_ASK_WINDOW: AskWindow = { minMs: 10 * 60_000, spreadMs: 5 * 60_000 };

export const profileAskKey = (pubkey: string) => `profile:${pubkey}`;
