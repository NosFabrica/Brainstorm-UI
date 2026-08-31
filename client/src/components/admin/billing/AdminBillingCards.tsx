import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  ExternalLink,
  Loader2,
  User,
  XCircle,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  apiClient,
  type AdminBillingDivergenceSection,
  type AdminBillingSubscription,
} from "@/services/api";
import { fetchProfileMap } from "@/services/nostr";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Chip } from "@/components/ui/chip";
import type { Tone } from "@/lib/tones";
import { npubFromPubkey } from "@/lib/shareId";

const SUBS_KEY = ["/api/admin/billing/subscriptions"];
const DIVERGENCE_KEY = ["/api/admin/billing/divergence"];

/**
 * Where write actions live. The server exposes resync/block/plan-mapping
 * verbs, but v1 keeps the tab view-only — admins act in the Flash dashboard
 * (or via the server's /docs) until the team asks for buttons.
 */
const FLASH_VAULT_URL = "https://dev.vault.paywithflash.com";
const FLASH_DASHBOARD_URL = `${FLASH_VAULT_URL}/subscriptions`;

/** Deep link to one subscription's detail page in the Flash dashboard. */
function flashSubscriptionUrl(subscriptionId: string): string {
  return `${FLASH_VAULT_URL}/subscriptions/active/${subscriptionId}`;
}

/** Flash's statuses are an open set — color the ones we know, never crash on new ones. */
function statusTone(status: string): Tone {
  if (status === "active" || status === "trial") return "success";
  if (status === "pending" || status === "past_due" || status === "paused") return "warning";
  if (status === "canceled" || status === "expired") return "neutral";
  return "neutral";
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isFinite(d.getTime())
    ? d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
    : "—";
}

/** "npub1abc…wxyz" — enough to recognize, full value in the title attribute. */
function shortNpub(pubkey: string): { short: string; full: string } {
  try {
    const npub = npubFromPubkey(pubkey);
    return { short: `${npub.slice(0, 12)}…${npub.slice(-4)}`, full: npub };
  } catch {
    return { short: `${pubkey.slice(0, 8)}…`, full: pubkey };
  }
}

const th = "px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400";
const td = "px-3 py-2.5 text-sm text-slate-700 dark:text-slate-200";

type ProfileBits = { name?: string; picture?: string };

type SortKey = "subscriber" | "status" | "scheduling" | "source" | "period" | "synced";
type SortState = { key: SortKey; dir: "asc" | "desc" } | null;

/** Same affordance as the Users tab's SortHeader: label + direction chevrons. */
function BillingSortHeader({ label, sortKey, sort, onSort }: {
  label: string;
  sortKey: SortKey;
  sort: SortState;
  onSort: (key: SortKey) => void;
}) {
  const active = sort?.key === sortKey;
  return (
    <button
      type="button"
      className="flex items-center gap-1 uppercase tracking-wide font-semibold hover:text-slate-800 dark:hover:text-slate-200 transition-colors whitespace-nowrap"
      onClick={() => onSort(sortKey)}
      data-testid={`sort-billing-${sortKey}`}
    >
      {label}
      {active ? (
        sort!.dir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
      ) : (
        <ChevronsUpDown className="h-3 w-3 opacity-40" />
      )}
    </button>
  );
}

/**
 * Kind-0 enrichment for the roster, same seam the scheduling admin uses
 * (usePolicyMembers): render immediately with npubs, fill names/avatars in
 * as profiles arrive. Best-effort — a relay miss just leaves the npub.
 */
