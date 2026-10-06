import { Card } from "@/components/ui/card";
import { useTierRing } from "@/components/score/VerificationCoin";
import { Slider } from "@/components/ui/slider";
import { Users, UserPlus, Award, Network, ChevronRight, Loader2 } from "lucide-react";
import { BrainLogo } from "@/components/BrainLogo";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { DefaultAvatarImg } from "@/components/share/DefaultAvatarImg";
import { npubFromPubkey } from "@/lib/shareId";
import type { NetworkFace } from "@/hooks/useNetworkFaces";

/** Compact "2h ago" phrasing from an epoch-SECONDS timestamp (Nostr created_at). */
function activeAgo(epochSeconds: number): string {
  if (!epochSeconds) return "recently";
  const diff = Math.max(0, Math.floor(Date.now() / 1000) - epochSeconds);
  if (diff < 60) return "just now";
  const m = Math.floor(diff / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  const w = Math.floor(d / 7);
  if (w < 5) return `${w}w ago`;
  return `${Math.floor(d / 30)}mo ago`;
}

type HealthSlice = { name: string; value: number; color: string };

/**
 * "Your Network" — the condensed network card that replaces the old trio of
 * Social Graph + Extended Reach + Network Health tiles. One box, three compact
 * sections: verified follower/following counts, extended reach (with the hop
 * slider), and a slim trust-health bar. The full health pie + tier drill-downs
 * now live on /network; this is the dashboard summary.
 */
export function YourNetworkCard({
  isReady,
  loading,
  followers,
  following,
  extendedCount,
  hopRange,
  maxHop,
  onHopChange,
  health,
  onNavigate,
  followersFaces = [],
  followingFaces = [],
}: {
  isReady: boolean;
  loading: boolean;
  followers: number;
  following: number;
  extendedCount: number;
  hopRange: number[];
  maxHop: number;
  onHopChange: (v: number[]) => void;
  health: HealthSlice[];
  onNavigate: (path: string) => void;
  /** Up to 5 recently-active followers / follows, shown as a small avatar cluster. */
  followersFaces?: NetworkFace[];
  followingFaces?: NetworkFace[];
}) {
  const segments = health.filter((s) => s.value > 0);
  const total = segments.reduce((acc, s) => acc + s.value, 0);
  const statValue = (v: number) =>
    loading || !isReady ? <BrainLogo size={18} className="animate-pulse text-brand-link" /> : v.toLocaleString();

  const statTile = (label: string, value: number, icon: React.ReactNode, group: string, faces: NetworkFace[] = []) => (
    // The tile is a plain container, NOT a role="button". Its primary action is a
    // real <button> whose ::after stretches over the whole card, so the big click
    // target survives while the avatars below stay independently clickable —
    // nesting links inside a role="button" is invalid and unusable with a screen
    // reader. Faces sit above the overlay via z-10.
    <div
      className={`relative flex h-full flex-col overflow-hidden rounded-xl border bg-gradient-to-br from-white via-white to-brand-primary/[0.06] p-3 transition-all duration-300 dark:from-slate-900 dark:via-slate-900 dark:to-brand-primary/[0.12] ${isReady ? "border-slate-200/80 hover:-translate-y-0.5 hover:border-brand-accent/40 hover:shadow-[0_8px_24px_-8px_rgb(var(--brand-accent)/0.2)] dark:border-slate-800/80" : "border-slate-100 dark:border-slate-800/60"}`}
      data-testid={`your-network-${group}`}
    >
      <button
        type="button"
        disabled={!isReady}
        onClick={() => onNavigate(`/network?group=${group}&view=list`)}
        aria-label={`${label} — explore the full list`}
        className={`text-left outline-none after:absolute after:inset-0 after:rounded-xl focus-visible:after:ring-2 focus-visible:after:ring-brand-accent/50 ${isReady ? "cursor-pointer" : "cursor-default"}`}
        data-testid={`your-network-${group}-explore`}
      >
        <span className="mb-2 flex items-center gap-1.5">
          <span className="bg-brand-deep/8 rounded-md p-1 text-brand-deep">{icon}</span>
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            {label}
          </span>
        </span>
        <span className="block font-mono text-2xl font-bold leading-none tracking-tight text-slate-900 dark:text-slate-100">
          {statValue(value)}
        </span>
      </button>
      {isReady && (
        <div className="mt-auto flex items-end justify-between gap-2 pt-2">
          {faceStack(faces)}
          <span className="flex shrink-0 items-center gap-1 text-[10px] font-semibold text-brand-deep/60">
            <span>Explore</span>
            <ChevronRight className="h-2.5 w-2.5" />
          </span>
        </div>
      )}
    </div>
  );

  // A small overlapping avatar cluster of recently-active people, with an honest
  // "active recently" caption (no fake "online" — Nostr has no presence signal).
  // Renders nothing until the faces load, so the tile never reserves empty space.
  //
  // Faces are people, so each one opens THAT person's public page (/p/:id) — the
  // content-rich profile with their notes, photos and articles. Not /profile/:npub,
  // which is the members-only analytics deep-dive: someone clicking a face wants to
  // see who this person IS, not read a trust report on them.
  //
  // The caption is metadata, not a control — a clickable "Active recently" has no
  // destination a user could predict. z-10 lifts the cluster above the tile's
  // stretched overlay so these clicks land here instead of navigating to the list.
  const tierRing = useTierRing();
  const faceStack = (faces: NetworkFace[]) => {
    if (faces.length === 0) return <span />;
    return (
      <div className="relative z-10 flex min-w-0 flex-col gap-1">
        <div className="flex -space-x-1">
          {faces.map((f) => {
            const who = f.name || `${npubFromPubkey(f.pubkey).slice(0, 12)}…`;
            const when = activeAgo(f.lastActive);
            return (
              <button
                key={f.pubkey}
                type="button"
                onClick={() => onNavigate(`/p/${npubFromPubkey(f.pubkey)}`)}
                title={`${who} · active ${when}`}
                aria-label={`${who}, active ${when} — view their page`}
                className="rounded-full outline-none transition-transform hover:z-10 hover:-translate-y-0.5 focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-brand-accent/50"
                data-testid="your-network-face"
              >
                <Avatar
                  className={`h-6 w-6 rounded-full border border-slate-200 dark:border-slate-800 ${tierRing(f.score01, false, "sm", true) ?? "ring-2 ring-white dark:ring-slate-900"}`}
                >
                  {f.picture ? <AvatarImage src={f.picture} alt="" className="object-cover" /> : null}
                  <AvatarFallback className="overflow-hidden rounded-full">
                    <DefaultAvatarImg />
                  </AvatarFallback>
                </Avatar>
              </button>
            );
          })}
        </div>
        <span className="inline-flex items-center gap-1 text-[9px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
          <span className="h-1 w-1 rounded-full bg-brand-accent" /> Active recently
        </span>
      </div>
    );
  };

  return (
    <Card
      className="relative flex h-full w-full flex-col gap-3 rounded-xl border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
      data-testid="card-your-network"
    >
      {!isReady && (
        <div
          className="absolute inset-0 z-20 flex flex-col items-center justify-center rounded-xl bg-white/60 backdrop-blur-[1px] dark:bg-slate-900/60"
          data-testid="your-network-locked"
        >
          <Loader2 className="mb-2 h-5 w-5 animate-spin text-slate-400 dark:text-slate-500" />
          <span className="text-xs font-semibold tracking-wide text-slate-500 dark:text-slate-400">
            Scores calculating…
          </span>
        </div>
      )}
      <div className={`${!isReady ? "pointer-events-none select-none opacity-30" : ""}flex flex-col gap-3`}>
        <div className="flex items-center gap-2">
          <div className="rounded-lg border border-slate-100 bg-white p-1.5 text-brand-deep shadow-sm ring-1 ring-slate-100 dark:border-slate-800/60 dark:bg-slate-800 dark:ring-slate-800">
            <Users className="h-3.5 w-3.5" />
          </div>
          <span
            className="text-sm font-bold tracking-tight text-slate-800 dark:text-slate-200"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Your Network
          </span>
          <span className="ml-auto inline-flex items-center gap-1.5 font-mono text-[11px] text-slate-500 dark:text-slate-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Live
          </span>
        </div>

        {/* One grid, two shapes by width: on a phone the two counts share a row
            and reach and health take a full row each (the old `wide` prop stacked
            all four full-width there); from `lg` all four sit on one row. */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:items-stretch">
          {statTile("Followers", followers, <Award className="h-3 w-3" />, "followed_by", followersFaces)}
          {statTile("Following", following, <UserPlus className="h-3 w-3" />, "following", followingFaces)}

          {/* Extended reach + hop slider */}
          <div className="col-span-2 flex h-full flex-col space-y-2 rounded-lg border border-slate-100 bg-slate-50/80 p-2.5 dark:border-slate-800/60 dark:bg-slate-900/80 lg:col-span-1">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <Network className="h-3 w-3" /> Extended reach
              </span>
              <span className="font-mono text-sm font-bold text-slate-900 dark:text-slate-100">
                {loading || !isReady ? "—" : extendedCount.toLocaleString()}
              </span>
            </div>
            {/* Fixed-height band centres the slider track so it lands on the exact
              same line as the trust-health bar in the box beside it. */}
            <div className="flex h-5 items-center">
              <Slider
                value={hopRange}
                onValueChange={(v) => {
                  if (!isReady) return;
                  const next = (v ?? [1, maxHop]).slice(0, 2) as number[];
                  const lo = Math.min(next[0] ?? 1, next[1] ?? 1);
                  const hi = Math.min(maxHop, Math.max(next[0] ?? 1, next[1] ?? 1));
                  onHopChange([lo, hi]);
                }}
                max={maxHop}
                min={1}
                step={1}
                disabled={!isReady}
                className={isReady ? "w-full cursor-pointer" : "w-full cursor-not-allowed opacity-50"}
              />
            </div>
            <div className="flex justify-between text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              <span>Direct</span>
              <span className="text-brand-primary dark:text-brand-link">
                {hopRange[0] === hopRange[1] ? `${hopRange[0]}` : `${hopRange[0]}–${hopRange[1]}`} hops
              </span>
              <span>Global</span>
            </div>
          </div>

          {/* Trust health — compact stacked bar + legend, full detail on /network.
            Same boxed chrome as Extended Reach so the two align on one baseline
            when the card goes wide. */}
          <div className="col-span-2 flex h-full flex-col space-y-2 rounded-lg border border-slate-100 bg-slate-50/80 p-2.5 dark:border-slate-800/60 dark:bg-slate-900/80 lg:col-span-1">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Trust health
              </span>
              <button
                type="button"
                onClick={() => onNavigate("/network")}
                className="rounded text-[11px] font-semibold text-brand-link hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40"
                data-testid="your-network-health-details"
              >
                Details →
              </button>
            </div>
            {/* Same 20px band + 1.5 bar height as the slider so both sit on one line. */}
            <div className="flex h-5 items-center">
              <div
                className="flex h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"
                data-testid="your-network-health-bar"
              >
                {total > 0 &&
                  segments.map((s, i) => (
                    <div
                      key={i}
                      className="h-full first:rounded-l-full last:rounded-r-full"
                      style={{ width: `${(s.value / total) * 100}%`, backgroundColor: isReady ? s.color : "#cbd5e1" }}
                      title={`${s.name}: ${s.value.toLocaleString()}`}
                    />
                  ))}
              </div>
            </div>
            {/* List ALL tiers (not just the ones with data, and no 4-item cap), so
              the breakdown reads as complete — a user seeing only 3 of the 6 named
              tiers reasonably thinks it's broken. Zero-value tiers show 0%. */}
            <div className="flex flex-wrap gap-x-3 gap-y-0.5">
              {health.map((s, i) => (
                <span key={i} className="inline-flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
                  {s.name}{" "}
                  <span className="font-mono text-slate-400 dark:text-slate-500">
                    {total > 0 ? `${Math.round((s.value / total) * 100)}%` : "—"}
                  </span>
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
