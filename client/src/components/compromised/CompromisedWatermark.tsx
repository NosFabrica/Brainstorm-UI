import { useCompromised } from "@/hooks/useCompromised";
import { contentStanding } from "@/lib/compromised";
import { cn } from "@/lib/utils";

/**
 * A faint "COMPROMISED" stamp across a compromised account's content, only
 * while the reader's pointer is on it.
 *
 * The account's own profile card wears it from the moment the page opens
 * (`when="view"`): the account is what is compromised, whatever is posted.
 * Content posted after the compromise wears it, the owner's own post about
 * it included: that is the content that went out with the key in two hands.
 * What they posted before stays clean — the ring, the chip and the notice
 * already say whose account it is.
 *
 * A second layer, never the message: the chip and the notices say it in
 * words. It has to stay out of the way, because what the owner posted before
 * the key changed hands is still worth reading — so it is hover-only, low
 * contrast, takes no clicks and is hidden from screen readers. And it does not
 * stay: it shows for about two seconds, then settles to a trace for as long as
 * the pointer rests there, so a reader who stays to read is left to read.
 *
 * The stamp is the chip's own shape — the shield and the word in an outlined
 * pill — tilted and laid in offset rows, so it reads as a mark put on the
 * content and not as text that belongs to it.
 *
 * The content's container opts in with `WATERMARK_HOST` (a positioned hover
 * group) and renders this as a child. A marked container inside another marked
 * one — a note card inside its page's card — leaves the mark to the outer one,
 * so the stamp is never laid twice over the same lines.
 */
export const WATERMARK_HOST = "cw-host group/cw relative";

// lucide's shield-alert, as on the chip.
const SHIELD =
  "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1zM12 8v4M12 16h.01";

/** One stamp, centred on (cx, cy): pill outline, shield, word. */
function stamp(cx: number, cy: number): string {
  return (
    `<g transform="rotate(-16 ${cx} ${cy}) translate(${cx - 84} ${cy - 14})">` +
    `<rect x="0.75" y="0.75" width="166.5" height="26.5" rx="13.25" fill="none" stroke-width="1.5"/>` +
    `<path d="${SHIELD}" transform="translate(11 6.5) scale(0.625)" fill="none" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<text x="34" y="18.2" font-family="ui-sans-serif,system-ui,sans-serif" font-size="11" font-weight="700" letter-spacing="2.6" stroke="none">COMPROMISED</text>` +
    `</g>`
  );
}

/** Two stamps a tile, the second half a tile across and down: offset rows, never a grid of columns. */
function tile(color: string, opacity: number): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="260">` +
    `<g stroke="${color}" fill="${color}" opacity="${opacity}">${stamp(90, 65)}${stamp(270, 195)}</g></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

// Tuned per ground: red-600 on light surfaces, the lighter red-400 on dark ones, where 600 sinks.
const LIGHT = tile("#dc2626", 0.3);
const DARK = tile("#f87171", 0.34);

export function CompromisedWatermark({
  pubkey,
  postedAt,
  eventId,
  when = "hover",
  className,
}: {
  pubkey: string | null | undefined;
  /** The content's created_at, epoch seconds. */
  postedAt?: number;
  eventId?: string;
  /** `hover` for a piece of content; `view` for the account's own page, which plays it as the page opens. */
  when?: "hover" | "view";
  className?: string;
}) {
  const status = useCompromised(pubkey);
  // Not on what the owner posted before the compromise: a stamp over their earlier work
  // would call their real words suspect, and a mark on everything is one readers stop
  // seeing. Their own post about it is stamped — the key was already taken when it went out.
  if (!status || contentStanding(status, { postedAt, eventId }) === "before") return null;
  return (
    <span
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-0 z-10 overflow-hidden rounded-[inherit] opacity-0 [.cw-host:has(>[data-cw])_.cw-host_&]:hidden",
        // Fade in, hold about two seconds, then ease down to a trace and stay there (cw-settle,
        // index.css). Reduced motion skips straight to the trace.
        when === "view"
          ? // The account's own page: once, when it is opened, and the trace stays.
            "motion-safe:animate-[cw-settle_4.2s_cubic-bezier(0.4,0,0.2,1)_forwards] motion-reduce:opacity-30"
          : // Content: while the pointer is on it; pointer away, and it fades out.
            "transition-opacity duration-500 ease-out motion-safe:group-hover/cw:animate-[cw-settle_4.2s_cubic-bezier(0.4,0,0.2,1)_forwards] motion-reduce:transition-none motion-reduce:group-hover/cw:opacity-30",
        className,
      )}
      data-cw=""
      data-testid="compromised-watermark"
    >
      <span className="absolute inset-0 dark:hidden" style={{ backgroundImage: LIGHT }} />
      <span className="absolute inset-0 hidden dark:block" style={{ backgroundImage: DARK }} />
    </span>
  );
}
