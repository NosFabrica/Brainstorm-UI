import { EntityMenu } from "@/components/share/EntityMenu";
import { originClientOf } from "@/lib/openInApp";
import type { MinimalEvent } from "@/lib/noteRefs";

/**
 * The ⋯ in the header: copies of the event's ids and "Open in" another client.
 * `origin`: the kind has no hero of its own, so its publishing client is worth
 * a way back to (the team, 2026-09-24: "open in original client").
 */
export function EventMenu({
  note,
  id,
  nevent,
  naddr,
  uri,
  shareUrl,
  mint,
  origin,
}: {
  note: MinimalEvent;
  id: string;
  nevent: string;
  naddr: string | null;
  uri: string;
  shareUrl: string;
  mint: () => Promise<string>;
  origin: boolean;
}) {
  return (
    <EntityMenu
      entity={{
        kind: "event",
        eventKind: note.kind,
        bech32: nevent,
        uri,
        origin: origin ? originClientOf(note) : undefined,
      }}
      copies={[
        { id: "link", label: "Copy link", value: shareUrl, mint },
        ...(naddr
          ? [
              {
                id: "naddr",
                label: "Copy naddr",
                value: naddr,
                hint: "Its address: always the latest version",
              },
            ]
          : []),
        { id: "nevent", label: "Copy nevent", value: nevent, hint: "The note's id plus where to find it" },
        { id: "event-id", label: "Copy event ID", value: id, hint: "The raw 64-character id" },
        // The event as fetched from the relay (sig included) — the cast to MinimalEvent is type-only.
        {
          id: "event-json",
          label: "Copy raw JSON",
          value: JSON.stringify(note, null, 2),
          hint: "The full signed event, as relays serve it",
        },
      ]}
      triggerTestId="event-menu"
    />
  );
}
