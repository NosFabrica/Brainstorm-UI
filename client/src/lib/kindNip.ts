/**
 * Which NIP defines a kind — for the kinds fiatjaf's `nips` repo defines, and
 * only those. A spec published through Nostr Hub, or an app's own kind, has
 * no NIP number, and none is ever invented (the team, 2026-09-24). Shown on
 * hover in the technical view; never used to label anything.
 */
const NIP_BY_KIND: Record<number, string> = {
  0: "NIP-01", 1: "NIP-01", 3: "NIP-02", 4: "NIP-04", 5: "NIP-09", 6: "NIP-18", 16: "NIP-18", 7: "NIP-25",
  8: "NIP-58", 30008: "NIP-58", 30009: "NIP-58",
  11: "NIP-29", 14: "NIP-17", 1059: "NIP-59", 10050: "NIP-17",
  20: "NIP-68", 21: "NIP-71", 22: "NIP-71", 34235: "NIP-71", 34236: "NIP-71",
  1063: "NIP-94", 1111: "NIP-22", 1984: "NIP-56", 1985: "NIP-32",
  1617: "NIP-34", 1618: "NIP-34", 1621: "NIP-34", 30617: "NIP-34",
  9734: "NIP-57", 9735: "NIP-57",
  10000: "NIP-51", 10003: "NIP-51", 10015: "NIP-51", 30000: "NIP-51", 30001: "NIP-51", 30003: "NIP-51", 30015: "NIP-51",
  10002: "NIP-65", 10040: "NIP-85", 30382: "NIP-85",
  13194: "NIP-47", 23194: "NIP-47", 23195: "NIP-47",
  30023: "NIP-23", 30024: "NIP-23", 30078: "NIP-78", 30311: "NIP-53", 30312: "NIP-53", 30313: "NIP-53",
  30315: "NIP-38", 30402: "NIP-99", 30818: "NIP-54", 31922: "NIP-52", 31923: "NIP-52", 31924: "NIP-52", 31990: "NIP-89",
  1337: "NIP-C0", 30040: "NIP-62", 30041: "NIP-62",
};

export function nipForKind(kind: number): string | undefined {
  return NIP_BY_KIND[kind];
}
