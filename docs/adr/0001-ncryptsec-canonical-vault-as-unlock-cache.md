# ncryptsec is the canonical key-at-rest form; skVault is demoted to an unlock cache

Accounts whose key we hold were stored as a WebCrypto envelope wrapped by a
non-extractable device key in IndexedDB (`lib/skVault.ts`). That is silent and
safe against anything reading `localStorage`, but it is device-bound: an account
created in-app existed only in that browser, so a User who never exported a
backup could lose the identity outright — and the sign-out flow had to grow a
"save a backup first?" wall because of it.

We are making the NIP-49 **ncryptsec** the canonical at-rest form. It is
portable, standard, and it *is* the Backup — the same artefact we store and the
User exports — so an account that can be signed with is an account that can be
recovered. skVault stays, but demoted: it now caches an already-unlocked key so
later page loads need no Recovery password. It holds no authority the ncryptsec
does not already hold, and losing it costs convenience, not the account.

## Considered options

**PasswordAccount alone, deleting skVault** was the simplest steady state and
made portability true by construction. We rejected it on the transition and on
the failure mode: existing users hold a vault envelope and no password, so
migration needed a blocking interstitial; `PasswordSigner` has no silent unlock,
so every page load would prompt; and a forgotten Recovery password would lock a
User out of a device they were still signed into. That trades one dead-end for
another.

**Keeping skVault as the only form** is where we were, and preserves the
device-bound dead-end this change exists to remove.

## Consequences

Both fields are optional on a stored account, which is deliberate and gives four
real states, all of which must work: both present (new signups — portable and
silent); envelope only (users migrated from the old scheme, and session-only
logins, which write an envelope to `sessionStorage` so no path stores a plaintext
key); ncryptsec only (restored on a new device, or private browsing where
IndexedDB is unavailable — portable but prompts each page load); neither (an
external Signer, which stores no secret at all).

Minting an ncryptsec needs a password the User has to choose, so new account
creation gains a Recovery password step. Existing users are nagged rather than
blocked — their envelope still decrypts silently, so they keep working — which
means some accounts stay device-bound until the User acts. Pasting an nsec does
not nag: that User already holds their own key.

An account in the ncryptsec-only state starts every page load Locked, so
background publishing must tolerate being unable to sign. See
`AutoActivateBrainstorm`.
