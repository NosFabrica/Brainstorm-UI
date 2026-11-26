import { BallotAnswers, MarketSummary } from "@/components/search/thingCards";
import type { MinimalEvent } from "@/lib/noteRefs";
import type { Thing } from "@/lib/thing";

/** A kind-38000 prediction market or ballot: drawn in the note card itself, its question and where it stands. */
export function isInlineThing(event: MinimalEvent, thing: Thing | null): boolean {
  if (event.kind !== 38000) return false;
  const type = thing?.detail.type;
  return type === "market" || type === "ballot";
}

/**
 * A quoted prediction market or ballot (kind 38000), drawn as what it is: a
 * market's content is BAO's social post, a ballot's is raw JSON. Its question,
 * and a market's odds or a ballot's answers.
 */
export function EmbeddedInlineThing({ thing }: { thing: Thing }) {
  return (
    <div data-testid="embedded-thing">
      <p className="line-clamp-2 text-[15px] font-semibold leading-snug text-slate-900 dark:text-slate-100">
        {thing.title}
      </p>
      {thing.detail.type === "market" && thing.description && (
        <p className="mt-0.5 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">{thing.description}</p>
      )}
      <div className="mt-2">
        {thing.detail.type === "market" ? (
          <MarketSummary detail={thing.detail} link={thing.link} />
        ) : thing.detail.type === "ballot" ? (
          <BallotAnswers detail={thing.detail} />
        ) : null}
      </div>
    </div>
  );
}
