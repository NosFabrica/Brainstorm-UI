/**
 * A fact's value as something to tap, when its definition didn't type the
 * field: a phone number calls, an email address mails. Anything else is
 * text — a web address links only when the field is typed `url`, since
 * whether a value is a link is the definition's call (dlistFields), and the
 * list editor shows exactly that change of type. Guessing is kept narrow — a
 * year, a short code or opening hours must stay words — so a wrong link is
 * rarer than a missing one.
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
