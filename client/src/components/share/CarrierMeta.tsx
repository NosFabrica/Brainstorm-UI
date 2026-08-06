import { useState } from "react";
import { Link } from "wouter";
import { npubFromPubkey } from "@/lib/shareId";
import type { TagCarrier } from "@/services/tags";
import type { ProfileContent } from "applesauce-core/helpers/profile";

/**
 * The line under a carrier's name: who vouched, and any caveat.
 *
 * Both counts appear here — unlike the profile chip, which shows agreement
 * only. This page is about the tag, not about the person, so hiding dissent
 * would make the list look more settled than it is.
 */
export function CarrierMeta({
  carrier,
  profileMap,
  isViewer = false,
}: {
  carrier: TagCarrier;
  profileMap?: Map<string, ProfileContent>;
  /** This row is the person reading it — switches the copy to second person. */
  isViewer?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  const nameFor = (pk: string) => {
    const p = profileMap?.get(pk);
    return p?.display_name || p?.name || `${pk.slice(0, 8)}…`;
  };
  const linkFor = (pk: string) => {
    try { return `/p/${npubFromPubkey(pk)}`; } catch { return null; }
  };
  // Three keeps the row one line; the rest are a tap away rather than hidden.
  // "Who vouched" is the whole point of attribution — a name you can't open
  // is barely better than a count.
  const vouchers = carrier.asserters;
  const shown = expanded ? vouchers : vouchers.slice(0, 3);
  const extra = vouchers.length - shown.length;

  // Badges do at small scale what a filter bar does at large: let you scan a
  // list and see which rows are self-declared or contested without reading
  // every line. Most tags here have three people, where a filter row is noise.
  const badges: Array<{ label: string; tone: string; testId: string }> = [];
  if (carrier.applications === 0 && carrier.selfDeclared) {
    badges.push({ label: "Self-declared", tone: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400", testId: "badge-self" });
  }
  if (carrier.disputes > 0 || carrier.subjectDisagreed) {
    badges.push({ label: "Contested", tone: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400", testId: "badge-contested" });
  }

  return (
    <div className="mt-1 space-y-0.5" data-testid="tag-vouch-count">
      {badges.length > 0 && (
        <div className="mb-1 flex flex-wrap gap-1">
          {badges.map((b) => (
            <span
              key={b.label}
              className={`inline-flex items-center rounded-full px-1.5 py-px text-[10px] font-semibold ${b.tone}`}
              data-testid={b.testId}
            >
              {b.label}
            </span>
          ))}
        </div>
      )}
      {carrier.applications > 0 ? (
        <p className="text-[11px] leading-relaxed text-slate-400 dark:text-slate-500">
          {/* Naming the vouchers is the point: "2 people" told you nothing
              about whether that was two strangers or one account twice. */}
          Added by{" "}
          {shown.map((pk, i) => {
            const href = linkFor(pk);
            return (
              <span key={pk}>
                {i > 0 && ", "}
                {href ? (
                  <Link
                    href={href}
                    className="font-medium text-slate-500 underline decoration-slate-300 underline-offset-2 hover:text-brand-primary dark:text-slate-400 dark:decoration-slate-600"
                    data-testid="tag-voucher-link"
                  >
                    {nameFor(pk)}
                  </Link>
                ) : (
                  nameFor(pk)
                )}
              </span>
            );
          })}
          {extra > 0 && (
            <>
              {" "}
              <button
                type="button"
                onClick={() => setExpanded(true)}
                className="font-medium text-brand-link hover:underline"
                data-testid="tag-voucher-more"
              >
                +{extra} more
              </button>
            </>
          )}
          {carrier.disputes > 0 && (
            <span className="text-amber-600 dark:text-amber-500">
              {" · "}
              {carrier.disputes} disagreed
            </span>
          )}
        </p>
      ) : carrier.selfDeclared ? (
        <p className="text-[11px] text-slate-400 dark:text-slate-500" data-testid="tag-self-declared">
          {isViewer ? "You added yourself" : "Says this about themselves"}
        </p>
      ) : null}
      {/* Nobody vouched and they didn't claim it — the row is only here because
          the reader has a stance on it. Saying "says this about themselves"
          here would be flatly untrue, which is what the first cut did. */}
      {carrier.applications === 0 && !carrier.selfDeclared && carrier.myStance === "dispute" && (
        <p className="text-[11px] text-slate-400 dark:text-slate-500" data-testid="tag-withdrawn">
          {isViewer ? "You withdrew your vote" : "No longer vouched for"}
        </p>
      )}
      {carrier.selfDeclared && carrier.applications > 0 && (
        <p className="text-[11px] text-slate-400 dark:text-slate-500">
          {isViewer ? "You also added yourself" : "Also says it themselves"}
        </p>
      )}
      {carrier.subjectDisagreed && !isViewer && (
        // The subject's objection gets its own line and its own colour. It
        // cannot remove the tag, so it had better be impossible to miss.
        <p
          className="text-[11px] font-medium text-amber-600 dark:text-amber-500"
          data-testid="tag-subject-disagrees"
        >
          They disagree with this tag
        </p>
      )}
    </div>
  );
}
