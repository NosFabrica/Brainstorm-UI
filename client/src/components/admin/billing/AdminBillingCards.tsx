import { useState } from "react";
import { ChevronLeft, ChevronRight, ExternalLink, Loader2, XCircle } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiClient, type AdminBillingSubscription } from "@/services/api";
import { orderedSections, subscriptionIdsByEventId, type OrderedSection } from "./divergenceSections";
import { StatTile } from "@/components/ui/stat-tile";
import { ScrollableTable } from "@/components/admin/ScrollableTable";
import { sourceLabel, statusLabel } from "./billingEventCopy";

import { PlanMappingFormDialog } from "./PlanMappingFormDialog";
import { FlashRecordDialog, type FlashRecordTarget } from "./FlashRecordDialog";
import { BrainstormUserPicker } from "./BrainstormUserPicker";
import type { BrainstormUser } from "./brainstormUserSearch";
import { BillingSortHeader } from "./BillingSortHeader";
import { type ConfirmSubject, ConfirmSubscriptionAction } from "./ConfirmSubscriptionAction";
import { DivergenceTierGroup, DivergenceBlock } from "./DivergenceBlock";
import { SubscriberRow } from "./SubscriberRow";
import { UnresolvedSignupsBlock } from "./UnresolvedSignupsBlock";
import { filterAndSort } from "./rosterFilter";
import { FLASH_DASHBOARD_URL, shortNpub, th, thLast } from "./rosterShared";
import { useRosterProfiles } from "./useRosterProfiles";
import { PAGE_SIZE, useBillingRoster } from "./useBillingRoster";
import { useRosterActions } from "./useRosterActions";
import { rosterStats, dismissDeliveryCount } from "./rosterStats";

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
  const faults = sections.filter((x) => x.tier === "fault");
  const record = sections.filter((x) => x.tier === "record");
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
        onResync={handleResyncPubkey}
        onReset={setConfirmReset}
        handlesByEventId={handlesByEventId}
        signupActions={signupActions}
        onCreateMapping={setMappingFor}
      />
    );

  return (
    <div>
      {/* The User Database's header, so the two rosters read as one system:
          the name, then count · page · source, with the search and filters
          beside them. */}
      <div
        className="flex flex-col gap-3 border-b border-brand-accent/10 px-3 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5"
        data-testid="billing-roster-header"
      >
        <div>
          <h3
            className="text-sm font-bold text-slate-900 dark:text-slate-100"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Billing
          </h3>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {(filtering ? matched.length : total).toLocaleString()}{" "}
              {(filtering ? matched.length : total) === 1 ? "subscriber" : "subscribers"}
              {filtering ? (partial ? " on this page (reading every page…)" : " match") : ""}
            </span>
            <span className="text-[10px] text-slate-400 dark:text-slate-500">|</span>
            <span className="text-[10px] text-slate-400 dark:text-slate-500">
              Page {page} of {pages}
            </span>
          </div>
        </div>
        {items.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full sm:w-56">
              <input
                type="text"
                placeholder="Search name, npub, tier…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white/80 px-3 py-1.5 pr-7 text-xs focus:border-brand-accent/40 focus:outline-none focus:ring-2 focus:ring-brand-accent/30 dark:border-slate-800 dark:bg-slate-900/80"
                data-testid="input-billing-search"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-300"
                  data-testid="button-billing-clear-search"
                >
                  <XCircle className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            {serviceOptions.length > 1 && (
              <div
                role="group"
                aria-label="Flash service"
                className="inline-flex h-8 items-center rounded-xl border border-slate-200 bg-white/80 p-0.5 dark:border-slate-800 dark:bg-slate-900/80"
                data-testid="billing-service-filter"
              >
                {[{ id: "all", label: "All services" }, ...serviceOptions].map((opt) => {
                  const pressed = serviceFilter === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      aria-pressed={pressed}
                      onClick={() => setServiceFilter(opt.id)}
                      className={`h-7 rounded-lg px-2.5 text-xs font-medium transition-colors ${pressed ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900" : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"}`}
                      data-testid={`billing-service-filter-${opt.id}`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            )}
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger
                className="h-8 w-32 rounded-xl border-slate-200 text-xs dark:border-slate-800"
                data-testid="select-billing-status"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {statuses.map((s) => (
                  <SelectItem key={s} value={s}>
                    {statusLabel(s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={sourceFilter} onValueChange={setSourceFilter}>
              <SelectTrigger
                className="h-8 w-32 rounded-xl border-slate-200 text-xs dark:border-slate-800"
                data-testid="select-billing-source"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sources</SelectItem>
                {sources.map((s) => (
                  <SelectItem key={s} value={s}>
                    {sourceLabel(s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {filtering && (
              <span className="text-xs text-slate-400 dark:text-slate-500" data-testid="billing-filter-count">
                {matched.length} of {outOf}
                {partial ? " on this page" : ""}
              </span>
            )}
          </div>
        )}
      </div>
      <div className="space-y-6 px-3 py-4 sm:px-5">
        {/* The tab's numbers in one line above its lists — counts, not the
          subject, so they take a row and not a band. Faults is the way down to the report. */}
        <div className="flex flex-wrap items-center gap-2" data-testid="billing-stats">
          <StatTile compact value={stats.active} label="Active" tone="success" data-testid="billing-stat-active" />
          <StatTile
            compact
            value={stats.past_due}
            label="Past due"
            tone={stats.past_due > 0 ? "warning" : "neutral"}
            data-testid="billing-stat-past_due"
          />
          <StatTile compact value={stats.pending} label="Pending" tone="neutral" data-testid="billing-stat-pending" />
          <StatTile compact value={stats.ending} label="Ending soon" tone="neutral" data-testid="billing-stat-ending" />
          <StatTile
            compact
            value={stats.faults}
            label="Faults"
            tone={stats.faults > 0 ? "warning" : "success"}
            role="button"
            tabIndex={0}
            onClick={() =>
              document
                .querySelector('[data-testid="card-billing-divergence"]')
                ?.scrollIntoView({ behavior: "smooth", block: "start" })
            }
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ")
                document
                  .querySelector('[data-testid="card-billing-divergence"]')
                  ?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
            className="cursor-pointer transition-colors hover:border-brand-accent/40"
            data-testid="billing-stat-faults"
          />
        </div>
        {/* Subscriber roster — attributed by construction (pubkey-keyed). */}
        <div>
          {items.length === 0 ? (
            <p className="py-4 text-sm text-slate-500 dark:text-slate-400" data-testid="billing-subscribers-empty">
              No subscribers yet.
            </p>
          ) : filtered.length === 0 ? (
            <p className="py-4 text-sm text-slate-500 dark:text-slate-400" data-testid="billing-subscribers-no-match">
              No subscribers match your filters.
            </p>
          ) : (
            <div>
              <ScrollableTable>
                <table
                  className="w-full min-w-[860px] border-collapse border border-slate-200 text-left dark:border-slate-800"
                  data-testid="table-billing-subscribers"
                >
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/80 dark:border-slate-800 dark:bg-slate-900/80">
                      <th className={th}>
                        <BillingSortHeader label="Subscriber" sortKey="subscriber" sort={sort} onSort={toggleSort} />
                      </th>
                      <th className={th}>
                        <BillingSortHeader label="Status" sortKey="status" sort={sort} onSort={toggleSort} />
                      </th>
                      <th className={th}>
                        <BillingSortHeader label="Service" sortKey="service" sort={sort} onSort={toggleSort} />
                      </th>
                      <th className={th}>
                        <BillingSortHeader label="Tier" sortKey="scheduling" sort={sort} onSort={toggleSort} />
                      </th>
                      <th className={th}>
                        <BillingSortHeader label="Source" sortKey="source" sort={sort} onSort={toggleSort} />
                      </th>
                      <th className={th}>
                        <BillingSortHeader label="Period" sortKey="period" sort={sort} onSort={toggleSort} />
                      </th>
                      <th className={th}>Interval</th>
                      <th className={th}>Cycle</th>
                      <th className={th}>
                        <BillingSortHeader label="Next bill" sortKey="nextbill" sort={sort} onSort={toggleSort} />
                      </th>
                      <th className={th}>
                        <BillingSortHeader label="Last synced" sortKey="synced" sort={sort} onSort={toggleSort} />
                      </th>
                      <th className={thLast}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((s) => (
                      <SubscriberRow
                        key={s.pubkey}
                        s={s}
                        profile={profiles.get(s.pubkey)}
                        serviceNames={serviceNames}
                        busy={busyKeys.has(s.pubkey)}
                        onBlock={setConfirmBlock}
                        onUnblock={(sub) => handleSetBlock(sub, false)}
                        onResync={handleResync}
                        onViewFlashRecord={(sub) =>
                          setFlashRecordFor({
                            key: sub.pubkey,
                            label: shortNpub(sub.pubkey).short,
                            read: () => apiClient.getAdminBillingFlashRecordForSubscriber(sub.pubkey),
                          })
                        }
                        onCancel={(sub) => {
                          setCancelReason("");
                          setConfirmCancel(sub);
                        }}
                        onPause={setConfirmPause}
                        onResume={setConfirmResume}
                      />
                    ))}
                  </tbody>
                </table>
              </ScrollableTable>
              {pages > 1 && (
                <div
                  className="mt-2 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400"
                  data-testid="billing-pager"
                >
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 transition-colors hover:bg-slate-50 disabled:opacity-40 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800"
                    data-testid="billing-pager-prev"
                  >
                    <ChevronLeft className="h-3 w-3" /> Prev
                  </button>
                  <span className="tabular-nums">
                    Page {page} of {pages} · {filtering ? `${matched.length} of ${outOf}` : total} subscribers
                  </span>
                  <button
                    type="button"
                    disabled={page >= pages}
                    onClick={() => setPage((p) => p + 1)}
                    className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 transition-colors hover:bg-slate-50 disabled:opacity-40 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800"
                    data-testid="billing-pager-next"
                  >
                    Next <ChevronRight className="h-3 w-3" />
                  </button>
                </div>
              )}
            </div>
          )}
          <a
            href={FLASH_DASHBOARD_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-brand-link hover:underline"
            data-testid="link-flash-dashboard"
          >
            Invoices, refunds and management live in the Flash dashboard
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>

        {/* Divergence — the server's "everything nobody has settled" report. */}
        {/* A neutral card: most of its rows are for the record, so the warning
          colour belongs to the Faults kicker and the counts, not the whole band
          (colour to communicate, not decorate). One sentence of intro — an
          admin reads this daily; each section's first sentence follows, the
          rest on hover. */}
        <div
          className="rounded-xl border border-slate-200 bg-white/60 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/40"
          data-testid="card-billing-divergence"
        >
          <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">Needs attention</h4>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            What Flash and Brainstorm disagree on. Faults first, then what is worth knowing.
          </p>
          {divergenceQuery.isError ? (
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400" data-testid="billing-divergence-error">
              Couldn't load the divergence report.
            </p>
          ) : sections.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400" data-testid="billing-divergence-empty">
              Nothing unsettled — Flash and the scheduler agree.
            </p>
          ) : (
            <div className="mt-3 space-y-4">
              <DivergenceTierGroup tier="fault" sections={faults} render={renderSection} />
              <DivergenceTierGroup tier="record" sections={record} render={renderSection} />
            </div>
          )}
        </div>

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
        <Dialog open={!!confirmBlock} onOpenChange={(o) => !o && setConfirmBlock(null)}>
          <DialogContent data-testid="dialog-billing-block-confirm">
            <DialogHeader>
              <DialogTitle>Block billing for this subscriber?</DialogTitle>
              <DialogDescription>
                {confirmBlock
                  ? `“${shortNpub(confirmBlock.pubkey).short}” will be withheld from paid entitlement no matter what they pay, and any tier billing granted them is taken back now. This does not cancel or refund anything — Flash keeps charging them until the subscription is cancelled.`
                  : ""}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirmBlock(null)} data-testid="button-billing-block-cancel">
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={async () => {
                  const sub = confirmBlock;
                  setConfirmBlock(null);
                  if (sub) await handleSetBlock(sub, true);
                }}
                data-testid="button-billing-block-confirm"
              >
                Block billing
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
