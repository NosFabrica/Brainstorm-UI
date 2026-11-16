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
    // Midnight UTC, Nov 16 2026. The owner's post (16:43 UTC that day) says the trouble began
    // "since midnight last night": an estimate from their words, so everything from that day counts.
    since: 1794787200,
    proofEventId: "000005cbe61b41c9c027dbd6aa89cd8d41193af3a1fb89dfd03b7d866cdb35be",
    proofEvent: null,
    // The owner's new account, confirmed by the owner (team, 2026-11-16) and announced from
    // both keys: the old one (event 0000047d…4b4e) and the new one, in the post below.
    successorPubkey: "6e479b7a5671f58a7a5d04ecedb00c1345b8918a8f8e270dc807ddb2818dba28",
    // The new account's post explaining the move.
    successorEventId: "55542ce61231067a76bb10b32a0ca5e2662416396e1a171feb88d7709c362e26",
  },
];
