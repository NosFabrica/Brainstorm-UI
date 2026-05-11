import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Copy,
  ChevronDown,
  ChevronRight,
  BadgeCheck,
  Radio,
  User as UserIcon,
  Loader2,
  Info,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import {
  checkNip85Health,
  fetchProfileEvent,
  getNip85RelayUrl,
  type Nip85HealthCheck,
  type Nip85TagCheck,
  type Nip85TagDetail,
} from "@/services/nostr";
import type { ProfileContent } from "applesauce-core/helpers/profile";
import type { NostrEvent } from "applesauce-core/helpers";

interface AdminProfileFields {
  name?: string;
  display_name?: string;
  about?: string;
  picture?: string;
  nip05?: string;
  website?: string;
}

type AdminProfile = ProfileContent & AdminProfileFields;

const STAFF_TIMEOUT_MS = 8000;

type CheckStatus = "ok" | "warn" | "error" | "neutral";

function classifyTag(tag: Nip85TagCheck, expectedRelayConfigured: boolean, hasTaPubkey: boolean) {
  const pubkeyStatus: CheckStatus = !tag.present
    ? "error"
    : !hasTaPubkey
    ? "neutral"
    : tag.pubkeyMatches
    ? "ok"
    : "error";
  const relayStatus: CheckStatus = !tag.present
    ? "error"
    : !expectedRelayConfigured
    ? "warn"
    : tag.relayMatches
    ? "ok"
    : "error";
  return { pubkeyStatus, relayStatus };
}

function hasStaleDuplicate(tags: Nip85TagDetail[] | undefined, hasTaPubkey: boolean, expectedRelayConfigured: boolean): boolean {
  if (!tags || tags.length <= 1) return false;
  return tags.some((t) => {
    if (!t.isWinner) {
      const pubkeyBad = hasTaPubkey && !t.pubkeyMatches;
      const relayBad = expectedRelayConfigured && !t.relayMatches;
      return pubkeyBad || relayBad;
    }
    return false;
  });
}

function overallStatus(health: Nip85HealthCheck | undefined, hasTaPubkey: boolean): {
  label: string;
  tone: CheckStatus;
} {
  if (!health) return { label: "Loading", tone: "neutral" };
  if (!health.eventFound) return { label: "Missing", tone: "error" };
  const checks: CheckStatus[] = [
    health.rankTag.present ? "ok" : "error",
    health.followersTag.present ? "ok" : "error",
  ];
  if (hasTaPubkey) {
    checks.push(health.rankTag.pubkeyMatches ? "ok" : "error");
    checks.push(health.followersTag.pubkeyMatches ? "ok" : "error");
  }
  if (health.expectedRelayConfigured) {
    checks.push(health.rankTag.relayMatches ? "ok" : "error");
    checks.push(health.followersTag.relayMatches ? "ok" : "error");
  } else {
    checks.push("warn");
  }
  if (
    hasStaleDuplicate(health.rankTags, hasTaPubkey, health.expectedRelayConfigured) ||
    hasStaleDuplicate(health.followersTags, hasTaPubkey, health.expectedRelayConfigured)
  ) {
    checks.push("warn");
  }
  if (checks.includes("error")) return { label: "Issues found", tone: "error" };
  if (checks.includes("warn")) return { label: "Issues found", tone: "warn" };
  return { label: "Healthy", tone: "ok" };
}

function StatusIcon({ status, className = "h-3.5 w-3.5" }: { status: CheckStatus; className?: string }) {
  if (status === "ok") return <CheckCircle2 className={`${className} text-emerald-500`} />;
  if (status === "warn") return <AlertTriangle className={`${className} text-amber-500`} />;
  if (status === "error") return <XCircle className={`${className} text-red-500`} />;
  return <Info className={`${className} text-slate-400`} />;
}

