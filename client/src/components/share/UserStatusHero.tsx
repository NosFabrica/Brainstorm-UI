/**
 * A NIP-38 user status (kind 30315) on its page: what someone is doing or
 * listening to, in their words (emoji and custom emoji drawn), and the one
 * thing it links — a page, a profile, a note or an addressable event, each
 * drawn the way a note draws that reference. A status past its NIP-40
 * expiration (a music status ends with the track) says it is over; an empty
 * one says it was cleared; an app's own record (JSON, an unknown type) says so.
 */
import { useMemo } from "react";
import { nip19 } from "nostr-tools";
import { ExternalLink, Music2, Sparkles } from "lucide-react";
import { Chip } from "@/components/ui/chip";
import { EmojiText } from "@/components/ui/custom-emoji";
import { NostrRef } from "@/components/share/NostrRef";
import { statusText } from "@/components/search/relayStatusCards";
import { relativeEventTime } from "@/lib/calendarEvent";
import type { MinimalEvent } from "@/lib/noteRefs";
import { readUserStatus, type UserStatusLink } from "@/lib/userStatus";

function bech32Of(link: UserStatusLink): string | null {
  try {
    if (link.type === "profile")
      return nip19.nprofileEncode({ pubkey: link.pubkey, relays: link.relay ? [link.relay] : [] });
    if (link.type === "event") return nip19.neventEncode({ id: link.id, relays: link.relay ? [link.relay] : [] });
    if (link.type === "address")
      return nip19.naddrEncode({
        kind: link.kind,
        pubkey: link.pubkey,
        identifier: link.identifier,
        relays: link.relay ? [link.relay] : [],
      });
  } catch {
    /* a link that won't encode is not drawn */
  }
  return null;
}

export function UserStatusHero({ event }: { event: MinimalEvent }) {
  const status = useMemo(() => readUserStatus(event), [event]);
  if (!status) return null;
  const nowSec = Math.floor(Date.now() / 1000);
  const expired = status.expiresAt !== undefined && status.expiresAt <= nowSec;
  const Icon = status.type === "music" ? Music2 : Sparkles;
  const link = status.link;
  const ref = link && link.type !== "url" ? bech32Of(link) : null;
  return (
    <div data-testid="status-hero">
      <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
        <Icon className="h-4 w-4 shrink-0" />
        <span className="font-medium" data-testid="status-label">
          {status.label}
        </span>
        {expired ? (
          <Chip size="sm" tone="slate" data-testid="status-expired">
            Expired
          </Chip>
        ) : status.expiresAt ? (
          <span className="text-xs" data-testid="status-expires">
            Ends {relativeEventTime(status.expiresAt).toLowerCase()}
          </span>
        ) : null}
      </div>
      <p
        className={`mt-2 break-words ${status.text ? "text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100" : "text-base italic text-slate-500 dark:text-slate-400"}`}
        style={status.text ? { fontFamily: "var(--font-display)" } : undefined}
        data-testid="status-text"
      >
        {status.text ? <EmojiText text={status.text} tags={event} /> : statusText(status)}
      </p>
      {link?.type === "url" &&
        (/^https?:\/\//i.test(link.url) ? (
          <a
            href={link.url}
            target="_blank"
            rel="noopener"
            className="mt-3 inline-flex max-w-full items-center gap-1.5 truncate text-sm font-semibold text-brand-link hover:underline"
            data-testid="status-link"
          >
            <ExternalLink className="h-4 w-4 shrink-0" />
            <span className="truncate">{link.url.replace(/^https?:\/\//i, "")}</span>
          </a>
        ) : (
          // Another scheme (NIP-38's `spotify:search:…`) is for an app on the reader's device: said, not opened.
          <p className="mt-3 truncate font-mono text-sm text-slate-600 dark:text-slate-300" data-testid="status-link">
            {link.url}
          </p>
        ))}
      {ref && (
        <div className="mt-3" data-testid="status-ref">
          <NostrRef bech32={ref} />
        </div>
      )}
    </div>
  );
}
