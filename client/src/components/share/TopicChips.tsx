import { useLayoutEffect, useRef, useState } from "react";
import { useShareNav } from "@/components/share/ShareNavContext";

// Text, not a pill: the pill shape belongs to tags ("Tagged as", ProfileTagChips).
const HASHTAG_CLS = "shrink-0 whitespace-nowrap text-xs font-semibold text-brand-link";
const GAP_PX = 10; // gap-2.5

/**
 * "Posts about": the person's most-used hashtags in the public profile hero, as
 * plain hashtag text. The row above it holds the tags other people gave them,
 * as pills; the two shapes are what tell a tag from a hashtag. Kept to a SINGLE
 * line by showing only the hashtags that FULLY fit (measured against the
 * available width); any that wouldn't fit are dropped entirely, never clipped
 * mid-word. Pressing one opens the hashtag-explore flow.
 */
export function TopicChips({ topics }: { topics: string[] }) {
  const requestNav = useShareNav();
  const areaRef = useRef<HTMLDivElement>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(topics.length);

  useLayoutEffect(() => {
    const area = areaRef.current;
    const ghost = ghostRef.current;
    if (!area || !ghost) return;
    const measure = () => {
      const avail = area.clientWidth;
      let used = 0;
      let count = 0;
      for (const chip of Array.from(ghost.children) as HTMLElement[]) {
        const w = chip.offsetWidth + (count > 0 ? GAP_PX : 0);
        if (used + w <= avail) {
          used += w;
          count += 1;
        } else break;
      }
      setVisible(Math.max(1, count));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(area);
    return () => ro.disconnect();
  }, [topics]);

  if (!topics.length) return null;

  return (
    <div className="mt-2.5 flex items-center gap-1.5 overflow-hidden" data-testid="share-topics">
      <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
        Posts about
      </span>
      <div ref={areaRef} className="relative min-w-0 flex-1">
        {/* Invisible full-width copy used only to measure how many chips fit. */}
        <div
          ref={ghostRef}
          aria-hidden
          className="pointer-events-none invisible absolute left-0 top-0 flex flex-nowrap items-center gap-2.5"
        >
          {topics.map((t) => (
            <span key={t} className={HASHTAG_CLS}>
              #{t}
            </span>
          ))}
        </div>
        <div className="flex flex-nowrap items-center gap-2.5 overflow-hidden">
          {topics.slice(0, visible).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => requestNav({ kind: "hashtag", target: `#${t}`, label: `#${t}` })}
              className={`${HASHTAG_CLS} underline-offset-2 hover:underline`}
              data-testid="share-topic-chip"
            >
              #{t}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
