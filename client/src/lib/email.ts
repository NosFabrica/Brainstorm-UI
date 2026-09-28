/**
 * Good-enough email shape check for OPTIONAL notification addresses: one @,
 * no spaces, a dotted domain. Deliverability is the mail server's problem —
 * the only goal here is catching typos before they cost someone their reply
 * notifications.
 */
export function isValidEmail(raw: string): boolean {
  const s = (raw || "").trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);
}
