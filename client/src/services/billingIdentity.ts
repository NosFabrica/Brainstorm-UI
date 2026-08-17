// The pubkey ↔ billing-email mapping.
//
// ## Why this is its own module
//
// It is the single link between a payment and an account, and it is fragile.
// Flash's hosted signup collects an email and nothing else — no external-id
// field, and every documented pre-fill parameter is ignored (probed against the
// live page: `?params=<base64>`, and plain `?email=&npub=&external_uuid=`, all
// left the form empty). So when the webhook arrives it carries an email, and
// the backend has to turn that into a pubkey.
//
// Storing it here means the backend can be handed the pairing the moment its
// endpoint exists, and means support can see what address someone actually used
// when a payment goes unmatched.
//
// Local-only for now. When `POST /user/billing-email` ships, `rememberBillingEmail`
// is the one place that changes — everything else already calls through it.
//
// Normalising matters more than it looks: `Ben@Example.com ` and
// `ben@example.com` are the same mailbox to every mail server on earth, and an
// exact-match lookup against an unnormalised value is a person who paid and got
// nothing.

const KEY = "brainstorm_billing_email";

export interface BillingIdentity {
  pubkey: string | null;
  email: string;
  /** ISO — how support tells a fresh attempt from a stale one. */
  savedAt: string;
}

/** Trim + lowercase. The only form we ever store or compare. */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function rememberBillingEmail(pubkey: string | null, rawEmail: string): void {
  const email = normalizeEmail(rawEmail);
  if (!email) return;
  const record: BillingIdentity = {
    pubkey,
    email,
    savedAt: new Date().toISOString(),
  };
  try {
    localStorage.setItem(KEY, JSON.stringify(record));
  } catch {
    /* storage disabled — the address still rides to Flash, it just isn't cached */
  }
}

export function readBillingEmail(): BillingIdentity | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<BillingIdentity>;
    if (typeof parsed?.email !== "string" || !parsed.email) return null;
    return {
      pubkey: typeof parsed.pubkey === "string" ? parsed.pubkey : null,
      email: normalizeEmail(parsed.email),
      savedAt: typeof parsed.savedAt === "string" ? parsed.savedAt : "",
    };
  } catch {
    return null;
  }
}

export function clearBillingEmail(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
