/**
 * Public-page "flagged" predicate.
 *
 * A profile is flagged when it has been reported by more than 5 *verified*
 * (web-of-trust) accounts — with one reporter forgiven for every 750 verified
 * followers, so large legitimate accounts (e.g. a real Jack Dorsey) aren't
 * flagged just for attracting a proportional number of bad-faith reports.
 *
 * Both inputs come from the house/network POV (`getUserStats({ house: true })`)
 * so the verdict is the same for every viewer of a shared link.
 */
export function isFlaggedByReporters(
  verifiedReporters: number,
  verifiedFollowers: number,
): boolean {
  if (!Number.isFinite(verifiedReporters) || verifiedReporters <= 0) return false;
  const allowance = 5 + Math.floor(Math.max(0, verifiedFollowers) / 750);
  return verifiedReporters > allowance;
}
