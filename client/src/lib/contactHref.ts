/**
 * A fact's value as something to tap, when its definition didn't type the
 * field: a phone number calls, an email address mails, a web address opens.
 * Anything else is text. Guessing is kept narrow — a year, a short code or
 * opening hours must stay words — so a wrong link is rarer than a missing
 * one.
 */
const PHONE = /^\+?[\d\s().-]{7,}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BARE_URL = /^(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/\S*)?$/i;

export function contactHref(value: string | null | undefined): string | null {
  const s = (value ?? "").trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) {
    try {
      return new URL(s).href;
    } catch {
      return null;
    }
  }
  if (EMAIL.test(s)) return `mailto:${s}`;
  if (PHONE.test(s)) {
    const digits = s.replace(/[^\d+]/g, "").replace(/(?!^)\+/g, "");
    return digits.replace(/^\+?/, "").length >= 7 ? `tel:${digits}` : null;
  }
  if (BARE_URL.test(s)) return `https://${s}`;
  return null;
}
