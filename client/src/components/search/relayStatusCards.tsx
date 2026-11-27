/**
 * Cards for two kinds that say who someone is rather than what they posted,
 * drawn wherever an event card goes (a quote, a result row):
 *
 * - **RelayListCard**, a NIP-65 relay list (kind 10002): the relays, each
 *   with whether the person reads there, writes there, or both
 *   (lib/relayList `relayListEntries`).
 * - **UserStatusCard**, a NIP-38 user status (kind 30315): what they are up
 *   to or listening to, and what it links (lib/userStatus).
 *
 * Their pages (components/share/RelayListHero, UserStatusHero) read the same.
 */
import { memo, useMemo } from "react";
import type { NostrEvent } from "nostr-tools";
import { Music2, RadioTower, Sparkles } from "lucide-react";
import { AuthorRow, CardShell } from "@/components/search/cards";
import { Chip } from "@/components/ui/chip";
import { EmojiText } from "@/components/ui/custom-emoji";
import { KindPill } from "@/components/ui/kind-pill";
import type { SearchResult } from "@/lib/profileSearch";
import { relayListEntries, type RelayListEntry } from "@/lib/relayList";
import { readUserStatus, type UserStatus } from "@/lib/userStatus";

const PREVIEW_RELAYS = 4;

/** "wss://relay.damus.io" → "relay.damus.io". */
export const relayHost = (url: string) => url.replace(/^wss?:\/\//i, "");

/** What a relay is to its lister, in words: NIP-65's two markers, or both. */
export function relayUseLabel(entry: RelayListEntry): string {
  return entry.read && entry.write ? "Read · write" : entry.read ? "Read" : "Write";
}

/** "3 relays · 2 read, 3 write". */
export function relayListSummary(entries: RelayListEntry[]): string {
  const reads = entries.filter((e) => e.read).length;
  const writes = entries.filter((e) => e.write).length;
  return `${entries.length} ${entries.length === 1 ? "relay" : "relays"} · ${reads} read, ${writes} write`;
}

export const RelayListCard = memo(function RelayListCard({
  event,
  author,
  score,
}: {
  event: NostrEvent;
  author: SearchResult | null;
  score?: number | null;
}) {
  const entries = useMemo(() => relayListEntries(event), [event]);
  return (
    <CardShell event={event} testId={`relay-list-card-${event.id}`}>
      <div className="flex min-w-0 items-center gap-2">
        <RadioTower className="h-4 w-4 shrink-0 text-slate-500 dark:text-slate-400" />
        <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">Relays</p>
        <KindPill event={event} mixed={false} />
        <Chip size="sm" tone="slate" data-testid={`relay-list-count-${event.id}`}>
          {entries.length ? relayListSummary(entries) : "No relays"}
        </Chip>
      </div>
      {entries.length > 0 && (
        <ul className="mt-2 space-y-0.5" data-testid={`relay-list-preview-${event.id}`}>
          {entries.slice(0, PREVIEW_RELAYS).map((e) => (
            <li key={e.url} className="flex min-w-0 items-center justify-between gap-3 text-xs">
              <span className="min-w-0 truncate font-mono text-slate-700 dark:text-slate-200">{relayHost(e.url)}</span>
              <span className="shrink-0 text-slate-500 dark:text-slate-400" data-testid="relay-list-use">
                {relayUseLabel(e)}
              </span>
            </li>
          ))}
          {entries.length > PREVIEW_RELAYS && (
            <li className="text-xs text-slate-400 dark:text-slate-500">+{entries.length - PREVIEW_RELAYS} more</li>
          )}
        </ul>
      )}
      <div className="mt-2">
        <AuthorRow author={author} score={score} created_at={event.created_at} />
      </div>
    </CardShell>
  );
});

/** What a status links, as words a card can say: a site's host, "a profile", "a note". */
export function statusLinkLabel(status: UserStatus): string | null {
  const link = status.link;
  if (!link) return null;
  if (link.type === "url") {
    try {
      const u = new URL(link.url);
      return /^https?:$/.test(u.protocol) ? u.hostname.replace(/^www\./, "") : link.url;
    } catch {
      return link.url;
    }
  }
  return link.type === "profile" ? "a profile" : link.type === "event" ? "a note" : "an event";
}

/** What a status says when it says nothing: cleared, or an app's own record. */
export function statusText(status: UserStatus): string {
  return status.text ?? (status.cleared ? "Cleared their status" : `An app's ${status.type || "status"} record`);
}

export const UserStatusCard = memo(function UserStatusCard({
  event,
  author,
  score,
  nowSec = Math.floor(Date.now() / 1000),
}: {
  event: NostrEvent;
  author: SearchResult | null;
  score?: number | null;
  nowSec?: number;
}) {
  const status = useMemo(() => readUserStatus(event), [event]);
  if (!status) return null;
  const expired = status.expiresAt !== undefined && status.expiresAt <= nowSec;
  const Icon = status.type === "music" ? Music2 : Sparkles;
  const link = statusLinkLabel(status);
  return (
    <CardShell event={event} testId={`status-card-${event.id}`}>
      <div className="flex min-w-0 items-center gap-2">
        <Icon className="h-4 w-4 shrink-0 text-slate-500 dark:text-slate-400" />
        <p className="shrink-0 text-xs font-medium text-slate-500 dark:text-slate-400" data-testid="status-label">
          {status.label}
        </p>
        <KindPill event={event} mixed={false} />
        {expired && (
          <Chip size="sm" tone="slate" data-testid="status-expired">
            Expired
          </Chip>
        )}
      </div>
      <p
        className={`mt-1 line-clamp-2 break-words text-sm ${status.text ? "font-semibold text-slate-900 dark:text-slate-100" : "italic text-slate-500 dark:text-slate-400"}`}
        data-testid="status-text"
      >
        {status.text ? <EmojiText text={status.text} tags={event} /> : statusText(status)}
      </p>
      {link && (
        <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400" data-testid="status-link">
          {link}
        </p>
      )}
      <div className="mt-2">
        <AuthorRow author={author} score={score} created_at={event.created_at} />
      </div>
    </CardShell>
  );
});
