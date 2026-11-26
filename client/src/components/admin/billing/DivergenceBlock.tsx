import { Chip } from "@/components/ui/chip";
import { type AdminBillingDivergenceSection, type UnmappedPlanRow } from "@/services/api";
import React from "react";
import {
  AbandonedCheckoutRowView,
  FailingSyncRowView,
  PolicyMismatchRowView,
  RetiredPlanRowView,
  StaleSyncRowView,
  UnrecognisedStatusRowView,
  ExhaustedEventRowView,
  UnmappedPlanRowView,
  type ProfileBits as DivergenceProfileBits,
} from "./DivergenceRows";
import { type SignupActions, SignupActionsMenu } from "./SignupActionsMenu";
import {
  type DivergenceMeta,
  type DivergenceTier,
  type OrderedSection,
  splitExhausted,
  type SignupHandle,
  firstSentence,
} from "./divergenceSections";
import { flashSubscriptionUrl } from "./rosterShared";

/** A tier of the report: Faults or For the record. Says so when empty. */
export function DivergenceTierGroup({
  tier,
  sections,
  render,
}: {
  tier: DivergenceTier;
  sections: OrderedSection[];
  render: (x: OrderedSection) => React.ReactNode;
}) {
  const fault = tier === "fault";
  return (
    <div data-testid={`billing-divergence-${fault ? "faults" : "record"}`}>
      <div className="flex items-center gap-2">
        <span
          className={`text-[11px] font-semibold uppercase tracking-wide ${fault ? "text-amber-700 dark:text-amber-400" : "text-slate-400 dark:text-slate-500"}`}
        >
          {fault ? "Faults" : "For the record"}
        </span>
        <span
          className={`h-px flex-1 ${fault ? "bg-amber-200/60 dark:bg-amber-400/20" : "bg-slate-200/70 dark:bg-slate-700/60"}`}
        />
      </div>
      {sections.length === 0 ? (
        <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">
          {fault ? "No faults — nothing is wrong for anyone paying." : "Nothing to note."}
        </p>
      ) : (
        <div className="mt-2 space-y-3">{sections.map(render)}</div>
      )}
    </div>
  );
}

/** The section's heading: its title, meaning, count and truncation admission. */
export function DivergenceHeading({
  kind,
  meta,
  tier,
  section,
  countLabel,
}: {
  kind: string;
  meta: DivergenceMeta | null;
  tier: DivergenceTier;
  section: AdminBillingDivergenceSection;
  /** Both numbers when the list shows fewer entries than the server counts —
   *  "3 deliveries · 2 signups", "3 · 2 listed above" — so the chip still reconciles. */
  countLabel?: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="text-[13px] font-semibold text-slate-900 dark:text-slate-100">
          {meta?.title ?? kind.replaceAll("_", " ")}
        </span>
        <Chip tone={tier === "fault" ? "warning" : "neutral"} size="sm">
          {countLabel ?? section.count}
        </Chip>
        {section.truncated && (
          <span className="text-[11px] text-slate-400 dark:text-slate-500">list capped — more exist</span>
        )}
      </div>
      {meta?.meaning && (
        <p
          className="mt-0.5 text-[11px] leading-snug text-slate-500 dark:text-slate-400"
          title={meta.meaning}
          data-testid={`billing-divergence-meaning-${kind}`}
        >
          {firstSentence(meta.meaning)}
        </p>
      )}
    </div>
  );
}

