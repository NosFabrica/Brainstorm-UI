import { Chip, type ChipProps } from "@/components/ui/chip";
import { kindLabel, type KindEvent } from "@/lib/kindLabel";

// KindPill — the pill that says what a thing is: Spec, Article, Listing, App …
// on every content card, row and tile (the team, 2026-09-24: a spec from Nostr
// Hub has no NIP number, so the kind's word is what tells a reader what they
// are looking at). One quiet slate chip — colour communicates, and a label is
// not a status — never for a person (the avatar already says that), and never
// a link: it sits inside cards that are links themselves.
//
//   <KindPill event={hit.event} />
//   <KindPill label="News" />            // where the content's shape is the label

export function KindPill({ event, label, tone = "slate", size = "sm", className, ...rest }: { event?: KindEvent; label?: string } & Omit<ChipProps, "children">) {
  const text = label ?? (event && event.kind !== 0 ? kindLabel(event) : undefined);
  if (!text) return null;
  return (
    <Chip tone={tone} size={size} className={`shrink-0 ${className ?? ""}`} data-testid="kind-pill" {...rest}>
      {text}
    </Chip>
  );
}