function StatusPill({ tone, label, testId }: { tone: CheckStatus; label: string; testId: string }) {
  const tones: Record<CheckStatus, string> = {
    ok: "bg-emerald-50 text-emerald-700 border-emerald-200",
    warn: "bg-amber-50 text-amber-700 border-amber-200",
    error: "bg-red-50 text-red-700 border-red-200",
    neutral: "bg-slate-100 text-slate-600 border-slate-200",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold ${tones[tone]}`}
      data-testid={testId}
    >
      <StatusIcon status={tone} className="h-3 w-3" />
      {label}
    </span>
  );
}

function MiniCopy({ text, testId }: { text: string; testId: string }) {
  const { toast } = useToast();
  if (!text) return null;
  return (
    <button
      type="button"
      className="p-0.5 rounded hover:bg-slate-100 transition-colors shrink-0"
      onClick={(e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(text);
        toast({ title: "Copied", description: text.slice(0, 24) + (text.length > 24 ? "…" : ""), duration: 1500 });
      }}
      data-testid={testId}
      aria-label="Copy to clipboard"
    >
      <Copy className="h-3 w-3 text-slate-400 hover:text-slate-600" />
    </button>
  );
}

function CheckRow({
  status,
  label,
  detail,
  testId,
  children,
}: {
  status: CheckStatus;
  label: string;
  detail?: string | null;
  testId: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      className="flex items-start gap-2 py-1.5 px-2 rounded-lg hover:bg-slate-50 transition-colors"
      data-testid={testId}
    >
      <StatusIcon status={status} className="h-3.5 w-3.5 mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium text-slate-700 leading-tight">{label}</p>
        {detail && <p className="text-[10px] text-slate-500 mt-0.5 leading-tight">{detail}</p>}
        {children}
      </div>
    </div>
  );
}

function MismatchPair({
  expected,
  actual,
  expectedLabel = "expected",
  actualLabel = "actual",
  testIdPrefix,
}: {
  expected: string | null;
  actual: string | null;
  expectedLabel?: string;
  actualLabel?: string;
  testIdPrefix: string;
}) {
  return (
    <div className="mt-1.5 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
      <div className="p-1.5 rounded-md bg-emerald-50/60 border border-emerald-100">
        <p className="text-[8px] uppercase tracking-wide text-emerald-700/70 font-bold mb-0.5">{expectedLabel}</p>
        <div className="flex items-center gap-1 min-w-0">
          <code className="font-mono text-[9px] text-emerald-800 truncate flex-1" data-testid={`${testIdPrefix}-expected`}>
            {expected || "—"}
          </code>
          {expected && <MiniCopy text={expected} testId={`button-copy-${testIdPrefix}-expected`} />}
        </div>
      </div>
      <div className="p-1.5 rounded-md bg-red-50/60 border border-red-100">
        <p className="text-[8px] uppercase tracking-wide text-red-700/70 font-bold mb-0.5">{actualLabel}</p>
        <div className="flex items-center gap-1 min-w-0">
          <code className="font-mono text-[9px] text-red-800 truncate flex-1" data-testid={`${testIdPrefix}-actual`}>
            {actual || "—"}
          </code>
          {actual && <MiniCopy text={actual} testId={`button-copy-${testIdPrefix}-actual`} />}
        </div>
      </div>
    </div>
  );
}

function RawJsonBlock({ value, testIdPrefix }: { value: unknown; testIdPrefix: string }) {
  const [open, setOpen] = useState(false);
  const json = useMemo(() => {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return "";
    }
  }, [value]);
  if (!json) return null;
  return (
    <div className="mt-2 border border-slate-200 rounded-lg overflow-hidden bg-slate-50">
      <div className="flex items-center justify-between px-2 py-1.5 bg-slate-100/70 border-b border-slate-200">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-1 text-[10px] font-semibold text-slate-600 hover:text-slate-900 transition-colors"
          data-testid={`button-toggle-${testIdPrefix}`}
        >
          {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          Raw JSON
        </button>
        <MiniCopy text={json} testId={`button-copy-${testIdPrefix}`} />
      </div>
      {open && (
        <pre
          className="p-2 text-[10px] font-mono text-slate-700 overflow-x-auto max-h-60 leading-relaxed"
          data-testid={`text-${testIdPrefix}`}
        >
          {json}
        </pre>
      )}
    </div>
  );
}

function formatTimestamp(unix: number | null): string {
  if (!unix) return "—";
  try {
    return new Date(unix * 1000).toLocaleString();
  } catch {
    return "—";
  }
}

function truncateMid(s: string | null, head = 10, tail = 6): string {
  if (!s) return "—";
  if (s.length <= head + tail + 1) return s;
  return `${s.slice(0, head)}…${s.slice(-tail)}`;
}

function isLikelyBrainstormWebsite(website: string | undefined): boolean {
  if (!website || typeof website !== "string") return false;
  let host: string | null = null;
  try {
    host = new URL(website).host.toLowerCase();
  } catch {
    return false;
  }
  if (!host) return false;
  if (typeof window !== "undefined" && window.location?.host && host === window.location.host.toLowerCase()) {
    return true;
  }
  if (host === "brainstorm.world" || host.endsWith(".brainstorm.world")) return true;
  if (host === "nosfabrica.com" || host.endsWith(".nosfabrica.com")) return true;
  return false;
}

function TagDetailCard({
  detail,
  slotLabel,
  hasTaPubkey,
  expectedRelayConfigured,
  testIdPrefix,
}: {
  detail: Nip85TagDetail;
  slotLabel: string;
  hasTaPubkey: boolean;
  expectedRelayConfigured: boolean;
  testIdPrefix: string;
}) {
  const pubkeyTone: CheckStatus = !hasTaPubkey
    ? "neutral"
    : detail.pubkeyMatches
    ? "ok"
    : "error";
  const relayTone: CheckStatus = !expectedRelayConfigured
    ? "warn"
    : detail.relayMatches
    ? "ok"
    : "error";
  // Only treat as fully "Active" when this tag is the winner AND both checks
  // pass on this same tag — matches isUsingBrainstorm conjunction semantics.
  // A winner picked as a partial-match fallback is shown as "Best match" amber
  // so admins don't get a misleading green status.
  const isFullyActive =
    detail.isWinner &&
    (!hasTaPubkey || detail.pubkeyMatches) &&
    (!expectedRelayConfigured || detail.relayMatches);
  const cardTone: CheckStatus = isFullyActive
    ? "ok"
    : detail.isWinner
    ? "warn"
    : pubkeyTone === "error" || relayTone === "error"
    ? "warn"
    : "neutral";
  const cardClasses: Record<CheckStatus, string> = {
    ok: "border-emerald-200 bg-emerald-50/40",
    warn: "border-amber-200 bg-amber-50/40",
    error: "border-red-200 bg-red-50/40",
    neutral: "border-slate-200 bg-slate-50/60",
  };
  return (
    <div
      className={`rounded-lg border ${cardClasses[cardTone]} p-2 space-y-1.5`}
      data-testid={`${testIdPrefix}-card`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">
            {slotLabel} #{detail.index + 1}
          </span>
          {isFullyActive ? (
            <span
              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[8px] font-bold uppercase tracking-wider"
              data-testid={`${testIdPrefix}-winner`}
            >
              <CheckCircle2 className="h-2.5 w-2.5" />
              Active
            </span>
          ) : detail.isWinner ? (
            <span
              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[8px] font-bold uppercase tracking-wider"
              data-testid={`${testIdPrefix}-best-match`}
            >
              <AlertTriangle className="h-2.5 w-2.5" />
              Best match
            </span>
          ) : cardTone === "warn" ? (
            <span
              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[8px] font-bold uppercase tracking-wider"
              data-testid={`${testIdPrefix}-stale`}
            >
              <AlertTriangle className="h-2.5 w-2.5" />
              Stale
            </span>
          ) : (
            <span
              className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[8px] font-bold uppercase tracking-wider"
              data-testid={`${testIdPrefix}-duplicate`}
            >
              Duplicate
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span
            className={`inline-flex items-center gap-0.5 text-[9px] font-semibold ${
              pubkeyTone === "ok"
                ? "text-emerald-600"
                : pubkeyTone === "error"
                ? "text-red-600"
                : "text-slate-400"
            }`}
            data-testid={`${testIdPrefix}-pubkey-status`}
          >
            <StatusIcon status={pubkeyTone} className="h-3 w-3" />
            Pubkey
          </span>
          <span
            className={`inline-flex items-center gap-0.5 text-[9px] font-semibold ${
              relayTone === "ok"
                ? "text-emerald-600"
                : relayTone === "error"
                ? "text-red-600"
                : "text-amber-600"
            }`}
            data-testid={`${testIdPrefix}-relay-status`}
          >
            <StatusIcon status={relayTone} className="h-3 w-3" />
            Relay
          </span>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-1">
        <div className="flex items-center gap-1 min-w-0">
          <span className="text-[8px] uppercase tracking-wider text-slate-400 font-bold w-12 shrink-0">
            Pubkey
          </span>
          <code
            className="font-mono text-[9px] text-slate-700 truncate flex-1"
            data-testid={`${testIdPrefix}-pubkey-value`}
          >
            {detail.innerPubkey || "—"}
          </code>
          {detail.innerPubkey && (
            <MiniCopy text={detail.innerPubkey} testId={`button-copy-${testIdPrefix}-pubkey`} />
          )}
        </div>
        <div className="flex items-center gap-1 min-w-0">
          <span className="text-[8px] uppercase tracking-wider text-slate-400 font-bold w-12 shrink-0">
            Relay
          </span>
          <code
            className="font-mono text-[9px] text-slate-700 truncate flex-1"
            data-testid={`${testIdPrefix}-relay-value`}
          >
            {detail.relayHint || "—"}
          </code>
          {detail.relayHint && (
            <MiniCopy text={detail.relayHint} testId={`button-copy-${testIdPrefix}-relay`} />
          )}
        </div>
      </div>
    </div>
  );
}

function AllTagsDisclosure({
  tags,
  slotLabel,
  hasTaPubkey,
  expectedRelayConfigured,
  testIdPrefix,
}: {
  tags: Nip85TagDetail[] | undefined;
  slotLabel: string;
  hasTaPubkey: boolean;
  expectedRelayConfigured: boolean;
  testIdPrefix: string;
}) {
  const safeTags = tags ?? [];
  const hasIssues = safeTags.some(
    (t) =>
      !t.isWinner &&
      ((hasTaPubkey && !t.pubkeyMatches) || (expectedRelayConfigured && !t.relayMatches)),
  );
  const [open, setOpen] = useState(hasIssues);
  if (safeTags.length <= 1) return null;
  const listId = `${testIdPrefix}-list`;
  return (
    <div className="mt-1 mb-1.5" data-testid={`${testIdPrefix}-disclosure`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={listId}
        className={`w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg border transition-colors ${
          hasIssues
            ? "border-amber-200 bg-amber-50/50 hover:bg-amber-50"
            : "border-slate-200 bg-slate-50/60 hover:bg-slate-100"
        }`}
        data-testid={`${testIdPrefix}-toggle`}
      >
        <div className="flex items-center gap-1.5">
          {open ? (
            <ChevronDown className="h-3 w-3 text-slate-500" />
          ) : (
            <ChevronRight className="h-3 w-3 text-slate-500" />
          )}
          <span className="text-[10px] font-semibold text-slate-700">
            {safeTags.length} {slotLabel} tags published
          </span>
          {hasIssues && (
            <span
              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[8px] font-bold uppercase tracking-wider"
              data-testid={`${testIdPrefix}-issues-badge`}
            >
              <AlertTriangle className="h-2.5 w-2.5" />
              Stale tags
            </span>
          )}
        </div>
        <span className="text-[9px] text-slate-500">
          {open ? "Hide details" : "Show all"}
        </span>
      </button>
      {open && (
        <div id={listId} className="mt-1.5 space-y-1.5" data-testid={`${testIdPrefix}-list`}>
          {safeTags.map((detail) => (
            <TagDetailCard
              key={`${slotLabel}-${detail.index}`}
              detail={detail}
              slotLabel={slotLabel}
              hasTaPubkey={hasTaPubkey}
              expectedRelayConfigured={expectedRelayConfigured}
              testIdPrefix={`${testIdPrefix}-tag-${detail.index}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PanelShell({
  title,
  icon,
  pill,
  children,
  testId,
}: {
  title: string;
  icon: React.ReactNode;
  pill?: React.ReactNode;
  children: React.ReactNode;
  testId: string;
}) {
  return (
    <div
      className="p-3 rounded-xl bg-white border border-indigo-100 shadow-sm flex flex-col min-h-[180px]"
      data-testid={testId}
    >
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-1.5">
          {icon}
          <p className="font-bold text-[11px] text-slate-800" style={{ fontFamily: "var(--font-display)" }}>
            {title}
          </p>
        </div>
        {pill}
      </div>
      <div className="flex-1">{children}</div>
    </div>
  );
}

function SkeletonChecklist() {
  return (
    <div className="space-y-1.5" data-testid="status-nip85-loading">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex items-center gap-2 px-2 py-1.5">
          <div className="h-3.5 w-3.5 rounded-full bg-slate-100 animate-pulse" />
          <div className="h-3 flex-1 bg-slate-100 rounded animate-pulse" />
        </div>
      ))}
    </div>
  );
}

