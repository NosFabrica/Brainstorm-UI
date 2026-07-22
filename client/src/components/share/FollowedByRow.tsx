import { Link } from "wouter";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { DefaultAvatarImg } from "@/components/share/DefaultAvatarImg";

export type FollowedByPerson = { pubkey: string; name?: string; picture?: string };

// Compact count so the line stays a uniform width across users: 7,218 → 7.2k,
// 1,234,567 → 1.2M; anything under 1,000 stays exact. Lowercase k, uppercase M.
function compactCount(n: number): string {
  if (n < 1000) return String(n);
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 })
    .format(n)
    .replace("K", "k");
}

/**
 * "Followed by [avatars] Alice, Bob & 1,234 others" — social proof from the
 * top WoT-ranked followers (the most-trusted accounts in the network who follow
 * this profile). The LinkedIn mutual-connections / Facebook mutual-friends beat,
 * placed right under the stats. Links to the full followers list.
 */
export function FollowedByRow({ people, total, href, stacked = false }: { people: FollowedByPerson[]; total: number | null; href: string; stacked?: boolean }) {
  if (people.length === 0) return null;
  const named = people.map((p) => p.name).filter((n): n is string => !!n);
  const lead = named.slice(0, 2);
  const grandTotal = total ?? people.length;
  const others = Math.max(0, grandTotal - lead.length);

  const label =
    lead.length === 0
      ? `Followed by ${compactCount(grandTotal)} trusted accounts`
      : others > 0
        ? `Followed by ${lead.join(", ")} & ${compactCount(others)} others`
        : `Followed by ${lead.join(" & ")}`;

  return (
    <Link
      href={href}
      className={`group ${stacked ? "flex flex-col items-start gap-2" : "mt-2.5 inline-flex items-center gap-2"}`}
      data-testid="share-followed-by"
    >
      <div className="flex -space-x-2">
        {people.slice(0, 5).map((p) => (
          <Avatar key={p.pubkey} className="h-6 w-6 rounded-full bg-white ring-2 ring-white">
            {p.picture ? <AvatarImage src={p.picture} alt="" className="object-cover" /> : null}
            <AvatarFallback className="overflow-hidden rounded-full"><DefaultAvatarImg /></AvatarFallback>
          </Avatar>
        ))}
      </div>
      <span className="text-xs text-slate-500 transition-colors group-hover:text-slate-700">{label}</span>
    </Link>
  );
}
