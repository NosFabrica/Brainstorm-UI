import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { apiClient, type AdminBillingSubscription } from "@/services/api";
import { orderedSections, subscriptionIdsByEventId, type OrderedSection } from "./divergenceSections";

import { PlanMappingFormDialog } from "./PlanMappingFormDialog";
import { FlashRecordDialog, type FlashRecordTarget } from "./FlashRecordDialog";
import { BrainstormUserPicker } from "./BrainstormUserPicker";
import type { BrainstormUser } from "./brainstormUserSearch";
import { type ConfirmSubject, ConfirmSubscriptionAction } from "./ConfirmSubscriptionAction";
import { DivergenceBlock } from "./DivergenceBlock";
import { UnresolvedSignupsBlock } from "./UnresolvedSignupsBlock";
import { filterAndSort } from "./rosterFilter";
import { shortNpub } from "./rosterShared";
import { useRosterProfiles } from "./useRosterProfiles";
import { PAGE_SIZE, useBillingRoster } from "./useBillingRoster";
import { useRosterActions } from "./useRosterActions";
import { rosterStats, dismissDeliveryCount } from "./rosterStats";
import { BillingRosterHeader } from "./BillingRosterHeader";
import { BillingStats } from "./BillingStats";
import { BlockConfirmDialog } from "./BlockConfirmDialog";
import { DivergenceReport } from "./DivergenceReport";
import { type SubscriberRowActions, SubscribersTable } from "./SubscribersTable";

/**
 * The admin Billing tab: the server's subscriber roster (pubkey-keyed — every
 * row is attributed by construction), and its divergence report — "everything
 * nobody has settled": disagreements between Flash and what users actually
 * receive, including signups that couldn't be matched to an account.
 */
