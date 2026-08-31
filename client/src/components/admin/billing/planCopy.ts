/**
 * Plan copy is plain text, both ways.
 *
 * The server stores `includes`/`excludes` as arrays of lines and the form edits
 * them as a textarea, so the two conversions live here rather than inline —
 * written twice they would disagree about blank lines, and a round-trip through
 * the form would silently rewrite copy nobody touched.
 *
 * Nothing here interprets markup: what an admin types is what the pricing page
 * displays, escaped by React like any other string.
 */

/** Textarea → the server's array. Blank lines are dropped; null means "no copy". */
export function linesToList(text: string): string[] | null {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  return lines.length ? lines : null;
}

/** The server's array → textarea. */
export function listToLines(list: string[] | null | undefined): string {
  return (list ?? []).join("\n");
}

/** Same lines in the same order — what decides whether copy is a changed field. */
export function sameList(
  a: string[] | null | undefined,
  b: string[] | null | undefined,
): boolean {
  const x = a ?? [];
  const y = b ?? [];
  return x.length === y.length && x.every((v, i) => v === y[i]);
}

/**
 * `2` + `USD` → "$2.00", for a preview beside the minor-units field. Nothing
 * verifies this against Flash — it only catches the transcription that is off
 * by a factor of a hundred, which is the error that actually happens.
 */
export function formatMinor(amountMinor: number, currency: string): string {
  if (!Number.isFinite(amountMinor)) return "—";
  const code = currency.trim().toUpperCase();
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: code,
    }).format(amountMinor / 100);
  } catch {
    return `${(amountMinor / 100).toFixed(2)} ${code}`;
  }
}

/** "every 2 weeks", "/month", "once" — formatted from a unit and a count, never a matched string. */
export function formatPeriod(
  unit: string | null | undefined,
  count: number | null | undefined,
): string {
  if (!unit) return "no period recorded";
  if (count === null || count === undefined) return unit;
  return count === 1 ? `every ${unit}` : `every ${count} ${unit}s`;
}
