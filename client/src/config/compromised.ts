import type { CompromisedStatus } from "@/lib/compromised";

/**
 * Accounts we know are Compromised before the server can say so.
 *
 * The server's `/compromised` check is the record (services/compromised); this
 * list is what the UI shows until that check is deployed, and for an account
 * the server hasn't been told about yet. An entry here can't be cleared by the
 * server — remove it by hand once the server holds the record.
 *
 * Each entry needs the event that proves it: the owner saying so, signed
 * before the key changed hands.
 */
export const KNOWN_COMPROMISED: CompromisedStatus[] = [
  {
    pubkey: "3f770d65d3a764a9c5cb503ae123e62ec7598ad035d836e2a810f3877a745b24",
    since: 1794847395,
    proofEventId: "000005cbe61b41c9c027dbd6aa89cd8d41193af3a1fb89dfd03b7d866cdb35be",
    proofEvent: null,
    successorPubkey: null,
  },
];
