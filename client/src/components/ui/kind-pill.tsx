import { Chip, type ChipProps } from "@/components/ui/chip";
import { kindLabel, type KindEvent } from "@/lib/kindLabel";
import { technicalView } from "@/lib/technicalView";

// KindPill — the pill that says what a thing is: Spec, Article, Listing, App …
// on every content card, row and tile (the team, 2026-09-24: a spec from Nostr
// Hub has no NIP number, so the kind's word is what tells a reader what they
// are looking at). One quiet slate chip — colour communicates, and a label is
// not a status — never for a person (the avatar already says that), and never
// a link: it sits inside cards that are links themselves. By default only a
// spec is named, where it sits among other kinds (`mixed`) — the case with no
// NIP number to lean on. A signed-in reader who wants every kind named turns
// on labels everywhere (Settings › Advanced, lib/kindLabelsPref), and then
// every card says what it is — on a tab that holds one kind too.
//
//   <KindPill event={hit.event} />
//   <KindPill label="News" />            // where the content's shape is the label

export function KindPill({ event, label, mixed = true, tone = "slate", size = "sm", className, ...rest }: { event?: KindEvent; label?: string; /** Whether this surface mixes kinds. Where it holds one, the pill stays away — unless the reader asked for labels everywhere. */ mixed?: boolean } & Omit<ChipProps, "children">) {
  const everywhere = technicalView();
  // By default only a spec is named, and only where it sits among other
  // kinds — the case with no NIP number to lean on. Everything else waits
  // for the switch (Benjamin, 2026-09-24: "these should not be showing
  // unless the toggle is on").
  if (!everywhere && !(mixed && event?.kind === 30817)) return null;
  const text = label ?? (event && event.kind !== 0 ? kindLabel(event) : undefined);
  if (!text) return null;
  return (
    <Chip tone={tone} size={size} className={`shrink-0 ${className ?? ""}`} data-testid="kind-pill" {...rest}>
      {text}
    </Chip>
  );
}
