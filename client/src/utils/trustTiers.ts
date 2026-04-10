export interface TrustTier {
  name: string;
  color: string;
  badgeClass: string;
}

export function getTier(influence: number): TrustTier {
  if (influence >= 0.8) return { name: "Highly Trusted", color: "text-emerald-600", badgeClass: "bg-emerald-50 border-emerald-200 text-emerald-700" };
  if (influence >= 0.5) return { name: "Trusted", color: "text-sky-600", badgeClass: "bg-sky-50 border-sky-200 text-sky-700" };
  if (influence >= 0.2) return { name: "Neutral", color: "text-indigo-600", badgeClass: "bg-indigo-50 border-indigo-200 text-indigo-700" };
  if (influence >= 0.05) return { name: "Low Trust", color: "text-amber-600", badgeClass: "bg-amber-50 border-amber-200 text-amber-700" };
  return { name: "Unverified", color: "text-slate-500", badgeClass: "bg-slate-50 border-slate-200 text-slate-500" };
}

export function getRelativeTime(timestamp: number): string {
  const now = Date.now() / 1000;
  const diff = now - timestamp;
  if (diff < 3600) return "just now";
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 2592000) return `${Math.floor(diff / 86400)}d ago`;
  if (diff < 31536000) return `${Math.floor(diff / 2592000)}mo ago`;
  const years = Math.floor(diff / 31536000);
  return `${years}y ago`;
}

export function freshnessScore(createdAt: number | undefined): number {
  if (!createdAt) return 0.3;
  const now = Date.now() / 1000;
  const ageSeconds = Math.max(0, now - createdAt);
  const halfLifeDays = 180;
  const halfLifeSeconds = halfLifeDays * 86400;
  return Math.pow(0.5, ageSeconds / halfLifeSeconds);
}
