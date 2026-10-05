/**
 * Which Settings tab a link opens. Messages has its own tab (2026-10-05): a
 * reader looks for message settings under "Messages", not "Trust & search",
 * where they used to be — so the old `?tab=trust&focus=messages` links land
 * on the new tab rather than on a page without them.
 */
export function settingsTabFor<T extends string>(
  tab: string | null,
  focus: string | null,
  available: readonly T[],
): T | "profile" {
  const wanted = tab === "trust" && focus === "messages" ? "messages" : tab;
  return available.find((t) => t === wanted) ?? "profile";
}
