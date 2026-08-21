import type { ReactNode } from "react";
import { Link } from "wouter";
import { BadgeCheck, ChevronRight } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { DefaultAvatarImg } from "@/components/share/DefaultAvatarImg";
import { VerificationCoin, useTierRing } from "@/components/score/VerificationCoin";
import type { ScorePov } from "@/components/score/TrustScorePov";
import { npubFromPubkey } from "@/lib/shareId";

/**
 * One person in a list — avatar with its trust ring, name, handle, chevron.
 *
 * Extracted from ConnectionListPage so the tag page and the connection lists
 * are the same row rather than two drifting copies. `meta` is the slot for
 * whatever a given list needs under the handle (report badges there, vouch
 * counts here), which is the only part that legitimately differs.
 */

/** Drop placeholder handles ("null"/"undefined"/empty) and the NIP-05 root prefix. */
export function cleanNip05(v?: string): string | undefined {
  const s = (v || "").replace(/^_@/, "").trim();
  return s && s.toLowerCase() !== "null" && s.toLowerCase() !== "undefined" ? s : undefined;
}

/** Avatar wrapped in a tier-coloured trust ring with a small score badge — one
 *  premium "person" token (LinkedIn/Facebook feel) instead of two side-by-side
 *  circles. */
export function TrustAvatar({
  picture,
  name,
  score,
  pov,
}: {
  picture?: string;
  name: string;
  score: number | null;
  pov: ScorePov;
}) {
  const tierRing = useTierRing();
  const ring = tierRing(score);
  return (
    <div className="relative shrink-0">
      <Avatar className={`h-12 w-12 rounded-full bg-white dark:bg-slate-900 ${ring ?? ""}`} style={ring ? undefined : { boxShadow: "0 0 0 1px #e2e8f0" }}>
        {picture ? <AvatarImage src={picture} alt={name} className="object-cover" /> : null}
        <AvatarFallback className="overflow-hidden rounded-full"><DefaultAvatarImg /></AvatarFallback>
      </Avatar>
      {/* The Verification Score coin — same label-less badge as the profile hero,
          POV-aware (colored personalized / grey global). */}
      {score != null && (
        <VerificationCoin score01={score} pov={pov} size={24} className={ring ? "sr-only" : "absolute -bottom-1 -right-1"} />
      )}
    </div>
  );
}

export interface PersonListRowProps {
  pubkey: string;
  displayName?: string;
  picture?: string;
  nip05?: string;
  /** 0–1 verification score, or null to hide the coin. */
  score?: number | null;
  pov: ScorePov;
  /** Extra line under the handle — report badges, vouch counts, whatever fits. */
  meta?: ReactNode;
  /**
   * Controls at the end of the row, replacing the chevron. Rendered OUTSIDE the
   * link: a button nested inside an anchor is invalid HTML and the two fight
   * over the click.
   */
  actions?: ReactNode;
  testId?: string;
}

export function PersonListRow({
  pubkey,
  displayName,
  picture,
  nip05,
  score = null,
  pov,
  meta,
  actions,
  testId,
}: PersonListRowProps) {
  // A single malformed pubkey from a relay would otherwise throw and blank the
  // whole list, so the row degrades to an inert link instead.
  let npub = "";
  try { npub = npubFromPubkey(pubkey); } catch { /* skip bad key */ }

  const name = displayName || (npub ? npub.slice(0, 12) + "…" : pubkey.slice(0, 12) + "…");
  const handle = cleanNip05(nip05);

  return (
    // Only the identity block is a link. `actions` and `meta` sit outside it —
    // both can contain buttons and links of their own, and an anchor nested in
    // an anchor is invalid HTML that swallows the inner click.
    <div
      className="group px-4 py-3 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800"
      data-testid={testId}
    >
      <div className="flex items-center gap-3.5">
        <Link
          href={npub ? `/p/${npub}` : "#"}
          className="flex min-w-0 flex-1 items-center gap-3.5"
        >
          <TrustAvatar picture={picture} name={name} score={score} pov={pov} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{name}</p>
            {handle ? (
              <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-slate-500 dark:text-slate-400">
                <BadgeCheck className="h-3 w-3 shrink-0 text-sky-500" /><span className="truncate">{handle}</span>
              </p>
            ) : (
              npub && <p className="mt-0.5 truncate font-mono text-xs text-slate-400 dark:text-slate-500">{npub.slice(0, 16)}…</p>
            )}
          </div>
        </Link>
        {actions ?? (
          <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 dark:text-slate-600 transition-colors group-hover:text-slate-400 dark:group-hover:text-slate-500" />
        )}
      </div>
      {/* Indented to line up under the name: avatar (3rem) + gap (0.875rem). */}
      {meta && <div className="pl-[3.875rem]">{meta}</div>}
    </div>
  );
}

/** The list's loading placeholder — same rhythm as the real rows. */
export function PersonListSkeleton({ rows = 6, testId }: { rows?: number; testId?: string }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3.5 px-4 py-3 animate-pulse" data-testid={testId}>
          <div className="h-12 w-12 rounded-full bg-slate-100 dark:bg-slate-800 shrink-0" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 w-32 rounded bg-slate-100 dark:bg-slate-800" />
            <div className="h-2.5 w-24 rounded bg-slate-100 dark:bg-slate-800" />
          </div>
        </div>
      ))}
    </>
  );
}
