import { InfoPageLayout } from "@/components/InfoPageLayout";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { plannedByTheme } from "@/lib/plans";

/**
 * What's being built next.
 *
 * This lived on the pricing page until the team reviewed it: ten items in three
 * themes, one click from a buy button, and the verdict was that nobody deciding
 * whether to pay $2 wants to read all of it first. Moving it here keeps the
 * pricing decision to one sentence and gives the roadmap room to grow as things
 * ship.
 *
 * It reads from the same `plannedByTheme()` as before, so the promise boundary
 * still holds from one place: nothing here can leak into a tier's "what you get"
 * list, and nothing from a tier can appear here.
 *
 * Every item is grounded — the scoring entries are arguments `GrapeRankParams`
 * already accepts, and the assistant entries build on the per-account agent
 * identity the Agent Suite already scaffolds. That is why none of it hedges.
 */
export default function RoadmapPage() {
  return (
    <InfoPageLayout testId="page-roadmap">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        <PageHeader
          kicker="Roadmap"
          title={<>What we're <span className="text-brand-link">building next</span></>}
          subtitle="Three directions. Each follows the same principle: a network of real people is a better filter than an algorithm built to hold your attention."
          testId="section-roadmap-header"
        />

        <div className="mt-8 grid gap-4 md:grid-cols-3" data-testid="roadmap-list">
          {plannedByTheme().map((group) => (
            <Card key={group.key} className="p-5 h-full" data-testid={`roadmap-theme-${group.key}`}>
              <h2
                className="text-[15px] font-bold text-slate-900 dark:text-slate-100 tracking-tight"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {group.title}
              </h2>
              <p className="mt-1.5 text-[13px] leading-relaxed text-slate-500 dark:text-slate-400">
                {group.blurb}
              </p>
              <ul className="mt-4 space-y-2.5">
                {group.items.map((f) => (
                  <li
                    key={f.key}
                    className="flex items-start gap-2.5 text-[13.5px] leading-snug text-slate-700 dark:text-slate-200"
                    data-testid={`roadmap-${f.key}`}
                  >
                    <span
                      className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-brand-accent/50"
                      aria-hidden
                    />
                    {f.label}
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>

        <p className="mt-10 text-xs text-slate-400 dark:text-slate-500 leading-relaxed max-w-2xl">
          None of this is on a date. It's the order we think matters, and it moves
          as we learn — but nothing here is on the pricing page as something you'd
          be paying for today.
        </p>
      </div>
    </InfoPageLayout>
  );
}
