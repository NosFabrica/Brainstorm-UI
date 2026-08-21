// Per-Account record that the user has a published kind-10040 (NIP-85) declaring
// Brainstorm as their Web-of-Trust provider. It rides on the Account's metadata,
// so one account's activation can't bleed onto another on the same browser. We
// treat "we published it" (or a relay confirmed it) as the source of truth and
// never downgrade on a transient relay miss — relays are eventually-consistent,
// so an absence is not a deactivation.
import { accountsFor } from "@/accounts/login";
import { identityHas } from "@/accounts/display";
import { updateMetadata } from "@/accounts/metadata";

export function isNip85Activated(pubkey?: string | null): boolean {
  return identityHas(pubkey, "nip85Activated");
}

// Every row, because the read is `identityHas` — true if *any* row for this
// pubkey carries the flag. Activation is a fact about the identity (the
// kind-10040 is published under its pubkey), not about which Signer holds the
// key, and `adoptAccount` deliberately lets one identity hold both an extension
// row and a local one. Writing a single row meant Settings could deactivate and
// the CTA would still read as activated, so it never came back.
function setNip85(pubkey: string | null | undefined, value: true | undefined): void {
  if (!pubkey) return;
  for (const account of accountsFor(pubkey)) updateMetadata(account, { nip85Activated: value });
}

export function markNip85Activated(pubkey?: string | null): void {
  setNip85(pubkey, true);
}

export function clearNip85Activated(pubkey?: string | null): void {
  setNip85(pubkey, undefined);
}
