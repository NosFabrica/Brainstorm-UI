import { apiClient, type AdminBillingDivergenceSection } from "@/services/api";
import { DivergenceHeading } from "./DivergenceBlock";
import { SignupGroupView } from "./DivergenceRows";
import { SignupActionsMenu } from "./SignupActionsMenu";
import { type DivergenceMeta, groupSignups } from "./divergenceSections";
import { flashSubscriptionUrl } from "./rosterShared";

/**
 * The one divergence section an admin can settle from here, rather than only
 * read: a payment that named nobody, to be attached to the person who made it
 * or written off.
 *
 * Both verbs, or neither is any use — the payment provider's own card tests
 * are dismissals, and they would otherwise sit in the report forever.
 *
 * The row itself carries no status, amount or dates: the server holds only the
 * delivery, and Flash's payload has no contact details in it at all. So the
 * raw record and the link out are the surface, not an extra — an unresolved
 * signup can perfectly well be one Flash has already cancelled, and this is
 * the only place that shows.
 */
export function UnresolvedSignupsBlock({
  meta,
  section,
  exhaustedRows,
  busyIds,
  onViewFlashRecord,
  onAttribute,
  onDismiss,
}: {
  meta: DivergenceMeta | null;
  section: AdminBillingDivergenceSection;
  /** The exhausted section's rows: the attempts a delivery gave up after ride its line. */
  exhaustedRows: ReadonlyArray<unknown>;
  busyIds: ReadonlySet<string>;
  onViewFlashRecord: (subscriptionId: string) => void;
  onAttribute: (subscriptionId: string) => void;
  onDismiss: (subscriptionId: string) => void;
}) {
  // One signup reads as one problem: two events (started, then cancelled) carry
  // one Flash id, so they are one entry with one menu — the menu sits on the
  // thing it acts on, and what a dismiss will clear is listed beneath it.
  const groups = groupSignups(section.rows, exhaustedRows);
  const countLabel =
    groups.length < section.count
      ? `${section.count} deliveries · ${groups.length} ${groups.length === 1 ? "signup" : "signups"}`
      : undefined;
  return (
    <div data-testid="billing-divergence-unresolved_signups">
      <DivergenceHeading kind="unresolved_signups" meta={meta} tier="fault" section={section} countLabel={countLabel} />
      <ul className="mt-1.5 space-y-1.5">
        {groups.map((group) => {
          const id = group.subscriptionId;
          return (
            <SignupGroupView
              key={id ?? `delivery-${group.deliveries[0]?.id}`}
              group={group}
              flashUrl={flashSubscriptionUrl}
              readFlashRecord={(sid) => apiClient.getAdminBillingFlashRecordForUnresolved(sid)}
            >
              {id && (
                <SignupActionsMenu
                  id={id}
                  busy={busyIds.has(id)}
                  testIdPrefix={`billing-unresolved-actions-${id}`}
                  itemPrefix="billing-unresolved-action"
                  onViewFlashRecord={onViewFlashRecord}
                  onAttribute={onAttribute}
                  onDismiss={onDismiss}
                />
              )}
            </SignupGroupView>
          );
        })}
      </ul>
    </div>
  );
}
