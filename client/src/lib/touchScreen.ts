/**
 * A finger is the main pointer — a phone or tablet, where focusing a field brings up an
 * on-screen keyboard that covers half the page.
 */
export function isTouchScreen(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches === true;
}
