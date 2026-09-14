/**
 * A nostr: mention rendered as the person — avatar + @name → their profile.
 * Store-first, one relay fallback; degrades to a shortened npub while the
 * profile loads (or if it never arrives). Shared by the search result rows
 * and the app page's release notes.
 */
import { useEffect, useState } from "react";
import { Link } from "wouter";
import { nip19 } from "nostr-tools";
import { eventStore } from "@/lib/eventStore";
import { fetchProfileMap } from "@/services/nostr";

export function mentionPubkey(uri: string): string | null {
  try {
    const decoded = nip19.decode(uri.slice("nostr:".length).toLowerCase());
    if (decoded.type === "npub" && typeof decoded.data === "string") return decoded.data;
    if (decoded.type === "nprofile") return (decoded.data as { pubkey: string }).pubkey;
  } catch {
    /* not decodable — render as plain text */
  }
  return null;
}

type MentionProfile = { name?: string; display_name?: string; picture?: string };

function profileFromStore(pubkey: string): MentionProfile | null {
  const known = eventStore.getReplaceable(0, pubkey);
  if (!known) return null;
  try {
    const parsed = JSON.parse(known.content);
    return parsed && typeof parsed === "object" ? (parsed as MentionProfile) : null;
  } catch {
    return null;
  }
}

export function MentionChip({ uri, plain = false }: { uri: string; /** The name alone, no link or picture — for text that is itself a link (a headline). */ plain?: boolean }) {
  const pubkey = mentionPubkey(uri);
  const [profile, setProfile] = useState<MentionProfile | null>(() =>
    pubkey ? profileFromStore(pubkey) : null,
  );
  useEffect(() => {
    if (!pubkey || profile) return;
    let alive = true;
    void fetchProfileMap([pubkey]).then((map) => {
      if (alive && map.get(pubkey)) setProfile(map.get(pubkey) as MentionProfile);
    });
    return () => {
      alive = false;
    };
  }, [pubkey, profile]);

  if (!pubkey) return <span>{uri}</span>;
  const npub = nip19.npubEncode(pubkey);
  const name = profile?.display_name || profile?.name || `${npub.slice(0, 10)}…`;
  if (plain) return <span data-testid="mention-name">@{name}</span>;
  return (
    <span onClick={(e) => e.stopPropagation()}>
      <Link
        href={`/p/${npub}`}
        className="inline-flex max-w-full items-center gap-1 align-middle rounded-md bg-brand-primary/5 dark:bg-brand-primary/15 px-1.5 py-0.5 text-[13px] font-medium text-brand-link no-underline hover:bg-brand-primary/10 dark:hover:bg-brand-primary/25 transition-colors"
        data-testid="mention-chip"
      >
        {profile?.picture && (
          <img src={profile.picture} alt="" loading="lazy" className="h-3.5 w-3.5 shrink-0 rounded-full object-cover" />
        )}
        <span className="truncate">@{name}</span>
      </Link>
    </span>
  );
}
