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
  MapPin,
} from "lucide-react";
import { InfoPageLayout } from "@/components/InfoPageLayout";
import { PageHeader } from "@/components/PageHeader";
import { plannedByTheme, type RoadmapTheme } from "@/lib/plans";

/**
 * The roadmap as a road: one vertical journey with three numbered stops on a
 * gradient rail, instead of three columns racing each other.
 *
 * Benjamin's second design pass: the equal-columns grid read as a comparison
 * table — three boxes competing for the same glance — when the content is a
 * SEQUENCE ("numbered by the order we think matters"). A journey down the page
 * says that structurally: you scroll it the way the work ships, and each stop
 * gets the full content width instead of a third of it, so the feature lists
 * breathe into two columns.
 *
 * The rail is the same idiom the product already speaks — the hops path renders
 * connection as a thread through avatars; here the thread runs through the
 * milestones, tinted from cyan through brand purple to emerald so the gradient
 * itself walks the three stops' hues. The rail starts at a "today" pin (the
 * journey begins from the product you're using) and fades out after 03 rather
 * than ending — unfinished on purpose.
 *
 * Still no header icons (cut last pass): the numeral IS the node, sitting on
 * the rail where an ordering mark belongs. Item glyphs stay — they're the
 * scanning aid, and with two-column room they finally sit on one line each.
 */
const THEME_META: Record<
  RoadmapTheme,
  {
    /** Per-item fallback when a feature key has no glyph of its own. */
    icon: ComponentType<{ className?: string }>;
    numeral: string;
    node: string;
    itemIcon: string;
  }
> = {
  search: {
    icon: Search,
    numeral: "01",
    node: "border-brand-accent/50 text-brand-accent",
    itemIcon: "text-brand-accent",
  },
  assistant: {
    icon: Bot,
    numeral: "02",
    node: "border-brand-primary/50 text-brand-primary dark:text-brand-link",
    itemIcon: "text-brand-primary dark:text-brand-link",
  },
  scoring: {
    icon: SlidersHorizontal,
    numeral: "03",
    node: "border-emerald-500/50 text-emerald-600 dark:text-emerald-400",
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
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        <PageHeader
          kicker="Roadmap"
          title={<>What we're <span className="text-brand-link">building next</span></>}
          subtitle="Three directions, one principle: a network of real people is a better filter than an algorithm built to hold your attention."
          testId="section-roadmap-header"
        />

        <div className="relative mt-10" data-testid="roadmap-list">
          {/* The texture, held to Google's register: no washes, no noise — a
              faint engineering dot grid, the one pattern Google itself reaches
              for on developer surfaces. `currentColor` in the gradient lets one
              element carry both themes; the radial mask pools it around the
              journey and lets it dissolve before the edges, so it reads as
              graph paper under the plan rather than wallpaper behind it. */}
          <div
            aria-hidden
            className="absolute -inset-x-8 -inset-y-4 text-slate-500/[0.13] dark:text-white/[0.07] [mask-image:radial-gradient(ellipse_60%_55%_at_38%_45%,black,transparent)]"
            style={{
              backgroundImage: "radial-gradient(circle at 1px 1px, currentColor 1.2px, transparent 1.2px)",
              backgroundSize: "20px 20px",
            }}
          />

          {/* The road. Gradient walks the three stops' hues, then fades out
              below the last one — the journey doesn't end, it continues. */}
          <div
            aria-hidden
            className="absolute left-[23px] top-2 bottom-0 w-px bg-gradient-to-b from-brand-accent/60 via-brand-primary/50 to-emerald-500/40 [mask-image:linear-gradient(to_bottom,black_85%,transparent)]"
          />

          {/* Where the journey starts: the product you're already using. */}
          <div className="relative flex items-center gap-5 pb-10">
            <span className="relative z-10 inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 shadow-sm">
              <MapPin className="h-4 w-4 text-slate-400 dark:text-slate-500" />
            </span>
            <p className="text-[13px] text-slate-500 dark:text-slate-400">
              <span className="font-semibold text-slate-700 dark:text-slate-200">Today</span> — the
              product you're using now. Everything below builds on it.
            </p>
          </div>

          {plannedByTheme().map((group) => {
            const meta = THEME_META[group.key];
            return (
              <section
                key={group.key}
                className="relative flex gap-5 pb-12"
                data-testid={`roadmap-theme-${group.key}`}
              >
                {/* The stop: a numeral node on the rail. */}
                <span
                  className={`relative z-10 inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 bg-white dark:bg-slate-950 text-[15px] font-bold tabular-nums shadow-sm ${meta.node}`}
                  style={{ fontFamily: "var(--font-display)" }}
                  aria-hidden
                >
                  {meta.numeral}
                </span>

                <div className="min-w-0 flex-1 pt-1.5">
                  <h2
                    className="text-lg sm:text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight"
                    style={{ fontFamily: "var(--font-display)" }}
                  >
                    {group.title}
                  </h2>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                    {group.blurb}
                  </p>

                  <ul className="mt-4 grid gap-x-8 gap-y-3 sm:grid-cols-2">
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
                </div>
              </section>
            );
          })}
        </div>

        <p className="mt-2 pl-[68px] text-xs text-slate-400 dark:text-slate-500 leading-relaxed max-w-xl">
          Numbered by the order we think matters — it moves as we learn. Nothing
          here is on the pricing page as something you'd be paying for today.
        </p>
      </div>
    </InfoPageLayout>
  );
}
