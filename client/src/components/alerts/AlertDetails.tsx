import { Link } from "wouter";
import { ArrowRight, Loader2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Chip } from "@/components/ui/chip";
import { DefaultAvatarImg } from "@/components/share/DefaultAvatarImg";
import { useTierRing } from "@/components/score/VerificationCoin";
import { useAlertReporters } from "@/hooks/useAlertReporters";
import { useLiveProfiles } from "@/hooks/useLiveProfile";
import { useMyFollows } from "@/hooks/useMyFollows";
import { interactionLine, type InteractionSummary } from "@/lib/interactionSummary";
import { breakdownLine, reporterBreakdown, type Reporter } from "@/lib/reporterBreakdown";
import { DEFAULT_VERIFIED_LINE } from "@/services/trustThreshold";

const FACES = 6;
const day = (sec: number) => new Date(sec * 1000).toLocaleDateString(undefined, { day: "numeric", month: "short" });

/**
 * What an opened /alerts row says about a flagged account, beyond the count:
 *
 * - **Your history** with them, from the reader's own data on this device
 *   (lib/interactionSummary). Shown only to the reader, never sent anywhere.
 * - **Who reported them**, grouped the way the reader would weigh them
 *   (lib/reporterBreakdown): people they follow, verified accounts,
 *   unverified ones — so a report from friends doesn't read the same as one
 *   from strangers. Asked for when the row opens, not before.
 *
 * Says "reported by", never what the account is: the reader judges.
 */
export function AlertDetails({
  pubkey,
  npub,
  history,
  dmPartial,
}: {
  pubkey: string;
  npub: string;
  history: InteractionSummary;
  dmPartial: boolean;
}) {
  const phrases = interactionLine(history);
  return (
    <div
      className="space-y-3 border-t border-slate-100 pl-10 pt-3 dark:border-slate-800/60"
      data-testid="alert-details"
    >
      <section>
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
          Your history with them
        </p>
        <div
          className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400"
          data-testid="alert-history"
        >
          {phrases.length ? (
            phrases.map((p) => (
              <Chip key={p} tone="slate" size="sm">
                {p}
              </Chip>
            ))
          ) : (
            <span>No interaction found</span>
          )}
          {history.lastAt !== null && <span>· last {day(history.lastAt)}</span>}
          {dmPartial && <span>· messages opened on this device</span>}
        </div>
      </section>
      <Reporters pubkey={pubkey} npub={npub} />
    </div>
  );
}

function Reporters({ pubkey, npub }: { pubkey: string; npub: string }) {
  const q = useAlertReporters(pubkey);
  const { follows } = useMyFollows();
  const reporters = q.data?.reporters ?? [];
  const groups = reporterBreakdown(reporters, { follows, verifiedLine: DEFAULT_VERIFIED_LINE });
  const shown = [...groups.youFollow, ...groups.verified, ...groups.unverified].slice(0, FACES * 3);
  const profiles = useLiveProfiles(shown.map((r) => r.pubkey));
  const all = (
    <Link
      href={`/p/${npub}/reporters`}
      className="inline-flex items-center gap-1 text-xs font-medium text-brand-link hover:underline"
      data-testid="alert-reporters-all"
    >
      See all reports and reasons <ArrowRight className="h-3 w-3" />
    </Link>
  );

  return (
    <section>
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
        Who reported them
      </p>
      {q.isLoading ? (
        <p className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
          <Loader2 className="h-3 w-3 animate-spin" /> Looking up who reported them…
        </p>
      ) : q.isError ? (
        <p className="text-xs text-slate-500 dark:text-slate-400">Couldn&rsquo;t load the reporters here.</p>
      ) : (
        <>
          <p className="text-sm text-slate-700 dark:text-slate-200" data-testid="alert-reporters-summary">
            {breakdownLine(groups) || "No verified reporters found"}
            {q.data?.total != null && q.data.total > reporters.length && (
              <span className="text-slate-400">
                {" "}
                · top {reporters.length} of {q.data.total}
              </span>
            )}
          </p>
          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
            <Faces label="People you follow" people={groups.youFollow} profiles={profiles} />
            <Faces label="Verified" people={groups.verified} profiles={profiles} />
            <Faces label="Unverified" people={groups.unverified} profiles={profiles} />
          </div>
          <p className="mt-1.5 text-[11px] text-slate-400 dark:text-slate-500">
            Scores from {q.pov === "personalized" ? "your perspective" : "Brainstorm's perspective"}.
          </p>
        </>
      )}
      <div className="mt-1.5">{all}</div>
    </section>
  );
}

function Faces({
  label,
  people,
  profiles,
}: {
  label: string;
  people: Reporter[];
  profiles: Map<string, { name?: string; display_name?: string; picture?: string }>;
}) {
  const tierRing = useTierRing();
  if (!people.length) return null;
  const rest = people.length - FACES;
  return (
    <div className="flex items-center gap-2" data-testid={`alert-reporters-${label.toLowerCase().replace(/ /g, "-")}`}>
      <span className="text-[11px] text-slate-500 dark:text-slate-400">{label}</span>
      <span className="flex -space-x-1.5">
        {people.slice(0, FACES).map((r) => {
          const p = profiles.get(r.pubkey);
          const name = p?.display_name || p?.name || "Someone";
          return (
            <Avatar
              key={r.pubkey}
              title={name}
              className={`h-6 w-6 border-2 border-white dark:border-slate-900 ${tierRing(r.influence, false, "sm", true) ?? ""}`}
            >
              {p?.picture ? <AvatarImage src={p.picture} alt={name} className="object-cover" /> : null}
              <AvatarFallback className="overflow-hidden">
                <DefaultAvatarImg />
              </AvatarFallback>
            </Avatar>
          );
        })}
      </span>
      {rest > 0 && <span className="text-[11px] text-slate-400">+{rest}</span>}
    </div>
  );
}
