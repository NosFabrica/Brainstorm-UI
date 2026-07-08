// Shared presentation helpers for NIP-56 (kind 1984) reports — used by the
// profile page and the public "Verified accounts reporting…" list. The report
// data itself is fetched by `fetchReportsForPubkey` (services/nostr.ts).

/** Tailwind classes per NIP-56 report type, for the small type badge. */
export const REPORT_TYPE_BADGE_COLORS: Record<string, string> = {
  spam: "bg-amber-50 text-amber-700 border-amber-200",
  impersonation: "bg-red-50 text-red-700 border-red-200",
  nudity: "bg-pink-50 text-pink-700 border-pink-200",
  illegal: "bg-red-50 text-red-800 border-red-300",
  profanity: "bg-orange-50 text-orange-700 border-orange-200",
  other: "bg-slate-50 text-slate-600 border-slate-200",
};

/** "3d ago · Jan 15, 2026" from a unix-seconds timestamp. */
export function formatReportTime(timestamp: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - timestamp;
  let relative: string;
  if (diff < 60) relative = "just now";
  else if (diff < 3600) relative = `${Math.floor(diff / 60)}m ago`;
  else if (diff < 86400) relative = `${Math.floor(diff / 3600)}h ago`;
  else if (diff < 2592000) relative = `${Math.floor(diff / 86400)}d ago`;
  else if (diff < 31536000) relative = `${Math.floor(diff / 2592000)}mo ago`;
  else relative = `${Math.floor(diff / 31536000)}y ago`;
  const date = new Date(timestamp * 1000);
  const absolute = date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return `${relative} · ${absolute}`;
}