type Nip85QueryResult = ReturnType<typeof useQuery<Nip85HealthCheck>>;

function Nip85Panel({
  taPubkey,
  query,
}: {
  taPubkey: string | null;
  query: Nip85QueryResult;
}) {
  const data = query.data;
  const hasTaPubkey = !!taPubkey;
  const overall = overallStatus(query.isLoading ? undefined : data, hasTaPubkey);
  const pillTone: CheckStatus = query.isLoading
    ? "neutral"
    : query.isError
    ? "error"
    : overall.tone;
  const pillLabel = query.isLoading
    ? "Loading"
    : query.isError
    ? "Fetch failed"
    : overall.label;

  return (
    <PanelShell
      title="Trust Provider List (kind 10040)"
      icon={<Radio className="h-3.5 w-3.5 text-[#333286]" />}
      pill={<StatusPill tone={pillTone} label={pillLabel} testId="status-nip85-overall" />}
      testId="card-nip85-health"
    >
      {!hasTaPubkey && (
        <div
          className="flex items-start gap-2 p-2 rounded-lg bg-slate-50 border border-slate-200 mb-2"
          data-testid="status-nip85-no-ta"
        >
          <Info className="h-3.5 w-3.5 text-slate-500 mt-0.5 shrink-0" />
          <p className="text-[10px] text-slate-600 leading-tight">
            TA pubkey not yet assigned for this user. Inner-pubkey checks are unavailable until the backend assigns one.
          </p>
        </div>
      )}

      {query.isLoading ? (
        <SkeletonChecklist />
      ) : query.isError ? (
        <div
          className="flex items-center gap-2 p-2.5 rounded-lg bg-red-50 border border-red-200"
          data-testid="status-nip85-error"
        >
          <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />
          <p className="text-[10px] text-red-700">Failed to fetch kind 10040 from relays.</p>
        </div>
      ) : data ? (
        <div className="space-y-0.5">
          <CheckRow
            status={data.eventFound ? "ok" : "error"}
            label="Event found on relays"
            detail={
              data.eventFound
                ? `Published ${formatTimestamp(data.createdAt)}`
                : "No kind 10040 event returned from outbox relays."
            }
            testId="check-nip85-event-found"
          />

          {data.eventFound && (
            <>
              <CheckRow
                status={data.rankTag.present ? "ok" : "error"}
                label="Has 30382:rank tag"
                testId="check-nip85-rank-present"
              />
              <CheckRow
                status={data.followersTag.present ? "ok" : "error"}
                label="Has 30382:followers tag"
                testId="check-nip85-followers-present"
              />

              {(["rankTag", "followersTag"] as const).map((slot) => {
                const tag = data[slot];
                const slotLabel = slot === "rankTag" ? "rank" : "followers";
                const allTags = slot === "rankTag" ? data.rankTags : data.followersTags;
                if (!tag.present) return null;
                const { pubkeyStatus, relayStatus } = classifyTag(
                  tag,
                  data.expectedRelayConfigured,
                  hasTaPubkey,
                );
                return (
                  <div key={slot} className="space-y-0.5">
                    <CheckRow
                      status={pubkeyStatus}
                      label={`${slotLabel} inner pubkey matches assigned TA`}
                      detail={
                        !hasTaPubkey
                          ? `Found: ${truncateMid(tag.innerPubkey)} (no TA to compare)`
                          : tag.pubkeyMatches
                          ? `Matches: ${truncateMid(tag.innerPubkey)}`
                          : "Mismatch — see below"
                      }
                      testId={`check-nip85-${slotLabel}-pubkey`}
                    >
                      {hasTaPubkey && !tag.pubkeyMatches && (
                        <MismatchPair
                          expected={data.expectedTaPubkey}
                          actual={tag.innerPubkey}
                          testIdPrefix={`mismatch-${slotLabel}-pubkey`}
                        />
                      )}
                    </CheckRow>
                    <CheckRow
                      status={relayStatus}
                      label={`${slotLabel} relay hint matches NIP-85 relay`}
                      detail={
                        !data.expectedRelayConfigured
                          ? "Expected relay not configured (VITE_NIP85_RELAY_URL is empty)."
                          : tag.relayMatches
                          ? `Matches: ${tag.relayHint}`
                          : "Mismatch — see below"
                      }
                      testId={`check-nip85-${slotLabel}-relay`}
                    >
                      {data.expectedRelayConfigured && !tag.relayMatches && (
                        <MismatchPair
                          expected={data.expectedRelay}
                          actual={tag.relayHint}
                          testIdPrefix={`mismatch-${slotLabel}-relay`}
                        />
                      )}
                    </CheckRow>
                    <AllTagsDisclosure
                      tags={allTags}
                      slotLabel={slotLabel}
                      hasTaPubkey={hasTaPubkey}
                      expectedRelayConfigured={data.expectedRelayConfigured}
                      testIdPrefix={`all-${slotLabel}-tags`}
                    />
                  </div>
                );
              })}
            </>
          )}

          {data.rawEvent && <RawJsonBlock value={data.rawEvent} testIdPrefix="raw-10040" />}
        </div>
      ) : null}
    </PanelShell>
  );
}

