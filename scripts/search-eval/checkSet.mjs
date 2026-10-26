/**
 * What the labelled set (docs/search/eval/queries.json) must keep as it grows: the schema in the README, unique ids,
 * and ADR 0008's lean toward the first journeys (places about 30%, events about 20%, every demo city in both, and an
 * agent entry in each). `npm test` runs it over the committed set (checkSet.test.mjs).
 */

export const CLASSES = ["recommendation", "exploratory", "social", "navigational", "lookup", "agent"];
export const JOURNEYS = ["M1", "M2", "M3", "M4", "M5", "M6", "M7", "M8"];
/** The phrases the runner scores (baseline.mjs TIME_PHRASES). */
export const TIME_PHRASES = [
  "today",
  "tonight",
  "this weekend",
  "this week",
  "next 7 days",
  "this month",
  "next 30 days",
  "upcoming",
];
/** ADR 0008's demo cities. */
export const DEMO_CITIES = ["Chicago", "New York", "San Francisco", "Austin", "Funchal", "Nashville"];
/** ADR 0008: places near 30% and events near 20% of the set. */
export const SHARES = { M2: [0.25, 0.35], M3: [0.15, 0.25] };

const isId = (v) => typeof v === "string" && v.length > 0;
const pct = (x) => `${Math.round(x * 100)}%`;

/** Every problem with the set, as one line each; empty when it holds. */
export function problemsOf(set, { demoCities = DEMO_CITIES } = {}) {
  const problems = [];
  const entries = Array.isArray(set?.entries) ? set.entries : [];
  if (!entries.length) return ["the set has no entries"];

  const seen = new Set();
  for (const e of entries) {
    const id = isId(e.id) ? e.id : "(no id)";
    if (seen.has(id)) problems.push(`${id}: the id is used more than once`);
    seen.add(id);
    if (!JOURNEYS.includes(e.journey)) problems.push(`${id}: journey ${e.journey} is not one of the journeys`);
    else if (!id.startsWith(`${e.journey.toLowerCase()}-`))
      problems.push(`${id}: an ${e.journey} entry's id should start with ${e.journey.toLowerCase()}-`);
    if (!CLASSES.includes(e.class)) problems.push(`${id}: class ${e.class} is not one of the classes`);
    const structured = e.query !== null && typeof e.query === "object";
    if (e.class === "agent" && !structured) problems.push(`${id}: an agent entry's query is an object`);
    if (e.class !== "agent" && !(typeof e.query === "string" && e.query.trim()))
      problems.push(`${id}: the query is not words`);
    if (e.class === "agent" && e.run !== false) problems.push(`${id}: an agent entry is not run by the baseline yet`);
    const cats = e.expect?.categories;
    if (!Array.isArray(cats) || !cats.length) problems.push(`${id}: expect.categories is empty`);
    const results = e.expect?.results;
    if (
      results !== undefined &&
      !(Array.isArray(results) && results.every((r) => isId(r) || (Array.isArray(r) && r.length && r.every(isId))))
    )
      problems.push(`${id}: expect.results is not ids, or groups of ids`);
    const time = e.expect?.filters?.time;
    if (time !== undefined && !TIME_PHRASES.includes(time))
      problems.push(`${id}: time ${time} is not a phrase the runner scores`);
    if (!(typeof e.notes === "string" && e.notes.trim())) problems.push(`${id}: no notes`);
    if (e.as_of !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(e.as_of)) problems.push(`${id}: as_of is not a date`);
  }

  const of = (journey) => entries.filter((e) => e.journey === journey);
  for (const [journey, [low, high]] of Object.entries(SHARES)) {
    const share = of(journey).length / entries.length;
    if (share < low || share > high)
      problems.push(`${journey} is ${pct(share)} of the set; ADR 0008 keeps it between ${pct(low)} and ${pct(high)}`);
    if (!of(journey).some((e) => e.class === "agent")) problems.push(`${journey} has no agent entry`);
  }
  for (const city of demoCities)
    for (const journey of ["M2", "M3"])
      if (!of(journey).some((e) => e.expect?.filters?.place === city)) problems.push(`${city} has no ${journey} entry`);

  return problems;
}
