// Whether this Account said yes (or no) to publishing their NIP-85 kind-10040
// at the "calculate my scores" step. This is device-local *intent*, recorded
// before the publish happens — the published fact lives in `nip85Activation`
// (account metadata) and relays. Keeping the two apart means a consent given on
// a device that then failed to sign still drives the background retry, while a
// decline suppresses every automatic publish path, createdInApp included.
import { accountKey } from "@/lib/accountStorage";

export interface Nip85Consent {
  granted: boolean;
  at: number;
}

export function recordNip85Consent(pubkey: string | null | undefined, granted: boolean): void {
  if (!pubkey) return;
  try {
    localStorage.setItem(
      accountKey("brainstorm_nip85_consent", pubkey),
      JSON.stringify({ granted, at: Date.now() } satisfies Nip85Consent),
    );
  } catch { /* private browsing */ }
  // A decline is also a dismissal: the dashboard CTA's cooldown is the one
  // re-surface path, and it reads this timestamp.
  if (!granted) {
    try {
      localStorage.setItem(accountKey("brainstorm_nip85_dismissed_at", pubkey), String(Date.now()));
    } catch { /* private browsing */ }
  }
}

export function getNip85Consent(pubkey?: string | null): Nip85Consent | null {
  if (!pubkey) return null;
  try {
    const raw = localStorage.getItem(accountKey("brainstorm_nip85_consent", pubkey));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.granted !== "boolean") return null;
    return { granted: parsed.granted, at: Number(parsed.at) || 0 };
  } catch {
    return null;
  }
}

export function hasNip85Consent(pubkey?: string | null): boolean {
  return getNip85Consent(pubkey)?.granted === true;
}

export function hasDeclinedNip85(pubkey?: string | null): boolean {
  return getNip85Consent(pubkey)?.granted === false;
}