interface Kind0QueryResult {
  event: NostrEvent | null;
  profile: AdminProfile | null;
}

function AssistantIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 25 24"
      fill="none"
      stroke="currentColor"
      className={className}
      aria-hidden="true"
    >
      <g clipPath="url(#bs-assistant-icon-clip)">
        <path d="M10.672 8.76001V13.12" strokeWidth="1.5" strokeLinecap="square" strokeLinejoin="round" />
        <path d="M7.92201 13.12L5.79201 8.76001L3.66201 13.12" strokeWidth="1.5" strokeLinecap="square" />
        <path d="M4.20201 12.1201H7.40201" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M7.03201 18.16V21.6901H13.862V18.5301H18.082V15.1H20.452L18.532 10.83C18.602 10.44 19.022 7.68005 17.422 5.50005C16.042 3.63005 13.922 2.30005 11.422 2.30005H11.272C9.76201 2.30005 8.34201 2.73005 7.15201 3.48005" strokeWidth="1.5" strokeMiterlimit="10" />
      </g>
      <defs>
        <clipPath id="bs-assistant-icon-clip">
          <rect width="24" height="24" fill="white" transform="translate(0.0620117)" />
        </clipPath>
      </defs>
    </svg>
  );
}

function parseProfileFromEvent(event: NostrEvent | null): AdminProfile | null {
  if (!event || typeof event.content !== "string") return null;
  try {
    return JSON.parse(event.content) as AdminProfile;
  } catch {
    return null;
  }
}

