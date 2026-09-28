/**
 * The query as it went to the relay, for the technical view: the kinds a
 * tab asks for (or the ones the box typed), the tags, whose perspective
 * ranks the read, and how long the relay took. The `kind:` and `spec:`
 * syntax teaches itself here, and an agent's author sees what the box does.
 * Renders nothing with the view off.
 */
import { liftQuery } from "@/lib/searchSyntax";
import { technicalView } from "@/lib/technicalView";
import { kindsForTab, tagsForTab, type SearchPov, type SearchTab } from "@/services/search";

export function QueryAsSent({ query, tab, pov, timeMs }: { query: string; tab: SearchTab; pov: SearchPov; timeMs: number | null | undefined }) {
  if (!technicalView()) return null;
  const lifted = liftQuery(query);
  const tabKinds = kindsForTab(tab);
  // The same reading services/search gives the relay: on NIPs a kind is what a spec covers.
  const coveredKinds = tab === "nips" ? lifted.kinds : undefined;
  const kinds = lifted.kinds && !coveredKinds ? (tabKinds ? tabKinds.filter((k) => lifted.kinds!.includes(k)) : lifted.kinds) : tabKinds;
  const tags = lifted["#t"] ?? tagsForTab(tab);
  const parts: string[] = [];
  if (lifted.search) parts.push(`“${lifted.search}”`);
  parts.push(kinds?.length ? `kinds ${kinds.join(" ")}` : "kinds any");
  if (coveredKinds?.length) parts.push(`#k ${coveredKinds.join(" ")}`);
  if (tags?.length) parts.push(`#t ${tags.join(" ")}`);
  if (lifted.authors?.length) parts.push(`authors ${lifted.authors.length}`);
  if (lifted["#p"]?.length) parts.push(`#p ${lifted["#p"].length}`);
  parts.push(`observer ${pov === "mywot" ? "you" : "house"}`);
  if (typeof timeMs === "number") parts.push(`${Math.round(timeMs)} ms`);
  return (
    <p className="mb-2 px-1 font-mono text-[10px] text-slate-400 dark:text-slate-500" data-testid="query-as-sent" title="The request as it went to the search relay">
      {parts.join(" · ")}
    </p>
  );
}
