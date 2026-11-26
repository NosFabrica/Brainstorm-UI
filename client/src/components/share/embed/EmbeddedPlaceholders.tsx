import { kindLabel } from "@/lib/kindLabel";
import type { MinimalEvent } from "@/lib/noteRefs";

/** NIP-31: what a client that cannot read the kind should say it is. */
const altOf = (event: MinimalEvent) => event.tags.find((t) => t[0] === "alt")?.[1]?.trim() || undefined;

/** Ciphertext (a private follow set, a sealed list) is not for reading: the card says so. */
export function EmbeddedSealed() {
  return (
    <p className="text-sm italic text-slate-500 dark:text-slate-400" data-testid="embedded-sealed">
      Encrypted — only its owner can read it
    </p>
  );
}

/** JSON (a profile, app data) or nothing at all (a contact list): one line says what it is. */
export function EmbeddedStructural({ event }: { event: MinimalEvent }) {
  return (
    <p className="truncate text-sm text-slate-500 dark:text-slate-400" data-testid="embedded-structural">
      {kindLabel(event)}
      {altOf(event) ? ` — ${altOf(event)}` : ""}
    </p>
  );
}