function useRosterProfiles(pubkeys: string[]): Map<string, ProfileBits> {
  const [profiles, setProfiles] = useState<Map<string, ProfileBits>>(new Map());
  const key = pubkeys.join(",");
  useEffect(() => {
    const targets = key ? key.split(",") : [];
    if (!targets.length) return;
    let cancelled = false;
    (async () => {
      try {
        const map = await fetchProfileMap(targets);
        if (cancelled) return;
        setProfiles((prev) => {
          const next = new Map(prev);
          for (const pk of targets) {
            const c = map.get(pk);
            if (c) next.set(pk, { name: c.display_name || c.name, picture: c.picture });
          }
          return next;
        });
      } catch {
        /* best-effort — npubs stay */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [key]);
  return profiles;
}

/** Search matches who they are (name/npub/pubkey) or what they're granted; filters are exact. */
function filterAndSort(
  items: AdminBillingSubscription[],
  profiles: Map<string, ProfileBits>,
  search: string,
  statusFilter: string,
  sourceFilter: string,
  sort: SortState,
): AdminBillingSubscription[] {
  const q = search.trim().toLowerCase();
  let out = items.filter((s) => {
    if (statusFilter !== "all" && s.flash_status !== statusFilter) return false;
    if (sourceFilter !== "all" && s.scheduling_source !== sourceFilter) return false;
    if (!q) return true;
    const name = profiles.get(s.pubkey)?.name?.toLowerCase() ?? "";
    const scheduling = (s.granted_scheduling_name ?? s.scheduling_name ?? "").toLowerCase();
    return (
      name.includes(q) ||
      shortNpub(s.pubkey).full.toLowerCase().includes(q) ||
      s.pubkey.toLowerCase().includes(q) ||
      scheduling.includes(q)
    );
  });
  if (sort) {
    const value = (s: AdminBillingSubscription): string => {
      switch (sort.key) {
        case "subscriber":
          return (profiles.get(s.pubkey)?.name ?? shortNpub(s.pubkey).full).toLowerCase();
        case "status":
          return s.flash_status;
        case "scheduling":
          return (s.granted_scheduling_name ?? s.scheduling_name ?? "").toLowerCase();
        case "source":
          return s.scheduling_source;
        // ISO timestamps sort correctly as strings; missing dates sink to the bottom.
        case "period":
          return s.current_period_end ?? "";
        case "synced":
          return s.last_synced_at ?? "";
      }
    };
    const dir = sort.dir === "asc" ? 1 : -1;
    out = [...out].sort((a, b) => value(a).localeCompare(value(b)) * dir);
  }
  return out;
}

function SubscriberRow({ s, profile }: { s: AdminBillingSubscription; profile?: ProfileBits }) {
  const who = shortNpub(s.pubkey);
  // What the subscription grants vs what the user is actually in — the
  // payments→scheduler connection this tab exists to make visible.
  const scheduling = s.granted_scheduling_name ?? s.scheduling_name ?? "—";
  return (
    <tr className="border-b border-brand-accent/5" data-testid={`billing-sub-${s.pubkey.slice(0, 8)}`}>
      <td className={td} title={profile?.name ? `${profile.name} — ${who.full}` : who.full}>
        <span className="flex items-center gap-2 min-w-0">
          <Avatar className="h-6 w-6 shrink-0">
            {profile?.picture ? (
              <AvatarImage src={profile.picture} alt={profile?.name || "Subscriber"} className="object-cover" />
            ) : null}
            <AvatarFallback className="bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-800 text-[10px] text-slate-400 dark:text-slate-500">
              {profile?.name?.charAt(0)?.toUpperCase() || <User className="h-3 w-3 text-slate-300 dark:text-slate-600" />}
            </AvatarFallback>
          </Avatar>
          <span className="flex flex-col min-w-0 leading-tight">
            <span className="truncate max-w-[160px] font-medium">{profile?.name || who.short}</span>
            {profile?.name && (
              <span className="font-mono text-[10px] text-slate-400 dark:text-slate-500 truncate max-w-[160px]">{who.short}</span>
            )}
          </span>
        </span>
      </td>
      <td className={td}>
        <span className="inline-flex items-center gap-1.5">
          <Chip tone={statusTone(s.flash_status)} size="sm">{s.flash_status}</Chip>
          {s.billing_blocked && (
            <Chip tone="danger" size="sm" data-testid={`billing-blocked-${s.pubkey.slice(0, 8)}`}>blocked</Chip>
          )}
        </span>
      </td>
      <td className={td}>{scheduling}</td>
      <td className={td} data-testid={`billing-source-${s.pubkey.slice(0, 8)}`}>{s.scheduling_source}</td>
      <td className={`${td} tabular-nums`}>{fmtDate(s.current_period_end)}</td>
      <td className={`${td} tabular-nums`}>
        <span className="inline-flex items-center gap-1.5">
          {fmtDate(s.last_synced_at)}
          {s.last_sync_error && (
            <span title={s.last_sync_error}>
              <AlertTriangle className="h-3.5 w-3.5 text-amber-500" aria-label="sync error" />
            </span>
          )}
        </span>
      </td>
      <td className={td}>
        {s.flash_subscription_id && (
          <a
            href={flashSubscriptionUrl(s.flash_subscription_id)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs font-medium text-brand-link hover:underline"
            title={`Open subscription ${s.flash_subscription_id} in Flash`}
            data-testid={`billing-flash-link-${s.pubkey.slice(0, 8)}`}
          >
            Flash <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </td>
    </tr>
  );
}

/**
 * The admin Billing tab: the server's subscriber roster (pubkey-keyed — every
 * row is attributed by construction), and its divergence report — "everything
 * nobody has settled": disagreements between Flash and what users actually
 * receive, including signups that couldn't be matched to an account.
 */
export function AdminBillingCards({ active }: { active: boolean }) {
  const subsQuery = useQuery({
    queryKey: SUBS_KEY,
    queryFn: () => apiClient.getAdminBillingSubscriptions(),
    enabled: active,
    staleTime: 60_000,
    retry: 1,
  });
  const divergenceQuery = useQuery({
    queryKey: DIVERGENCE_KEY,
    queryFn: () => apiClient.getAdminBillingDivergence(),
    enabled: active,
    staleTime: 60_000,
    retry: 1,
  });
  // Before the early returns — hook order must not change between renders.
  const profiles = useRosterProfiles((subsQuery.data?.items ?? []).map((s) => s.pubkey));
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [sort, setSort] = useState<SortState>(null);
  const toggleSort = (key: SortKey) =>
    setSort((prev) => (prev?.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));

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
        <div className="mt-1 text-xs text-slate-400 dark:text-slate-500">
          {(subsQuery.error as Error)?.message}
        </div>
      </div>
    );
  }

  const { items, total } = subsQuery.data;
  const divergence = divergenceQuery.data ?? {};

  const filtered = filterAndSort(items, profiles, search, statusFilter, sourceFilter, sort);
  const statuses = Array.from(new Set(items.map((s) => s.flash_status))).sort();
  const sources = Array.from(new Set(items.map((s) => s.scheduling_source))).sort();
  const filtering = search.trim() !== "" || statusFilter !== "all" || sourceFilter !== "all";
  const divergenceEntries = Object.entries(divergence).filter(([, s]) => s.count > 0);

  return (
    <div className="space-y-6">
      {/* Subscriber roster — attributed by construction (pubkey-keyed). */}
      <div>
        {items.length > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="relative w-full sm:w-56">
              <input
                type="text"
                placeholder="Search name, npub, scheduling…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full px-3 py-1.5 pr-7 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 focus:outline-none focus:ring-2 focus:ring-brand-accent/30 focus:border-brand-accent/40"
                data-testid="input-billing-search"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded-full text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  data-testid="button-billing-clear-search"
                >
                  <XCircle className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-32 h-8 text-xs rounded-xl border-slate-200 dark:border-slate-800" data-testid="select-billing-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {statuses.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={sourceFilter} onValueChange={setSourceFilter}>
              <SelectTrigger className="w-32 h-8 text-xs rounded-xl border-slate-200 dark:border-slate-800" data-testid="select-billing-source">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sources</SelectItem>
                {sources.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {filtering && (
              <span className="text-xs text-slate-400 dark:text-slate-500" data-testid="billing-filter-count">
                {filtered.length} of {items.length}
              </span>
            )}
          </div>
        )}
        {items.length === 0 ? (
          <p className="py-4 text-sm text-slate-500 dark:text-slate-400" data-testid="billing-subscribers-empty">
            No subscribers yet.
          </p>
        ) : filtered.length === 0 ? (
          <p className="py-4 text-sm text-slate-500 dark:text-slate-400" data-testid="billing-subscribers-no-match">
            No subscribers match your filters.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]" data-testid="table-billing-subscribers">
              <thead>
                <tr className="border-b border-brand-accent/10">
                  <th className={th}><BillingSortHeader label="Subscriber" sortKey="subscriber" sort={sort} onSort={toggleSort} /></th>
                  <th className={th}><BillingSortHeader label="Status" sortKey="status" sort={sort} onSort={toggleSort} /></th>
                  <th className={th}><BillingSortHeader label="Scheduling" sortKey="scheduling" sort={sort} onSort={toggleSort} /></th>
                  <th className={th}><BillingSortHeader label="Source" sortKey="source" sort={sort} onSort={toggleSort} /></th>
                  <th className={th}><BillingSortHeader label="Period ends" sortKey="period" sort={sort} onSort={toggleSort} /></th>
                  <th className={th}><BillingSortHeader label="Last synced" sortKey="synced" sort={sort} onSort={toggleSort} /></th>
                  <th className={th}></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <SubscriberRow key={s.pubkey} s={s} profile={profiles.get(s.pubkey)} />
                ))}
              </tbody>
            </table>
            {total > items.length && (
              <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
                Showing {items.length} of {total}.
              </p>
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
      <div
        className="rounded-xl border border-amber-200/60 dark:border-amber-400/20 bg-amber-50/50 dark:bg-amber-400/[0.06] px-4 py-3"
        data-testid="card-billing-divergence"
      >
        <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">Needs attention</h4>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
          Disagreements between Flash and what users receive — unmatched signups included. Resolve in
          the Flash dashboard or via the server's admin tools.
        </p>
        {divergenceQuery.isError ? (
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400" data-testid="billing-divergence-error">
            Couldn't load the divergence report.
          </p>
        ) : divergenceEntries.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400" data-testid="billing-divergence-empty">
            Nothing unsettled — Flash and the scheduler agree.
          </p>
        ) : (
          <div className="mt-2 space-y-3">
            {divergenceEntries.map(([kind, section]) => (
              <DivergenceBlock key={kind} kind={kind} section={section} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Rows are server-defined free-form objects — render the values, don't guess a schema. */
function DivergenceBlock({ kind, section }: { kind: string; section: AdminBillingDivergenceSection }) {
  return (
    <div data-testid={`billing-divergence-${kind}`}>
      <div className="flex items-center gap-2">
        <span className="text-[13px] font-semibold text-slate-900 dark:text-slate-100">
          {kind.replaceAll("_", " ")}
        </span>
        <Chip tone="warning" size="sm">{section.count}</Chip>
        {section.truncated && (
          <span className="text-[11px] text-slate-400 dark:text-slate-500">list capped — more exist</span>
        )}
      </div>
      <ul className="mt-1 space-y-1">
        {section.rows.map((row, i) => (
          <li key={i} className="font-mono text-xs text-slate-600 dark:text-slate-300 break-all">
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
          </li>
        ))}
      </ul>
    </div>
  );
}
