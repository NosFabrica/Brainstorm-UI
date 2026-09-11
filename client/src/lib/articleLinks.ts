import { nip19 } from "nostr-tools";
import type { MinimalEvent } from "@/lib/noteRefs";

/**
 * Links for long-form articles (NIP-23) referenced on the share page.
 *
 * Reading strategy (decided with the team — Brainstorm is the destination, we do
 * NOT send readers to njump): the primary "Read article" goes to our own
 * on-site reader at `/a/:naddr`. Handing an article to ANOTHER client is
 * lib/openInApp's job (the ⋯ menu and the reader's not-found state), which
 * offers only clients verified to render the kind — the old
 * `openArticleInApp` here opened Nostria's homepage on a desktop.
 */

export const AMETHYST_PLAY_URL =
  "https://play.google.com/store/apps/details?id=com.vitorpamplona.amethyst";

/** Encode an article event's `naddr` (kind:pubkey:dTag). Returns null on failure. */
export function naddrForEvent(event: MinimalEvent): string | null {
  try {
    const identifier = event.tags.find((t) => t[0] === "d")?.[1] ?? "";
    return nip19.naddrEncode({ kind: event.kind, pubkey: event.pubkey, identifier });
  } catch {
    return null;
  }
}
