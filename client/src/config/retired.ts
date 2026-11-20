import type { RetiredStatus } from "@/lib/retired";

/**
 * Accounts we know are Retired, until the server holds the record.
 *
 * The server has no retired check yet (services/retired); this list is what
 * the UI shows meanwhile. Each entry is the owner's own word to the team:
 * which account they stopped using, and which one they use now.
 */
export const KNOWN_RETIRED: RetiredStatus[] = [
  {
    // An owner's first account, from 2022: one note, and it follows their current one.
    pubkey: "3cddee78ad379131cf633de94f6ca325d91d73e0d8f79fb90d7849487d3e5ac5",
    currentPubkey: "460c25e682fda7832b52d1f22d3d22b3176d972f60dcdc3212ed8c92ef85065c",
  },
];
