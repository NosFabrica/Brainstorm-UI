const ADMIN_PUBKEYS: ReadonlySet<string> = new Set([
  "e2df2e26eb2d9e382e2ace6376dee945a03c40be1843af01244d1b4aba802e0d",
  "32e1827635450ebb3c5a7d12c1f8e7b2b514439ac10a67eef3d9fd9c5c68e245",
]);

const STAGING_MODE = true;

export function isAdminPubkey(pubkey: string | undefined | null): boolean {
  if (!pubkey) return false;
  if (STAGING_MODE) return true;
  return ADMIN_PUBKEYS.has(pubkey);
}
