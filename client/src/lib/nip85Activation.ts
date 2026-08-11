// Per-Account record that the user has a published kind-10040 (NIP-85) declaring
// Brainstorm as their Web-of-Trust provider. It rides on the Account's metadata,
// so one account's activation can't bleed onto another on the same browser. We
// treat "we published it" (or a relay confirmed it) as the source of truth and
// never downgrade on a transient relay miss — relays are eventually-consistent,
// so an absence is not a deactivation.
import { accountFor } from "@/accounts/login";
import { identityHas } from "@/accounts/display";
import { updateMetadata } from "@/accounts/metadata";

export function isNip85Activated(pubkey?: string | null): boolean {
  return identityHas(pubkey, "nip85Activated");
}

export function markNip85Activated(pubkey?: string | null): void {
  const account = pubkey ? accountFor(pubkey) : undefined;
  if (account) updateMetadata(account, { nip85Activated: true });
}

export function clearNip85Activated(pubkey?: string | null): void {
  const account = pubkey ? accountFor(pubkey) : undefined;
  if (account) updateMetadata(account, { nip85Activated: undefined });
}
