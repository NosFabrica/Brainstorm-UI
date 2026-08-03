// Lightning / NIP-57 zap helpers — LNURL-pay resolution, zap-request
// construction, invoice fetching, and WebLN payment.
//
// The UI works in SATS; the LNURL protocol speaks MILLISATS (1 sat = 1000 msat).
// Always convert at the boundary. These functions are framework-free; the React
// layer (ZapModal) handles signing via the app's signer and the UI state.

import type { EventTemplate } from "applesauce-core/helpers";

export const satsToMsat = (sats: number) => Math.round(sats * 1000);
export const msatToSats = (msat: number) => Math.floor(msat / 1000);

export interface LnurlPayParams {
  callback: string;
  minSendable: number; // msat
  maxSendable: number; // msat
  metadata: string;
  commentAllowed: number;
  allowsNostr: boolean;
  nostrPubkey?: string;
  domain: string;
  lnurlUrl: string; // the raw https lnurlp URL (used in the zap-request `lnurl` tag)
}

/** Thrown when the lightning provider can't be reached or returns bad data —
 *  the modal treats this as "fall back to the address QR", not a hard error. */
export class LnurlError extends Error {}

export const lightningUriForAddress = (lud16: string) => `lightning:${lud16}`;
export const lightningUriForInvoice = (pr: string) => `lightning:${pr}`;

/** Resolve a lightning address (`name@domain`) to its LNURL-pay parameters. */
export async function lnurlpFromAddress(lud16: string): Promise<LnurlPayParams> {
  const addr = lud16.trim().toLowerCase();
  const [name, domain] = addr.split("@");
  if (!name || !domain) throw new LnurlError("Invalid lightning address");
  const lnurlUrl = `https://${domain}/.well-known/lnurlp/${name}`;
  let json: Record<string, unknown>;
  try {
    const res = await fetch(lnurlUrl, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new LnurlError(`Provider returned ${res.status}`);
    json = await res.json();
  } catch (e) {
    if (e instanceof LnurlError) throw e;
    throw new LnurlError(e instanceof Error ? e.message : "Could not reach the lightning provider");
  }
  if (json?.tag !== "payRequest" || typeof json.callback !== "string") {
    throw new LnurlError("Not a valid lightning-pay endpoint");
  }
  return {
    callback: json.callback as string,
    minSendable: Number(json.minSendable) || 1000,
    maxSendable: Number(json.maxSendable) || 100_000_000_000,
    metadata: typeof json.metadata === "string" ? json.metadata : "",
    commentAllowed: Number(json.commentAllowed) || 0,
    allowsNostr: json.allowsNostr === true,
    nostrPubkey: typeof json.nostrPubkey === "string" ? json.nostrPubkey : undefined,
    domain,
    lnurlUrl,
  };
}

/** Build the unsigned NIP-57 kind-9734 zap request. The caller signs it (with
 *  the user's key when attributed, or a throwaway ephemeral key when anonymous —
 *  for anonymous zaps pass `anon: true` so clients show the zapper as
 *  "Anonymous" instead of the throwaway npub). */
export function buildZapRequest(opts: {
  recipientPubkey: string;
  amountMsat: number;
  lnurl: string;
  relays: string[];
  comment?: string;
  anon?: boolean;
}): EventTemplate {
  const tags: string[][] = [
    ["relays", ...opts.relays], // one tag, URLs spread inline (NIP-57)
    ["amount", String(opts.amountMsat)], // millisats, string
    ["lnurl", opts.lnurl],
    ["p", opts.recipientPubkey], // hex
  ];
  if (opts.anon) tags.push(["anon", ""]); // anonymous-zap convention (Damus/Amethyst)
  // No `pubkey` — whoever signs stamps their own.
  return {
    kind: 9734,
    content: opts.comment ?? "",
    created_at: Math.floor(Date.now() / 1000),
    tags,
  };
}

/** Call the LNURL callback for a bolt11 invoice. With a signed zap request the
 *  note rides inside it (no separate comment param). */
export async function requestInvoice(opts: {
  callback: string;
  amountMsat: number;
  comment?: string;
  commentAllowed?: number;
  signedZapRequest?: Record<string, unknown>;
}): Promise<string> {
  const sep = opts.callback.includes("?") ? "&" : "?";
  let url = `${opts.callback}${sep}amount=${opts.amountMsat}`;
  if (opts.signedZapRequest) {
    url += `&nostr=${encodeURIComponent(JSON.stringify(opts.signedZapRequest))}`;
  } else if (opts.comment && (opts.commentAllowed ?? 0) > 0) {
    url += `&comment=${encodeURIComponent(opts.comment.slice(0, opts.commentAllowed))}`;
  }
  let json: Record<string, unknown>;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    json = await res.json();
  } catch (e) {
    throw new LnurlError(e instanceof Error ? e.message : "Could not reach the lightning provider");
  }
  if (json?.status === "ERROR" || typeof json?.pr !== "string") {
    throw new LnurlError((json?.reason as string) || "Could not create an invoice");
  }
  return json.pr as string;
}

// --- WebLN (browser lightning wallet, e.g. Alby) ---
declare global {
  interface Window {
    webln?: {
      enable: () => Promise<void>;
      sendPayment: (invoice: string) => Promise<{ preimage: string }>;
    };
  }
}

export const isWebLNAvailable = () => typeof window !== "undefined" && typeof window.webln !== "undefined";

export async function payWithWebLN(invoice: string): Promise<{ ok: boolean; preimage?: string; error?: string }> {
  if (!isWebLNAvailable()) return { ok: false, error: "No browser wallet" };
  try {
    await window.webln!.enable();
    const r = await window.webln!.sendPayment(invoice);
    return { ok: true, preimage: r?.preimage };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Payment failed" };
  }
}
