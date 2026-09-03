/**
 * Compact count so a social-proof line stays a uniform width across
 * subjects: 7,218 → 7.2k, 1,234,567 → 1.2M; anything under 1,000 stays
 * exact. Lowercase k, uppercase M.
 */
export function compactCount(n: number): string {
  if (n < 1000) return String(n);
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 })
    .format(n)
    .replace("K", "k");
}
