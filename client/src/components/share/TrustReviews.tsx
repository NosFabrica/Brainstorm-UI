/**
 * The person page's Trust reviews — every Relay Outpost vouch about someone,
 * in the one order the rest of the product uses (people you follow →
 * verified accounts → the rest folded), each with its type, its words, and
 * the person's own public reply when they answered. Silent when nobody has
 * vouched: the invitation to be first arrives with the composer.
 */
import { useEffect, useState } from "react";
import { Link } from "wouter";
import { nip19 } from "nostr-tools";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DefaultAvatarImg } from "@/components/share/DefaultAvatarImg";
import { TierWordChip, useTierRing } from "@/components/score/VerificationCoin";
import { IdentityChip, VouchBadge, useRankedVouches } from "@/components/search/EndorsementLine";
import { useMyFollows } from "@/hooks/useMyFollows";
import { usePersonEndorsements } from "@/hooks/usePersonEndorsements";
import { useProfileMap } from "@/hooks/useProfileMap";
import { getDisplayLabel } from "@/lib/profileSearch";
import { fetchVouchReplies, type VouchReply } from "@/services/search";
import type { EndorserGroup } from "@/services/endorsements";

const GROUP_HEADERS: Record<EndorserGroup, string> = {
  followed: "From people you follow",
  verified: "From verified accounts",
  other: "More from the network",
};

function ago(at: number): string {
  const days = Math.floor((Date.now() / 1000 - at) / 86400);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

export function TrustReviews({ pubkey, personal }: { pubkey: string; personal: boolean }) {
  const e = usePersonEndorsements(pubkey, personal);
  const { ranked, nameOf, pictureOf } = useRankedVouches(e);
  const { signedIn } = useMyFollows();
  const tierRing = useTierRing();
  const [othersOpen, setOthersOpen] = useState(false);
  const [replies, setReplies] = useState<Map<string, VouchReply>>(new Map());
  const subjectProfile = useProfileMap([pubkey]).get(pubkey);
  const vouchIds = e?.vouches?.map((v) => v.id) ?? [];
  const idsKey = vouchIds.join(",");
  useEffect(() => {
    if (vouchIds.length === 0) return;
    let alive = true;
    void fetchVouchReplies(vouchIds).then((r) => {
      if (alive) setReplies(r);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  if (!e || !e.vouches || e.vouches.length === 0) return null;
  const grouped: Record<EndorserGroup, typeof ranked> = { followed: [], verified: [], other: [] };
  for (const v of ranked) grouped[v.group].push(v);
  const trustedCount = grouped.followed.length + grouped.verified.length;
  const subjectName = subjectProfile ? getDisplayLabel(subjectProfile) : "them";

  return (
    <section className="mt-4" id="trust-reviews" data-testid="trust-reviews">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Trust reviews</h2>
          <IdentityChip ranked={ranked} nameOf={nameOf} testId="trust-reviews-identity" />
        </div>
        <span className="text-[11px] text-slate-400 dark:text-slate-500">{e.vouches.length}</span>
      </div>
      {(["followed", "verified", "other"] as EndorserGroup[]).map((group) => {
        const rows = grouped[group];
        if (rows.length === 0) return null;
        if (group === "followed" && !signedIn) return null;
        const folded = group === "other" && trustedCount > 0 && !othersOpen;
        return (
          <div key={group} className="mt-3" data-testid={`trust-reviews-${group}`}>
            {(group !== "other" || trustedCount > 0) && (
              <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                {GROUP_HEADERS[group]} <span className="text-slate-400 dark:text-slate-500">· {rows.length}</span>
              </div>
            )}
            {folded ? (
              <button
                type="button"
                onClick={() => setOthersOpen(true)}
                className="mt-1 text-xs font-medium text-brand-primary hover:underline"
                data-testid="trust-reviews-toggle"
              >
                Show {rows.length} more
              </button>
            ) : (
              <ul className="mt-1.5 space-y-3">
                {rows.map((v) => {
                  let npub = "";
                  try {
                    npub = nip19.npubEncode(v.pubkey);
                  } catch {
                    /* malformed pubkey — row renders without a link */
                  }
                  const reply = replies.get(v.id);
                  return (
                    <li key={v.id} className="flex items-start gap-2.5" data-testid={`trust-review-${v.id}`}>
                      <Link href={npub ? `/p/${npub}` : "#"} className="shrink-0">
                        <Avatar className={`h-7 w-7 border border-slate-200/80 dark:border-slate-800/80 ${tierRing(v.score, false, "sm", true) ?? ""}`}>
                          {pictureOf(v.pubkey) ? <AvatarImage src={pictureOf(v.pubkey)} alt="" className="object-cover" /> : null}
                          <AvatarFallback className="overflow-hidden">
                            <DefaultAvatarImg />
                          </AvatarFallback>
                        </Avatar>
                      </Link>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                          <span className="truncate text-xs font-semibold text-slate-800 dark:text-slate-100">
                            {nameOf(v.pubkey) ?? (npub ? `${npub.slice(0, 12)}…` : "Someone")}
                          </span>
                          <TierWordChip score01={v.score} />
                          <VouchBadge type={v.type} />
                          <span className="text-[11px] text-slate-400 dark:text-slate-500">{ago(v.at)}</span>
                        </div>
                        {v.text ? (
                          <p className="mt-0.5 break-words text-sm leading-relaxed text-slate-700 dark:text-slate-200">{v.text}</p>
                        ) : (
                          <p className="mt-0.5 text-xs italic text-slate-400 dark:text-slate-500">Silent vouch · no note</p>
                        )}
                        {reply && (
                          <div
                            className="mt-1.5 rounded-lg border-l-2 border-brand-accent/40 bg-slate-50 dark:bg-slate-800/50 px-2.5 py-1.5"
                            data-testid={`trust-review-reply-${v.id}`}
                          >
                            <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                              Reply from {subjectName} <span className="text-slate-400 dark:text-slate-500">· {ago(reply.at)}</span>
                            </div>
                            <p className="mt-0.5 break-words text-sm leading-relaxed text-slate-700 dark:text-slate-200">{reply.text}</p>
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </section>
  );
}
