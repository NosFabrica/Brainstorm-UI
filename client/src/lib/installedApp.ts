import { isTouchScreen } from "@/lib/touchScreen";

/**
 * Running as an app installed to a phone's home screen — a PWA on iOS or Android, not
 * a browser tab. Browser extensions don't reach it: iOS runs Safari extensions in
 * Safari only, and Android's browsers have none to run. A desktop's installed app
 * does keep Chrome's extensions, hence the touch screen.
 */
export function isInstalledPhoneApp(): boolean {
  if (typeof window === "undefined" || !isTouchScreen()) return false;
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return iosStandalone || window.matchMedia?.("(display-mode: standalone)").matches === true;
}
