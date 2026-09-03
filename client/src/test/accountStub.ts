import type { AccountMetadata } from "@/accounts/metadata";

export type StubAccount = {
  id: string;
  pubkey: string;
  type: string;
  metadata: AccountMetadata;
};

/**
 * The Active Account as `services/api` needs it: an id, a pubkey, a type and the
 * metadata its Session lives on. Enough for the token the request carries and for
 * `clearSession` to take it away, without a Signer or the real manager.
 */
export function stubAccount(token?: string, pubkey = "a".repeat(64)): StubAccount {
  return {
    id: "acc-1",
    pubkey,
    type: "brainstorm-local",
    metadata: { remembered: true, ...(token ? { session: { token, isAdmin: false } } : {}) },
  };
}