export function AdminBillingCards({ active }: { active: boolean }) {
  const {
    page,
    setPage,
    subsQuery,
    divergenceQuery,
    policiesQuery,
    serviceNames,
    policyName,
    search,
    setSearch,
    statusFilter,
    setStatusFilter,
    sourceFilter,
    setSourceFilter,
    serviceFilter,
    setServiceFilter,
    sort,
    viewingAll,
    allLoaded,
    rosterItems,
    serviceOf,
    serviceLabelOf,
    serviceOptions,
    toggleSort,
  } = useBillingRoster(active);
  const {
    mappingFor,
    setMappingFor,
    mappingSubmitting,
    mappingError,
    setMappingError,
    busyKeys,
    handleCreateMapping,
    handleResync,
    handleResyncPubkey,
    handleResetPubkey,
    handleSetBlock,
    handleCancel,
    handleSetStatus,
    handleAttribute,
    handleDismiss,
  } = useRosterActions();
  const [attributeFor, setAttributeFor] = useState<string | null>(null);
  const [attributePicked, setAttributePicked] = useState<BrainstormUser | null>(null);
  // Either common form is accepted here; only hex ever leaves. Decoding in the
  // client means a mistyped key is refused before it costs a round trip, and
  // the server never has to know npub exists.
  const attributePubkey = attributePicked?.pubkey ?? null;
  // Before the early returns — hook order must not change between renders. The
  // candidate rides along with the roster so the person about to be granted is
  // named the same way everyone else is.
  // The report's people ride along too, so a fault row shows who, not a hex.
  const reportPubkeys = Object.values(divergenceQuery.data ?? {}).flatMap((section) =>
    (section?.rows ?? [])
      .map((r) => (r as { pubkey?: unknown }).pubkey)
      .filter((pk): pk is string => typeof pk === "string" && pk.length === 64),
  );
  const [dismissFor, setDismissFor] = useState<string | null>(null);
  const [confirmBlock, setConfirmBlock] = useState<AdminBillingSubscription | null>(null);
  const [confirmCancel, setConfirmCancel] = useState<AdminBillingSubscription | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [confirmPause, setConfirmPause] = useState<AdminBillingSubscription | null>(null);
  const [confirmResume, setConfirmResume] = useState<AdminBillingSubscription | null>(null);
  // The pubkey whose admin override is about to be dropped.
  const [confirmReset, setConfirmReset] = useState<string | null>(null);
  const [flashRecordFor, setFlashRecordFor] = useState<FlashRecordTarget | null>(null);
  const profiles = useRosterProfiles([
    ...rosterItems.map((s) => s.pubkey),
    ...reportPubkeys,
    ...(attributePubkey ? [attributePubkey] : []),
  ]);

  /** A roster row as the confirm dialog wants it: who, plus their kind-0. */
  const subjectOf = (s: AdminBillingSubscription | null): ConfirmSubject | null =>
    s ? { pubkey: s.pubkey, profile: profiles.get(s.pubkey) } : null;

  if (subsQuery.isPending) {
    return (
      <div className="flex items-center gap-2 py-6 text-sm text-slate-500 dark:text-slate-400">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading subscriptions…
      </div>
    );
  }

  if (subsQuery.isError) {
    return (
      <div className="py-6 text-sm text-slate-500 dark:text-slate-400" data-testid="billing-subscribers-error">
        Couldn't load subscriptions — the server's billing endpoint may not be live yet.
        <div className="mt-1 text-xs text-slate-400 dark:text-slate-500">{(subsQuery.error as Error)?.message}</div>
      </div>
    );
  }

  const { items, total } = subsQuery.data;
  const divergence = divergenceQuery.data ?? {};

  // Viewing all (a search, a filter, a sort): every page's subscribers, matched
  // and sorted here, then paged here. Otherwise the server's page as it is.
  const matched = filterAndSort(
    rosterItems,
    profiles,
    search,
    statusFilter,
    sourceFilter,
    serviceFilter,
    serviceOf,
    serviceLabelOf,
    sort,
  );
  const pages = viewingAll ? Math.max(1, Math.ceil(matched.length / PAGE_SIZE)) : (subsQuery.data.pages ?? 1);
  const filtered = viewingAll ? matched.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE) : matched;
  // What the count is out of: everyone once every page is in, else the page on screen.
  const outOf = allLoaded ? rosterItems.length : items.length;
  const partial = viewingAll && !allLoaded;
  const statuses = Array.from(new Set(rosterItems.map((s) => s.flash_status))).sort();
  const sources = Array.from(new Set(rosterItems.map((s) => s.scheduling_source))).sort();
  const filtering = search.trim() !== "" || statusFilter !== "all" || sourceFilter !== "all" || serviceFilter !== "all";
  // Faults first, the record below, anything this build doesn't know last.
  const sections = orderedSections(divergence);
  // An exhausted event borrows the Flash id its signup row carries.
  const handlesByEventId = subscriptionIdsByEventId(divergence);
  // Numbers first.
  const stats = rosterStats(items, divergence, handlesByEventId);
  // The deliveries the report lists for the signup being dismissed — a floor
  // for the dialog's count.
  const dismissDeliveries = dismissDeliveryCount(divergence, dismissFor);
  const signupActions = {
    onViewFlashRecord: (id: string) =>
      setFlashRecordFor({ key: id, label: id, read: () => apiClient.getAdminBillingFlashRecordForUnresolved(id) }),
    onAttribute: (id: string) => {
      setAttributePicked(null);
      setAttributeFor(id);
    },
    onDismiss: setDismissFor,
  };
  const renderSection = (x: OrderedSection) =>
    x.kind === "unresolved_signups" ? (
      <UnresolvedSignupsBlock
        key={x.kind}
        meta={x.meta}
        section={x.section}
        exhaustedRows={divergence.exhausted_events?.rows ?? []}
        busyIds={busyKeys}
        {...signupActions}
      />
    ) : (
      <DivergenceBlock
        key={x.kind}
        kind={x.kind}
        meta={x.meta}
        tier={x.tier}
        section={x.section}
        profiles={profiles}
        policyName={policyName}
        busyKeys={busyKeys}
        onResync={(pubkey) => void handleResyncPubkey(pubkey)}
        onReset={setConfirmReset}
        handlesByEventId={handlesByEventId}
        signupActions={signupActions}
        onCreateMapping={setMappingFor}
      />
    );

  const rowActions: SubscriberRowActions = {
    onBlock: setConfirmBlock,
    onUnblock: (sub) => void handleSetBlock(sub, false),
    onResync: (sub) => void handleResync(sub),
    onViewFlashRecord: (sub) =>
      setFlashRecordFor({
        key: sub.pubkey,
        label: shortNpub(sub.pubkey).short,
        read: () => apiClient.getAdminBillingFlashRecordForSubscriber(sub.pubkey),
      }),
    onCancel: (sub) => {
      setCancelReason("");
      setConfirmCancel(sub);
    },
    onPause: setConfirmPause,
    onResume: setConfirmResume,
  };

  return (
    <div>
      <BillingRosterHeader
        items={items}
        total={total}
        matched={matched}
        outOf={outOf}
        page={page}
        pages={pages}
        filtering={filtering}
        partial={partial}
        statuses={statuses}
        sources={sources}
        search={search}
        setSearch={setSearch}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
        sourceFilter={sourceFilter}
        setSourceFilter={setSourceFilter}
        serviceFilter={serviceFilter}
        setServiceFilter={setServiceFilter}
        serviceOptions={serviceOptions}
      />
      <div className="space-y-6 px-3 py-4 sm:px-5">
        <BillingStats stats={stats} />
        <SubscribersTable
          items={items}
          filtered={filtered}
          matched={matched}
          total={total}
          outOf={outOf}
          filtering={filtering}
          page={page}
          setPage={setPage}
          pages={pages}
          sort={sort}
          toggleSort={toggleSort}
          profiles={profiles}
          serviceNames={serviceNames}
          busyKeys={busyKeys}
          rowActions={rowActions}
        />

        {/* Divergence — the server's "everything nobody has settled" report. */}
        {/* A neutral card: most of its rows are for the record, so the warning
          colour belongs to the Faults kicker and the counts, not the whole band
          (colour to communicate, not decorate). One sentence of intro — an
          admin reads this daily; each section's first sentence follows, the
          rest on hover. */}
        <DivergenceReport isError={divergenceQuery.isError} sections={sections} render={renderSection} />

        <FlashRecordDialog target={flashRecordFor} onClose={() => setFlashRecordFor(null)} />

        {/* The fix for an unmapped plan, prefilled from the row that needs it.
          Mounted per row: the form seeds its fields once, on mount. */}
        {mappingFor && (
          <PlanMappingFormDialog
            key={`${mappingFor.flash_service_id}:${mappingFor.flash_plan_id}`}
            open
            mode="create"
            initial={{
              flash_service_id: mappingFor.flash_service_id ?? "",
              flash_plan_id: mappingFor.flash_plan_id ?? "",
              // Default to the first paid policy: a mapping that grants Free sells nothing.
              scheduling_id: policiesQuery.data?.find((p) => !p.is_default)?.id ?? policiesQuery.data?.[0]?.id ?? 0,
              is_active: true,
            }}
            policies={policiesQuery.data ?? []}
            submitting={mappingSubmitting}
            serverError={mappingError}
            onOpenChange={(open) => {
              if (!open) {
                setMappingFor(null);
                setMappingError(null);
              }
            }}
            onSubmit={handleCreateMapping}
          />
        )}

        {/* Attributing grants a tier, so it is confirmed like any other grant —
          and the person is shown, not just the key that was pasted. */}
        <ConfirmSubscriptionAction
          subject={
            attributeFor
              ? {
                  pubkey: attributePubkey,
                  handle: attributeFor,
                  profile: attributePubkey
                    ? (profiles.get(attributePubkey) ??
                      (attributePicked ? { name: attributePicked.name, picture: attributePicked.picture } : undefined))
                    : undefined,
                }
              : null
          }
          kind="attribute"
          title="Attribute this signup to someone?"
          confirmLabel="Attribute signup"
          confirmDisabled={!attributePubkey}
          destructive={false}
          dismissLabel="Cancel"
          onDismiss={() => {
            setAttributeFor(null);
            setAttributePicked(null);
          }}
          onConfirm={async () => {
            const id = attributeFor;
            const pubkey = attributePubkey;
            setAttributeFor(null);
            setAttributePicked(null);
            if (id && pubkey) await handleAttribute(id, pubkey);
          }}
        >
          <>
            Grants whatever <span className="break-all font-mono text-[11px]">{attributeFor}</span> pays for, exactly as
            a webhook naming them would have. Who actually paid is visible only in Flash's dashboard, so check there
            before granting. Only someone with a Brainstorm account can be granted a plan.
            <BrainstormUserPicker value={attributePicked} onChange={setAttributePicked} />
          </>
        </ConfirmSubscriptionAction>

        {/* No person to name — the provider's own card tests are the common case
          here, and the subscription id is all such a row has. The count is a
          floor, never exact: the report lists only deliveries that failed, and
          a dismiss also settles one still inside its retry budget. */}
        <ConfirmSubscriptionAction
          subject={dismissFor ? { handle: dismissFor } : null}
          kind="dismiss"
          title="Write this signup off as nobody's?"
          confirmLabel="Dismiss signup"
          onDismiss={() => setDismissFor(null)}
          onConfirm={async () => {
            const id = dismissFor;
            setDismissFor(null);
            if (id) await handleDismiss(id);
          }}
        >
          {dismissDeliveries > 1
            ? `Grants nothing and clears at least ${dismissDeliveries} deliveries of this signup from the report — the ones listed, and any still being retried — so the sweep stops re-checking it.`
            : "Grants nothing and clears it from this report, so the sweep stops re-checking it."}{" "}
          It does not cancel or refund anything — Flash took the money and that stays there.
        </ConfirmSubscriptionAction>

        {/* Every write that reaches Flash names the person before it happens, the
          same way a manual tier change does. */}
        <ConfirmSubscriptionAction
          subject={confirmReset ? { pubkey: confirmReset, profile: profiles.get(confirmReset) } : null}
          kind="reset"
          title="Reset this tier to default?"
          confirmLabel="Reset to default"
          destructive={false}
          onDismiss={() => setConfirmReset(null)}
          onConfirm={async () => {
            const pubkey = confirmReset;
            setConfirmReset(null);
            if (pubkey) await handleResetPubkey(pubkey);
          }}
        >
          Drops the admin override, so billing decides from now on — a paying subscriber keeps the policy they pay for;
          anyone else returns to the default.
        </ConfirmSubscriptionAction>

        <ConfirmSubscriptionAction
          subject={subjectOf(confirmCancel)}
          kind="cancel"
          title="Cancel this subscription in Flash?"
          confirmLabel="Cancel subscription"
          onDismiss={() => setConfirmCancel(null)}
          onConfirm={async () => {
            const sub = confirmCancel;
            const reason = cancelReason;
            setConfirmCancel(null);
            if (sub) await handleCancel(sub, reason);
          }}
        >
          <>
            Ends their subscription in Flash. Depending on the account's cancellation policy they may keep their tier
            until the paid period ends — the confirmation says when, and Flash may still report them active until then.
            Nothing here refunds anything.
            <Input
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Reason (optional) — recorded in Flash"
              className="mt-3"
              data-testid="input-billing-cancel-reason"
            />
          </>
        </ConfirmSubscriptionAction>

        <ConfirmSubscriptionAction
          subject={subjectOf(confirmPause)}
          kind="pause"
          title="Pause this subscription in Flash?"
          confirmLabel="Pause subscription"
          onDismiss={() => setConfirmPause(null)}
          onConfirm={async () => {
            const sub = confirmPause;
            setConfirmPause(null);
            if (sub) await handleSetStatus(sub, "paused");
          }}
        >
          Suspends billing in Flash and takes their paid tier off while it is paused. Resuming puts both back.
        </ConfirmSubscriptionAction>

        {/* Resuming is confirmed too, unlike unblocking: it restarts a charge,
          and that is money moving on somebody's card. */}
        <ConfirmSubscriptionAction
          subject={subjectOf(confirmResume)}
          kind="resume"
          title="Resume this subscription in Flash?"
          confirmLabel="Resume subscription"
          destructive={false}
          onDismiss={() => setConfirmResume(null)}
          onConfirm={async () => {
            const sub = confirmResume;
            setConfirmResume(null);
            if (sub) await handleSetStatus(sub, "active");
          }}
        >
          Puts the subscription back to active in Flash. Billing starts again on its normal schedule, and their paid
          tier comes back.
        </ConfirmSubscriptionAction>

        {/* Blocking is confirmed because of the part that surprises people: the
          money keeps moving. Unblocking isn't — it only re-opens a door. */}
        <BlockConfirmDialog confirmBlock={confirmBlock} setConfirmBlock={setConfirmBlock} onBlock={handleSetBlock} />
      </div>
    </div>
  );
}
