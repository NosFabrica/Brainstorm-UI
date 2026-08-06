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
}: {
  carrier: TagCarrier;
  profileMap?: Map<string, ProfileContent>;
}) {
  const nameFor = (pk: string) => {
    const p = profileMap?.get(pk);
    return p?.display_name || p?.name || `${pk.slice(0, 8)}…`;
  };
  const vouchers = carrier.asserters.map(nameFor);
  const shown = vouchers.slice(0, 3);
  const extra = vouchers.length - shown.length;

  return (
    <div className="mt-1 space-y-0.5" data-testid="tag-vouch-count">
      {carrier.applications > 0 ? (
        <p className="text-[11px] text-slate-400 dark:text-slate-500">
          {/* Naming the vouchers is the point: "2 people" told you nothing
              about whether that was two strangers or one account twice. */}
          Added by {shown.join(", ")}
          {extra > 0 && ` +${extra}`}
          {carrier.disputes > 0 && (
            <span className="text-amber-600 dark:text-amber-500">
              {" · "}
              {carrier.disputes} disagreed
            </span>
          )}
        </p>
      ) : (
        <p className="text-[11px] text-slate-400 dark:text-slate-500" data-testid="tag-self-declared">
          Says this about themselves
        </p>
      )}
      {carrier.selfDeclared && carrier.applications > 0 && (
        <p className="text-[11px] text-slate-400 dark:text-slate-500">Also says it themselves</p>
      )}
      {carrier.subjectDisagreed && (
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
