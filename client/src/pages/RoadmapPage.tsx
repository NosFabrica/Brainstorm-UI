import type { ComponentType } from "react";
import {
  Search,
  Bot,
  SlidersHorizontal,
  MessageSquareText,
  Users,
  BellRing,
  Eye,
  TrendingUp,
  MessageCircleQuestion,
  ShieldAlert,
  Network,
  Scale,
  Ruler,
  FlaskConical,
} from "lucide-react";
import { InfoPageLayout } from "@/components/InfoPageLayout";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { plannedByTheme, type RoadmapTheme } from "@/lib/plans";

/**
 * What's being built next — designed to be scanned, not read.
 *
 * Benjamin's review of the first version: the copy and the features are right,
 * the presentation is a wall of words. So the words stayed (every feature label
 * is verbatim from plans.ts) and the reading load moved into structure:
 *
 * - A large faint numeral per card. The closing note says "the order we think
 *   matters" — the numbering SHOWS that instead of asking anyone to read it.
 * - One hue per direction (cyan / purple / emerald), used on the icon tile and
 *   the item icons. Colour as category, per the brand rule — communicate, not
 *   decorate. Three directions is exactly the scale where hue still reads.
 * - An icon per item. Eleven small glyphs beat eleven identical dots because
 *   they give each line a shape to remember it by before it's been read.
 *
 * Icons live HERE, not in plans.ts — that module is pure data consumed by
 * tests, and React component references don't belong in it. The `key` contract
 * couples them; an item without an icon falls back to its theme's icon rather
 * than breaking.
 *
 * Blurbs were cut to one sentence each (in plans.ts). The feature lists are the
 * detail; a blurb's job is one breath of framing.
 */
const THEME_META: Record<
  RoadmapTheme,
  {
    icon: ComponentType<{ className?: string }>;
    numeral: string;
    tile: string;
    itemIcon: string;
  }
> = {
  search: {
    icon: Search,
    numeral: "01",
    tile: "bg-brand-accent/10 text-brand-accent",
    itemIcon: "text-brand-accent",
  },
  assistant: {
    icon: Bot,
    numeral: "02",
    tile: "bg-brand-primary/10 text-brand-primary dark:text-brand-link",
    itemIcon: "text-brand-primary dark:text-brand-link",
  },
  scoring: {
    icon: SlidersHorizontal,
    numeral: "03",
    tile: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    itemIcon: "text-emerald-600 dark:text-emerald-400",
  },
};

/** One glyph per feature key — a shape to remember the line by. */
const ITEM_ICONS: Record<string, ComponentType<{ className?: string }>> = {
  "content-search": MessageSquareText,
  "search-ranking": Users,
  "saved-searches": BellRing,
  "assistant-watch": Eye,
  "assistant-trends": TrendingUp,
  "assistant-rules": MessageCircleQuestion,
  "impersonation-watch": ShieldAlert,
  "custom-roots": Network,
  "signal-weights": Scale,
  "trust-distance": Ruler,
  "score-preview": FlaskConical,
};

export default function RoadmapPage() {
  return (
    <InfoPageLayout testId="page-roadmap">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        <PageHeader
          kicker="Roadmap"
          title={<>What we're <span className="text-brand-link">building next</span></>}
          subtitle="Three directions, one principle: a network of real people is a better filter than an algorithm built to hold your attention."
          testId="section-roadmap-header"
        />

        <div className="mt-8 grid gap-4 md:grid-cols-3" data-testid="roadmap-list">
          {plannedByTheme().map((group) => {
            const meta = THEME_META[group.key];
            const ThemeIcon = meta.icon;
            return (
              <Card
                key={group.key}
                className="relative p-5 h-full overflow-hidden"
                data-testid={`roadmap-theme-${group.key}`}
              >
                {/* The ordering, shown rather than said. */}
                <span
                  aria-hidden
                  className="absolute -top-3 right-2 text-[64px] font-bold leading-none text-slate-900/[0.05] dark:text-white/[0.06] select-none"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  {meta.numeral}
                </span>

                <div className={`inline-flex h-9 w-9 items-center justify-center rounded-xl ${meta.tile}`}>
                  <ThemeIcon className="h-[18px] w-[18px]" />
                </div>

                <h2
                  className="mt-3 text-[15px] font-bold text-slate-900 dark:text-slate-100 tracking-tight"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  {group.title}
                </h2>
                <p className="mt-1 text-[13px] leading-relaxed text-slate-500 dark:text-slate-400">
                  {group.blurb}
                </p>

                <ul className="mt-4 space-y-3">
                  {group.items.map((f) => {
                    const ItemIcon = ITEM_ICONS[f.key] ?? meta.icon;
                    return (
                      <li
                        key={f.key}
                        className="flex items-start gap-2.5 text-[13.5px] leading-snug text-slate-700 dark:text-slate-200"
                        data-testid={`roadmap-${f.key}`}
                      >
                        <ItemIcon className={`mt-0.5 h-4 w-4 shrink-0 ${meta.itemIcon}`} />
                        {f.label}
                      </li>
                    );
                  })}
                </ul>
              </Card>
            );
          })}
        </div>

        <p className="mt-8 text-xs text-slate-400 dark:text-slate-500 leading-relaxed max-w-2xl">
          Numbered by the order we think matters — it moves as we learn. Nothing
          here is on the pricing page as something you'd be paying for today.
        </p>
      </div>
    </InfoPageLayout>
  );
}