function useKind0Query(pubkey: string | null, extraRelays: string[] = []) {
  const extrasKey = extraRelays.filter((r) => r.length > 0).sort().join(",");
  return useQuery<Kind0QueryResult>({
    queryKey: ["admin/kind0-profile", pubkey ?? "", extrasKey],
    queryFn: async () => {
      if (!pubkey) return { event: null, profile: null };
      const event =
        (await fetchProfileEvent(pubkey, STAFF_TIMEOUT_MS, extraRelays)) ?? null;
      return { event, profile: parseProfileFromEvent(event) };
    },
    enabled: !!pubkey,
    staleTime: 60_000,
    retry: 0,
  });
}

function AssignedAssistantSection({
  assistantPubkey,
  selfAssigned,
}: {
  assistantPubkey: string;
  selfAssigned: boolean;
}) {
  const assistantExtraRelays = useMemo(() => {
    const url = getNip85RelayUrl();
    return url ? [url] : [];
  }, []);
  const query = useKind0Query(assistantPubkey, assistantExtraRelays);
  const event = query.data?.event ?? null;
  const profile = query.data?.profile ?? null;
  const isAssistant = isLikelyBrainstormWebsite(profile?.website);
  const displayName = profile?.display_name || profile?.name || "(no name)";
  const initials = (profile?.display_name || profile?.name || "?").slice(0, 2).toUpperCase();

  return (
    <div
      className="mt-3 pt-3 border-t border-slate-200"
      data-testid="section-assigned-assistant"
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <AssistantIcon className="h-4 w-4 text-emerald-500 shrink-0" />
          <p
            className="font-bold text-[11px] text-slate-800"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Assigned Brainstorm Assistant
          </p>
          {selfAssigned && (
            <span
              className="inline-flex items-center px-1.5 py-0.5 rounded-full border border-slate-200 bg-slate-100 text-slate-600 text-[9px] font-semibold"
              data-testid="badge-assistant-self-assigned"
            >
              Self-assigned
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 min-w-0">
          <code
            className="font-mono text-[9px] text-slate-500 truncate"
            data-testid="text-assistant-pubkey"
          >
            {truncateMid(assistantPubkey)}
          </code>
          <MiniCopy text={assistantPubkey} testId="button-copy-assistant-pubkey" />
        </div>
      </div>

      {query.isLoading ? (
        <div className="space-y-2" data-testid="status-assistant-kind0-loading">
          <div className="flex items-center gap-2">
            <div className="h-10 w-10 rounded-full bg-slate-100 animate-pulse" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 w-32 bg-slate-100 rounded animate-pulse" />
              <div className="h-2.5 w-24 bg-slate-100 rounded animate-pulse" />
            </div>
          </div>
        </div>
      ) : query.isError ? (
        <div
          className="flex items-center gap-2 p-2.5 rounded-lg bg-red-50 border border-red-200"
          data-testid="status-assistant-kind0-error"
        >
          <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />
          <p className="text-[10px] text-red-700">
            Failed to fetch assistant kind 0 from relays.
          </p>
        </div>
      ) : !event || !profile ? (
        <div
          className="flex items-center gap-2 p-2.5 rounded-lg bg-slate-50 border border-slate-200"
          data-testid="status-assistant-kind0-empty"
        >
          <Info className="h-3.5 w-3.5 text-slate-500 shrink-0" />
          <p className="text-[10px] text-slate-600">
            {event
              ? "Assistant kind 0 found but content could not be parsed."
              : "No kind 0 metadata found on relays for assigned assistant."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-start gap-2">
            <Avatar className="h-10 w-10 border border-slate-200">
              <AvatarImage src={profile.picture} alt={displayName} />
              <AvatarFallback className="text-[10px] bg-slate-100 text-slate-500">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p
                className="text-[12px] font-semibold text-slate-800 truncate"
                data-testid="text-assistant-display-name"
              >
                {displayName}
              </p>
              {profile.nip05 && (
                <p
                  className="text-[10px] text-slate-500 truncate"
                  data-testid="text-assistant-nip05"
                >
                  {profile.nip05}
                </p>
              )}
              {profile.website && (
                <div className="flex items-center gap-1 mt-0.5">
                  {isAssistant && <BadgeCheck className="h-3 w-3 text-emerald-500 shrink-0" />}
                  <a
                    href={profile.website}
                    target="_blank"
                    rel="noreferrer"
                    className={`text-[10px] hover:underline truncate ${
                      isAssistant ? "text-emerald-700" : "text-slate-600"
                    }`}
                    data-testid="link-assistant-website"
                  >
                    {profile.website}
                  </a>
                </div>
              )}
            </div>
          </div>

          {profile.about && (
            <p
              className="text-[10px] text-slate-600 leading-snug line-clamp-2"
              data-testid="text-assistant-about"
            >
              {profile.about}
            </p>
          )}

          <div
            className="flex items-center gap-1.5 text-[10px] text-slate-500"
            data-testid="text-assistant-created-at"
          >
            <Info className="h-3 w-3 text-slate-400" />
            <span>Published {formatTimestamp(event.created_at)}</span>
          </div>

          <RawJsonBlock value={event} testIdPrefix="raw-assistant-kind0" />
        </div>
      )}
    </div>
  );
}

function Kind0Panel({
  pubkey,
  assistantPubkey,
  selfAssigned,
}: {
  pubkey: string;
  assistantPubkey: string | null;
  selfAssigned: boolean;
}) {
  const query = useKind0Query(pubkey);

  const event = query.data?.event ?? null;
  const profile = query.data?.profile ?? null;
  const isAssistant = isLikelyBrainstormWebsite(profile?.website);
  const displayName = profile?.display_name || profile?.name || "(no name)";
  const initials = (profile?.display_name || profile?.name || "?").slice(0, 2).toUpperCase();

  const pill = query.isLoading ? (
    <StatusPill tone="neutral" label="Loading" testId="status-kind0-overall" />
  ) : query.isError ? (
    <StatusPill tone="error" label="Fetch failed" testId="status-kind0-overall" />
  ) : !profile ? (
    <StatusPill tone="error" label="Missing" testId="status-kind0-overall" />
  ) : isAssistant ? (
    <StatusPill tone="ok" label="Brainstorm Assistant" testId="status-kind0-overall" />
  ) : (
    <StatusPill tone="neutral" label="Standard profile" testId="status-kind0-overall" />
  );

  return (
    <PanelShell
      title="Profile Metadata (kind 0)"
      icon={<UserIcon className="h-3.5 w-3.5 text-[#333286]" />}
      pill={pill}
      testId="card-kind0-health"
    >
      {query.isLoading ? (
        <div className="space-y-2" data-testid="status-kind0-loading">
          <div className="flex items-center gap-2">
            <div className="h-10 w-10 rounded-full bg-slate-100 animate-pulse" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 w-32 bg-slate-100 rounded animate-pulse" />
              <div className="h-2.5 w-24 bg-slate-100 rounded animate-pulse" />
            </div>
          </div>
          <div className="h-2.5 w-full bg-slate-100 rounded animate-pulse" />
          <div className="h-2.5 w-3/4 bg-slate-100 rounded animate-pulse" />
        </div>
      ) : query.isError ? (
        <div
          className="flex items-center gap-2 p-2.5 rounded-lg bg-red-50 border border-red-200"
          data-testid="status-kind0-error"
        >
          <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />
          <p className="text-[10px] text-red-700">Failed to fetch kind 0 from relays.</p>
        </div>
      ) : !event || !profile ? (
        <div
          className="flex items-center gap-2 p-2.5 rounded-lg bg-slate-50 border border-slate-200"
          data-testid="status-kind0-empty"
        >
          <Info className="h-3.5 w-3.5 text-slate-500 shrink-0" />
          <p className="text-[10px] text-slate-600">
            {event ? "Kind 0 event found but content could not be parsed." : "No kind 0 metadata found on relays."}
          </p>
        </div>
      ) : (
        <div className="space-y-2" data-testid="status-kind0-success">
          <div className="flex items-start gap-2">
            <Avatar className="h-10 w-10 border border-slate-200">
              <AvatarImage src={profile.picture} alt={displayName} />
              <AvatarFallback className="text-[10px] bg-slate-100 text-slate-500">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-semibold text-slate-800 truncate" data-testid="text-kind0-display-name">
                {displayName}
              </p>
              {profile.nip05 && (
                <p className="text-[10px] text-slate-500 truncate" data-testid="text-kind0-nip05">
                  {profile.nip05}
                </p>
              )}
              {profile.website && (
                <div className="flex items-center gap-1 mt-0.5">
                  {isAssistant && <BadgeCheck className="h-3 w-3 text-emerald-500 shrink-0" />}
                  <a
                    href={profile.website}
                    target="_blank"
                    rel="noreferrer"
                    className={`text-[10px] hover:underline truncate ${
                      isAssistant ? "text-emerald-700" : "text-slate-600"
                    }`}
                    data-testid="link-kind0-website"
                  >
                    {profile.website}
                  </a>
                </div>
              )}
            </div>
          </div>

          {profile.about && (
            <p className="text-[10px] text-slate-600 leading-snug line-clamp-2" data-testid="text-kind0-about">
              {profile.about}
            </p>
          )}

          <div
            className="flex items-center gap-1.5 text-[10px] text-slate-500"
            data-testid="text-kind0-created-at"
          >
            <Info className="h-3 w-3 text-slate-400" />
            <span>Published {formatTimestamp(event.created_at)}</span>
          </div>

          <RawJsonBlock value={event} testIdPrefix="raw-kind0" />
        </div>
      )}

      {assistantPubkey && (
        <AssignedAssistantSection
          assistantPubkey={assistantPubkey}
          selfAssigned={selfAssigned}
        />
      )}
    </PanelShell>
  );
}

export function NostrHealthCard({ pubkey, taPubkey }: { pubkey: string; taPubkey: string | null }) {
  const nip85Query = useQuery<Nip85HealthCheck>({
    queryKey: ["admin/nip85-health", pubkey, taPubkey ?? ""],
    queryFn: () => checkNip85Health(pubkey, taPubkey, STAFF_TIMEOUT_MS),
    staleTime: 60_000,
    retry: 0,
  });

  const assistantPubkey =
    taPubkey ??
    nip85Query.data?.rankTag.innerPubkey ??
    nip85Query.data?.followersTag.innerPubkey ??
    null;
  const selfAssigned = !!assistantPubkey && assistantPubkey === pubkey;

  return (
    <div
      className="mt-2 p-4 rounded-xl bg-white border border-indigo-100 shadow-sm"
      data-testid={`card-nostr-health-${pubkey.slice(0, 8)}`}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 text-[#333286] hidden" />
          <Radio className="h-4 w-4 text-[#333286]" />
          <p className="font-bold text-xs text-slate-800" style={{ fontFamily: "var(--font-display)" }}>
            Nostr Health
          </p>
        </div>
        <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
          Live from relays
        </span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Nip85Panel taPubkey={taPubkey} query={nip85Query} />
        <Kind0Panel pubkey={pubkey} assistantPubkey={assistantPubkey} selfAssigned={selfAssigned} />
      </div>
    </div>
  );
}

export default NostrHealthCard;