/** One free-form row, verbatim. The Flash id is the one value that links out. */
export function DivergenceRow({ row }: { row: Record<string, unknown> }) {
  return (
    <span className="break-all font-mono text-xs text-slate-600 dark:text-slate-300">
      {Object.entries(row).map(([k, v], j) => (
        <span key={k}>
          {j > 0 && "  "}
          {k === "flash_subscription_id" && typeof v === "string" && v ? (
            <>
              {k}=
              <a
                href={flashSubscriptionUrl(v)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-link hover:underline"
              >
                {v}
              </a>
            </>
          ) : (
            `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`
          )}
        </span>
      ))}
    </span>
  );
}

/** A section's rows. Kinds this build knows get typed rows (below); anything
 *  else renders its values verbatim rather than guessing a schema. */
export function DivergenceBlock({
  kind,
  meta,
  tier,
  section,
  profiles,
  policyName,
  busyKeys,
  onResync,
  onReset,
  handlesByEventId,
  signupActions,
  onCreateMapping,
}: {
  kind: string;
  meta: DivergenceMeta | null;
  tier: DivergenceTier;
  section: AdminBillingDivergenceSection;
  profiles: Map<string, DivergenceProfileBits>;
  policyName: (id: number | null | undefined) => string;
  busyKeys: ReadonlySet<string>;
  onResync: (pubkey: string) => void;
  onReset: (pubkey: string) => void;
  handlesByEventId: Map<number, SignupHandle>;
  signupActions: SignupActions;
  onCreateMapping: (row: UnmappedPlanRow) => void;
}) {
  const person = (row: Record<string, unknown>) =>
    typeof row.pubkey === "string" ? profiles.get(row.pubkey) : undefined;
  const busy = (row: Record<string, unknown>) => typeof row.pubkey === "string" && busyKeys.has(row.pubkey);
  const typed = (row: Record<string, unknown>, i: number) => {
    switch (kind) {
      case "policy_mismatch":
      case "admin_overrides":
        return (
          <PolicyMismatchRowView
            key={i}
            kind={kind}
            row={row as never}
            profile={person(row)}
            policyName={policyName}
            busy={busy(row)}
            onResync={kind === "policy_mismatch" ? onResync : undefined}
            onReset={kind === "admin_overrides" ? onReset : undefined}
          />
        );
      case "stale_syncs":
        return (
          <StaleSyncRowView key={i} row={row as never} profile={person(row)} busy={busy(row)} onResync={onResync} />
        );
      case "failing_syncs":
        return (
          <FailingSyncRowView key={i} row={row as never} profile={person(row)} busy={busy(row)} onResync={onResync} />
        );
      case "unrecognised_statuses":
        return <UnrecognisedStatusRowView key={i} row={row as never} />;
      case "abandoned_checkouts":
        return (
          <AbandonedCheckoutRowView key={i} row={row as never} profile={person(row)} flashUrl={flashSubscriptionUrl} />
        );
      case "retired_plan_subscribers":
        return (
          <RetiredPlanRowView
            key={i}
            row={row as never}
            profile={person(row)}
            flashUrl={flashSubscriptionUrl}
            policyName={policyName}
          />
        );
      case "unmapped_plans": {
        const r = row as unknown as UnmappedPlanRow;
        const who = typeof r.external_ref === "string" ? profiles.get(r.external_ref) : undefined;
        return (
          <UnmappedPlanRowView
            key={i}
            row={r}
            profile={who}
            flashUrl={flashSubscriptionUrl}
            onCreateMapping={onCreateMapping}
          />
        );
      }
      case "exhausted_events": {
        const eventId = typeof row.id === "number" ? row.id : null;
        const handle = eventId != null ? handlesByEventId.get(eventId) : undefined;
        return (
          <ExhaustedEventRowView key={i} row={row as never} listedAbove={!!handle}>
            {handle ? (
              // A handle borrowed from Plans not mapped is an identified, paying
              // subscriber: Attribute and Flash's record mean something there,
              // "Dismiss as nobody's" can only be refused (404) — so it is not offered.
              <SignupActionsMenu
                id={handle.subscriptionId}
                busy={busyKeys.has(handle.subscriptionId)}
                canDismiss={handle.from !== "unmapped_plans"}
                testIdPrefix={`billing-exhausted-actions-${eventId}`}
                itemPrefix="billing-exhausted-action"
                {...signupActions}
              />
            ) : (
              <span className="text-[11px] text-slate-400 dark:text-slate-500">
                no signup to settle — see the Flash dashboard
              </span>
            )}
          </ExhaustedEventRowView>
        );
      }
      default:
        return (
          <li key={i}>
            <DivergenceRow row={row} />
          </li>
        );
    }
  };
  // An exhausted event a signup group already shows adds only its attempts,
  // which the group carries — it folds; the heading keeps the server's count
  // and says how many folded, so the number still reconciles.
  const exhausted = kind === "exhausted_events" ? splitExhausted(section.rows, handlesByEventId) : null;
  const rows = exhausted ? exhausted.standalone : section.rows;
  const countLabel =
    exhausted && exhausted.folded > 0
      ? `${section.count} · ${exhausted.folded === section.count ? (section.count === 2 ? "both" : "all") : exhausted.folded} listed above`
      : undefined;
  return (
    <div data-testid={`billing-divergence-${kind}`}>
      <DivergenceHeading kind={kind} meta={meta} tier={tier} section={section} countLabel={countLabel} />
      {rows.length > 0 && <ul className="mt-1.5 space-y-1">{rows.map(typed)}</ul>}
    </div>
  );
}
