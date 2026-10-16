/**
 * A phone number as a call, an email address as a mail, read from the value
 * alone: tier three's fallback when a header didn't type the field `tel` or
 * `email` (a place's Call button, PlaceView). Tier two never guesses: a fact
 * links only when its field's type says so (dlistFields `telHref`,
 * `emailHref`). Guessing is kept narrow — a year, a short code or opening
 * hours must stay words — so a wrong link is rarer than a missing one.
 */
const PHONE = /^\+?[\d\s().-]{7,}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function contactHref(value: string | null | undefined): string | null {
  const s = (value ?? "").trim();
  if (!s) return null;
  if (EMAIL.test(s)) return `mailto:${s}`;
  if (PHONE.test(s)) {
    const digits = s.replace(/[^\d+]/g, "").replace(/(?!^)\+/g, "");
    return digits.replace(/^\+?/, "").length >= 7 ? `tel:${digits}` : null;
  }
  return null;
}
