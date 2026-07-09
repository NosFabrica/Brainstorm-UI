/**
 * Human-readable duration for scheduler intervals / quota windows.
 * Greedy d/h/m/s, drops zero units, caps at the two largest non-zero units.
 */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  if (s === 0) return "0s";
  const units: Array<[string, number]> = [
    ["d", 86400],
    ["h", 3600],
    ["m", 60],
    ["s", 1],
  ];
  const parts: string[] = [];
  let rem = s;
  for (const [label, size] of units) {
    const n = Math.floor(rem / size);
    if (n > 0) {
      parts.push(`${n}${label}`);
      rem -= n * size;
    }
    if (parts.length === 2) break;
  }
  return parts.join(" ");
}
