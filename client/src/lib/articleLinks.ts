import { nip19 } from "nostr-tools";
import type { MinimalEvent } from "@/lib/noteRefs";

/**
 * Links + handoff for long-form articles (NIP-23) referenced on the share page.
 *
 * Reading strategy (decided with the team — Brainstorm is the destination, we do
 * NOT send readers to njump):
 *  - Primary "Read article" → our own on-site reader at `/a/:naddr` (renders the
 *    article professionally as a generous teaser, then funnels into an app).
 *  - "Open in app":
 *      • Android → try a `nostr:` deep link (opens an installed nostr app straight
 *        to the article); if nothing handles it, fall back to the Amethyst Play
 *        Store listing so they can install it.
 *      • iOS / desktop / everything else → Nostria web app (there's no iOS native
 *        target), opened in a new tab.
 */

export const AMETHYST_PLAY_URL =
  "https://play.google.com/store/apps/details?id=com.vitorpamplona.amethyst";
export const NOSTRIA_WEB_URL = "https://www.nostria.app/";

/** Encode an article event's `naddr` (kind:pubkey:dTag). Returns null on failure. */
export function naddrForEvent(event: MinimalEvent): string | null {
  try {
    const identifier = event.tags.find((t) => t[0] === "d")?.[1] ?? "";
    return nip19.naddrEncode({ kind: event.kind, pubkey: event.pubkey, identifier });
  } catch {
    return null;
  }
}

/**
 * Open an article in a native/web nostr app. Android attempts a `nostr:` deep
 * link and falls back to the Amethyst Play Store if no app handles it; every
 * other platform opens the Nostria web app.
 */
export function openArticleInApp(naddr: string): void {
  if (typeof window === "undefined" || !naddr) return;
  const isAndroid = /Android/i.test(navigator.userAgent || "");

  if (!isAndroid) {
    window.open(NOSTRIA_WEB_URL, "_blank", "noopener");
    return;
  }

  // Android: launch the scheme; if we're still here ~1.3s later (no app caught
  // it, page never backgrounded), send them to the store to install Amethyst.
  const startedAt = Date.now();
  const fallback = window.setTimeout(() => {
    if (!document.hidden && Date.now() - startedAt < 2000) {
      window.location.href = AMETHYST_PLAY_URL;
    }
  }, 1300);
  // If the app opened, the tab backgrounds → cancel the store redirect.
  document.addEventListener(
    "visibilitychange",
    () => { if (document.hidden) window.clearTimeout(fallback); },
    { once: true },
  );
  try {
    window.location.href = `nostr:${naddr}`;
  } catch {
    window.clearTimeout(fallback);
    window.location.href = AMETHYST_PLAY_URL;
  }
}
