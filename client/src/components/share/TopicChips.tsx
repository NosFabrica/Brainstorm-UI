import { useLayoutEffect, useRef, useState } from "react";
import { useShareNav } from "@/components/share/ShareNavContext";

const CHIP_CLS = "shrink-0 whitespace-nowrap rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-[#3730a3]";
const GAP_PX = 6; // gap-1.5

/**
 * "Posts about" hashtag chips for the public profile hero — a LinkedIn-style
 * skills row from the person's most-used tags. Kept to a SINGLE line by showing
 * only the chips that FULLY fit (measured against the available width); any that
 * wouldn't fit are dropped entirely — never clipped or greyed mid-word. Tapping a
 * chip opens the hashtag-explore flow.
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
        if (used + w <= avail) { used += w; count += 1; } else break;
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
      <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Posts about</span>
      <div ref={areaRef} className="relative min-w-0 flex-1">
        {/* Invisible full-width copy used only to measure how many chips fit. */}
        <div ref={ghostRef} aria-hidden className="pointer-events-none invisible absolute left-0 top-0 flex flex-nowrap items-center gap-1.5">
          {topics.map((t) => (
            <span key={t} className={CHIP_CLS}>#{t}</span>
          ))}
        </div>
        <div className="flex flex-nowrap items-center gap-1.5 overflow-hidden">
          {topics.slice(0, visible).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => requestNav({ kind: "hashtag", target: `#${t}`, label: `#${t}` })}
              className={`${CHIP_CLS} transition-colors hover:bg-slate-200`}
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
