/**
 * The latest GrapeRank run out of `GET /user/graperankResult`.
 *
 * The server wraps it — `{ code, data: <run> | null, message }` — and the
 * pages that read it disagreed about the level: the dashboard, the network
 * page and the app-wide status read `.data`, while Insights read the top and
 * so saw no status at all (a finished run read "In progress" for every user).
 * One reader, tolerant of a bare run as well, so nobody guesses again.
 *
 * Null means the server answered and there is no run; undefined means there
 * is no answer yet.
 */
type RunLike = { status?: unknown; internal_publication_status?: unknown; ta_status?: unknown };

export function runOf<T extends RunLike>(raw: unknown): T | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null || typeof raw !== "object") return null;
  const top = raw as RunLike & { data?: unknown };
  // A bare run carries its own status fields; an envelope carries `data`.
  if (top.internal_publication_status !== undefined || top.status !== undefined) return top as T;
  const inner = top.data;
  return inner && typeof inner === "object" ? (inner as T) : null;
}
