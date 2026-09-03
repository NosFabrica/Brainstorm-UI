/** "153 MB", "1.2 GB", "820 KB" — one decimal only when it says something. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  const rounded = n >= 100 || i === 0 ? Math.round(n).toString() : n.toFixed(1).replace(/\.0$/, "");
  return `${rounded} ${units[i]}`;
}
