import { useEffect, useMemo, useState } from "react";
import { keepPreviousData, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { useToast } from "@/hooks/use-toast";
import { formatBillingDate } from "@/lib/plans";
import { apiClient, type AdminBillingSubscription, type AdminBillingSubscriptionAction } from "@/services/api";
import {
  DIVERGENCE_META,
  orderedSections,
  subscriptionIdsByEventId,
  type OrderedSection,
  groupSignups,
} from "./divergenceSections";
import { StatTile } from "@/components/ui/stat-tile";
import { readEveryPage } from "@/components/admin/useAdminHeaderMetrics";
import { ScrollableTable } from "@/components/admin/ScrollableTable";
import { sourceLabel, statusLabel } from "./billingEventCopy";
import { flashRecordKey, recordFromBody } from "./FlashFactsStrip";

import type {
  CreateAdminBillingPlanBody,
  SchedulingItem,
  UnmappedPlanRow,
  UpdateAdminBillingPlanBody,
} from "@/services/api";
import { DIVERGENCE_KEY, FLASH_SERVICES_KEY, POLICIES_KEY, SUBS_KEY, USERS_KEY } from "./queryKeys";

const PAGE_SIZE = 100;
const NO_SUBS: AdminBillingSubscription[] = [];
import { PlanMappingFormDialog } from "./PlanMappingFormDialog";
import { FlashRecordDialog, type FlashRecordTarget } from "./FlashRecordDialog";
import { BrainstormUserPicker } from "./BrainstormUserPicker";
import type { BrainstormUser } from "./brainstormUserSearch";
import { PLANS_KEY } from "./queryKeys";
import { BillingSortHeader } from "./BillingSortHeader";
import { type ConfirmSubject, ConfirmSubscriptionAction } from "./ConfirmSubscriptionAction";
import { DivergenceTierGroup, DivergenceBlock } from "./DivergenceBlock";
import { SubscriberRow } from "./SubscriberRow";
import { UnresolvedSignupsBlock } from "./UnresolvedSignupsBlock";
import { filterAndSort } from "./rosterFilter";
import {
  type SortState,
  FLASH_DASHBOARD_URL,
  entitlementReasonText,
  shortNpub,
  th,
  thLast,
  type SortKey,
} from "./rosterShared";
import { useRosterProfiles } from "./useRosterProfiles";

/**
 * The admin Billing tab: the server's subscriber roster (pubkey-keyed — every
 * row is attributed by construction), and its divergence report — "everything
 * nobody has settled": disagreements between Flash and what users actually
 * receive, including signups that couldn't be matched to an account.
 */
export function AdminBillingCards({ active }: { active: boolean }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  // One page at a time; filters and sort stay in component state across pages.
  const [page, setPage] = useState(1);
  const subsQuery = useQuery({
    queryKey: [...SUBS_KEY, page],
    queryFn: () => apiClient.getAdminBillingSubscriptions(page, PAGE_SIZE),
    enabled: active,
    staleTime: 60_000,
    retry: 1,
    placeholderData: keepPreviousData,
  });
  const divergenceQuery = useQuery({
    queryKey: DIVERGENCE_KEY,
    queryFn: () => apiClient.getAdminBillingDivergence(),
    enabled: active,
    staleTime: 60_000,
    retry: 1,
  });
  // Scheduling policies by id — the report names policies by id only.
  const policiesQuery = useQuery<SchedulingItem[]>({
    queryKey: POLICIES_KEY,
    queryFn: () => apiClient.getSchedulingPolicies(),
    enabled: active,
    staleTime: 5 * 60_000,
    retry: 1,
  });
  // Flash keeps one service per environment, so a subscriber's service says
  // whether they came in through production or staging (Benjamin, 2026-09-09:
  // "right now we can't tell where the users are coming from"). The roster
  // row carries no service; the Flash record each row reads does.
  const servicesQuery = useQuery({
    queryKey: FLASH_SERVICES_KEY,
    queryFn: () => apiClient.getAdminBillingFlashServices(),
    enabled: active,
    staleTime: 5 * 60_000,
    retry: false,
  });
  const serviceNames = useMemo(
    () => new Map((servicesQuery.data ?? []).map((svc) => [svc.id, svc.name])),
    [servicesQuery.data],
  );
  const policyName = (id: number | null | undefined): string => {
    if (id == null) return "—";
    return policiesQuery.data?.find((p) => p.id === id)?.name ?? `policy #${id}`;
  };
  // An unmapped plan's fix is a mapping — the form opens prefilled with Flash's ids.
  const [mappingFor, setMappingFor] = useState<UnmappedPlanRow | null>(null);
  const [mappingSubmitting, setMappingSubmitting] = useState(false);
  const [mappingError, setMappingError] = useState<string | null>(null);
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
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [serviceFilter, setServiceFilter] = useState<string>("all");
  const [sort, setSort] = useState<SortState>(null);
  const [confirmBlock, setConfirmBlock] = useState<AdminBillingSubscription | null>(null);
  const [confirmCancel, setConfirmCancel] = useState<AdminBillingSubscription | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [confirmPause, setConfirmPause] = useState<AdminBillingSubscription | null>(null);
  const [confirmResume, setConfirmResume] = useState<AdminBillingSubscription | null>(null);
  // The pubkey whose admin override is about to be dropped.
  const [confirmReset, setConfirmReset] = useState<string | null>(null);
  const [flashRecordFor, setFlashRecordFor] = useState<FlashRecordTarget | null>(null);
  // Keyed by whatever handle the row has: a pubkey for a subscriber, a Flash
  // subscription id for a signup that named nobody. A set: two rows' actions
  // can run at once, and one finishing must not clear the other's spinner.
  const [busyKeys, setBusyKeys] = useState<ReadonlySet<string>>(() => new Set());
  // A search, a filter or a sort reads every page: over the page on screen it
  // missed everyone else while the count claimed the whole roster. There is no
  // server-side search on this list.
  const viewingAll =
    search.trim() !== "" || statusFilter !== "all" || sourceFilter !== "all" || serviceFilter !== "all" || !!sort;
  const allSubsQuery = useQuery({
    queryKey: [...SUBS_KEY, "every-page"],
    queryFn: () => readEveryPage((p) => apiClient.getAdminBillingSubscriptions(p, PAGE_SIZE)),
    enabled: active && viewingAll,
    staleTime: 60_000,
    retry: 1,
  });
  // Until every page is in, the page on screen stands in (and says so).
  const allLoaded = viewingAll && !!allSubsQuery.data;
  const rosterItems = (allLoaded ? allSubsQuery.data?.items : subsQuery.data?.items) ?? NO_SUBS;
  // A new search starts from the first page of its results.
  useEffect(() => {
    setPage(1);
  }, [viewingAll, search, statusFilter, sourceFilter, serviceFilter, sort]);
  // The same query the rows run (same key, one fetch). The rows ask for their
  // own as they near the screen; every row's is asked for here only when the
  // service switch or sort needs them all. Otherwise this reads what is cached.
  const needsEveryRecord = serviceFilter !== "all" || sort?.key === "service";
  const recordQueries = useQueries({
    queries: rosterItems.map((s) => ({
      queryKey: flashRecordKey(s.pubkey),
      queryFn: async () => (await apiClient.getAdminBillingFlashRecordForSubscriber(s.pubkey)) ?? null,
      staleTime: 5 * 60_000,
      retry: false,
      enabled: needsEveryRecord,
    })),
  });
  const serviceOf = useMemo(
    () =>
      new Map<string, string | null | undefined>(
        rosterItems.map((s, i) => {
          const q = recordQueries[i];
          return [
            s.pubkey,
            q?.isPending ? undefined : (recordFromBody(q?.data, s.flash_subscription_id)?.serviceId ?? null),
          ];
        }),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rosterItems, recordQueries.map((q) => `${q.isPending}:${q.dataUpdatedAt}`).join("|")],
  );
  const serviceLabelOf = (id: string | null | undefined): string =>
    id ? (serviceNames.get(id) ?? `${id.slice(0, 8)}…`) : "";
  // The switch lists the account's services (one per environment) plus any
  // service a row names that the list does not — and only when there is a
  // choice to make.
  const serviceOptions = useMemo(() => {
    const ids = new Set<string>((servicesQuery.data ?? []).map((svc) => svc.id));
    for (const id of serviceOf.values()) if (id) ids.add(id);
    return Array.from(ids)
      .map((id) => ({ id, label: serviceLabelOf(id) }))
      .sort((a, b) => a.label.localeCompare(b.label));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [servicesQuery.data, serviceOf, serviceNames]);
  const profiles = useRosterProfiles([
    ...rosterItems.map((s) => s.pubkey),
    ...reportPubkeys,
    ...(attributePubkey ? [attributePubkey] : []),
  ]);

  const toggleSort = (key: SortKey) =>
    setSort((prev) => (prev?.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));

  async function runAction(handle: string, fn: () => Promise<void>, failureTitle = "Action failed") {
    setBusyKeys((prev) => new Set(prev).add(handle));
    try {
      await fn();
      await queryClient.invalidateQueries({ queryKey: SUBS_KEY });
      await queryClient.invalidateQueries({ queryKey: DIVERGENCE_KEY });
    } catch (e) {
      toast({
        title: failureTitle,
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setBusyKeys((prev) => {
        const next = new Set(prev);
        next.delete(handle);
        return next;
      });
    }
  }

  async function handleCreateMapping(body: CreateAdminBillingPlanBody | UpdateAdminBillingPlanBody) {
    setMappingSubmitting(true);
    setMappingError(null);
    try {
      await apiClient.createAdminBillingPlan(body as CreateAdminBillingPlanBody);
      await queryClient.invalidateQueries({ queryKey: PLANS_KEY });
      await queryClient.invalidateQueries({ queryKey: DIVERGENCE_KEY });
      setMappingFor(null);
      toast({
        title: "Mapping created",
        description:
          "The plan now grants that policy. The stuck signup replays on the next sweep — or Resync the subscriber to apply it now.",
      });
    } catch (e) {
      setMappingError(e instanceof Error ? e.message : "The server refused the change.");
    } finally {
      setMappingSubmitting(false);
    }
  }

  const handleResync = (s: AdminBillingSubscription) => handleResyncPubkey(s.pubkey);
  const handleResyncPubkey = (pubkey: string) =>
    runAction(pubkey, async () => {
      const out = await apiClient.resyncAdminBillingSubscription(pubkey);
      toast({
        // `applied: false` is a normal answer, not a failure — say which it was
        // rather than leaving the admin to guess from an unchanged row.
        title: out.applied ? "Re-applied from Flash" : "Nothing changed",
        description: entitlementReasonText(out.reason),
      });
    });

  // Drops an admin's override. The server re-reads billing before it answers,
  // so the toast names where they landed — a paying subscriber stays on what
  // they pay for — rather than assuming the default.
  const handleResetPubkey = (pubkey: string) =>
    runAction(
      pubkey,
      async () => {
        const out = await apiClient.clearUserSchedulingOverride(pubkey);
        toast({
          title: "Reset to default",
          description: `Now on ${out.scheduling_name}. Billing decides their tier from here.`,
        });
        // The Users tab and the policies' member lists show the tier too.
        await queryClient.invalidateQueries({ queryKey: USERS_KEY });
        await queryClient.invalidateQueries({ queryKey: POLICIES_KEY });
      },
      "Couldn't reset to default",
    );

  const handleSetBlock = (s: AdminBillingSubscription, blocked: boolean) =>
    runAction(s.pubkey, async () => {
      const out = await apiClient.setAdminBillingBlock(s.pubkey, blocked);
      toast({
        title: blocked ? "Billing blocked" : "Billing unblocked",
        description: blocked
          ? out.revoked
            ? "Their billing-granted tier was taken back. Flash is still charging them — cancel or refund there."
            : "No billing-granted tier to take back. Flash is still charging them — cancel or refund there."
          : "They can be granted again. The next Flash event or a resync applies it.",
      });
    });

  /** Reads `cancellation_scheduled`, never the status — see the type's note. */
  function cancelOutcomeToast(out: AdminBillingSubscriptionAction) {
    if (!out.cancellation_scheduled) {
      toast({
        title: "Nothing was scheduled",
        description:
          "Flash accepted the request but reports no cancellation on this subscription. Check Flash's record before trying again.",
        variant: "destructive",
      });
      return;
    }
    toast({
      title: out.cancel_effective_date ? "Cancellation scheduled" : "Subscription cancelled",
      description:
        (out.cancel_effective_date
          ? `Flash still reports them "${out.flash_status}" until it takes effect on ${formatBillingDate(out.cancel_effective_date)} — that is what end-of-period cancellation looks like, not a failure. They keep their tier until then. `
          : "Flash ended it immediately. ") + tierNote(out),
    });
  }

  /**
   * What happened to their tier, which is a separate question from what
   * happened in Flash. `reread_failed` means the write landed and the re-read
   * that follows it did not — saying nothing would leave an operator believing
   * the roster is current when it is a step behind.
   */
  function tierNote(out: AdminBillingSubscriptionAction): string {
    if (out.reason === "reread_failed")
      return "We couldn't re-read them from Flash afterwards, so their tier and the roster are a step behind — resync when Flash is back.";
    return out.applied
      ? "Their tier has been re-read from Flash and updated."
      : "Their tier was left as it was — the roster shows why.";
  }

  const handleCancel = (s: AdminBillingSubscription, reason: string) =>
    runAction(s.pubkey, async () => {
      cancelOutcomeToast(await apiClient.cancelAdminBillingSubscription(s.pubkey, reason));
    });

  const handleSetStatus = (s: AdminBillingSubscription, status: "paused" | "active") =>
    runAction(s.pubkey, async () => {
      const out = await apiClient.setAdminBillingSubscriptionStatus(s.pubkey, status);
      toast({
        title: status === "paused" ? "Subscription paused" : "Subscription resumed",
        description: `Flash reports them "${out.flash_status}". ${tierNote(out)}`,
      });
    });

  /**
   * Attributing can legitimately grant nothing — a blocked user, a
   * subscription that has already lapsed. That is an answer, not a failure, so
   * it is reported as one, with the server's own reason for it.
   */
  // How many stored deliveries a settlement actually closed — the server says,
  // and when it is more than one the admin should hear it (a signup started and
  // then cancelled is two deliveries; one still inside its retry budget was
  // never even listed).
  const settledNote = (n: number | undefined) =>
    typeof n === "number" && n > 1 ? ` ${n} deliveries were settled.` : "";
  const handleAttribute = (subscriptionId: string, pubkey: string) =>
    runAction(
      subscriptionId,
      async () => {
        const out = await apiClient.attributeAdminBillingUnresolved(subscriptionId, pubkey);
        toast({
          title: out.applied ? "Signup attributed" : "Attributed, but nothing was granted",
          description:
            (out.applied
              ? "It now belongs to them and the plan's tier is applied — they're in the roster above."
              : `${out.entitlement_reason ? entitlementReasonText(out.entitlement_reason) : "No tier was applied."} The signup is settled either way, so it leaves this report.`) +
            settledNote(out.events_settled),
        });
      },
      "Nothing was changed",
    );

  /** A roster row as the confirm dialog wants it: who, plus their kind-0. */
  const subjectOf = (s: AdminBillingSubscription | null): ConfirmSubject | null =>
    s ? { pubkey: s.pubkey, profile: profiles.get(s.pubkey) } : null;

  const handleDismiss = (subscriptionId: string) =>
    runAction(
      subscriptionId,
      async () => {
        const out = await apiClient.dismissAdminBillingUnresolved(subscriptionId);
        toast({
          title: "Signup dismissed",
          description:
            "Written off as nobody's — nothing was granted and this leaves the report. Flash still holds the payment; cancel or refund there if it needs it." +
            settledNote(out.events_settled),
        });
      },
      "Nothing was changed",
    );

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
  // Numbers first. Entitled = active or trial; ending = a cancellation is
  // scheduled but the paid period still runs; faults = the fault tier's counts
  // (the record tier is for knowing, not a number to worry about).
  const stats = {
    active: items.filter((x) => x.flash_status === "active" || x.flash_status === "trial").length,
    past_due: items.filter((x) => x.flash_status === "past_due").length,
    pending: items.filter((x) => x.flash_status === "pending").length,
    ending: items.filter(
      (x) => !!x.cancel_effective_date && (x.flash_status === "active" || x.flash_status === "trial"),
    ).length,
    // Fault-tier counts, minus the exhausted events that are the same signups
    // already counted above — the sections overlap on purpose; the tile mustn't.
    faults:
      Object.entries(divergence).reduce(
        (n, [kind, section]) =>
          n +
          (section && kind in DIVERGENCE_META && DIVERGENCE_META[kind as keyof typeof DIVERGENCE_META].tier === "fault"
            ? section.count
            : 0),
        0,
      ) -
      (divergence.exhausted_events?.rows ?? []).filter(
        (r) => typeof (r as { id?: unknown }).id === "number" && handlesByEventId.has((r as { id: number }).id),
      ).length,
  };
  // The deliveries the report lists for the signup being dismissed — a floor
  // for the dialog's count.
  const dismissDeliveries = dismissFor
    ? (groupSignups(divergence.unresolved_signups?.rows ?? []).find((g) => g.subscriptionId === dismissFor)?.deliveries
        .length ?? 1)
    : 1;
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
