/**
 * Which phone OS a visitor is on, read from the user agent (injectable, the
 * calendarLinks pattern). A `nostr:` link only does anything on a phone with
 * a Nostr app installed, and Amethyst exists only on Android — so the
 * "open in" offers differ by platform. An iPad asking for desktop pages
 * reads as a Mac; that miss is accepted, as it is for calendar links.
 */
const navUa = () => (typeof navigator !== "undefined" ? navigator.userAgent || "" : "");

export function isAndroid(ua: string = navUa()): boolean {
  return /Android/i.test(ua);
}

export function isIOS(ua: string = navUa()): boolean {
  return /iPhone|iPad|iPod/i.test(ua);
}

/** A phone OS with app schemes: Android or iOS. */
export function isPhoneOS(ua: string = navUa()): boolean {
  return isAndroid(ua) || isIOS(ua);
}
