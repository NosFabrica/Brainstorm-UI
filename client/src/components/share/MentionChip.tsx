/**
 * A nostr: mention rendered as the person — avatar + @name → their profile.
 * Live from the store; degrades to a shortened npub while the
 * profile loads (or if it never arrives). Shared by the search result rows
 * and the app page's release notes.
 */
import { Link } from "wouter";
import { ProfileImg } from "@/components/ui/profile-img";
import { nip19 } from "nostr-tools";
import { useLiveProfiles } from "@/hooks/useLiveProfile";
import { ProfileEmojiText } from "@/components/ui/custom-emoji";

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

export function MentionChip({
  uri,
  plain = false,
}: {
  uri: string;
  /** The name alone, no link or picture — for text that is itself a link (a headline). */ plain?: boolean;
}) {
  const pubkey = mentionPubkey(uri);
  const profile = useLiveProfiles(pubkey ? [pubkey] : []).get(pubkey ?? "");

  if (!pubkey) return <span>{uri}</span>;
  const npub = nip19.npubEncode(pubkey);
  const name = profile?.display_name || profile?.name || `${npub.slice(0, 10)}…`;
  if (plain)
    return (
      <span data-testid="mention-name">
        @<ProfileEmojiText pubkey={pubkey} text={name} />
      </span>
    );
  return (
    <span onClick={(e) => e.stopPropagation()}>
      <Link
        href={`/p/${npub}`}
        className="not-prose inline-flex max-w-full items-center gap-1 rounded-md bg-brand-primary/5 px-1.5 py-0.5 align-middle text-[13px] font-medium text-brand-link no-underline transition-colors hover:bg-brand-primary/10 dark:bg-brand-primary/15 dark:hover:bg-brand-primary/25"
        data-testid="mention-chip"
      >
        {profile?.picture && (
          <ProfileImg
            src={profile.picture}
            alt=""
            loading="lazy"
            className="h-3.5 w-3.5 shrink-0 rounded-full object-cover"
          />
        )}
        <span className="truncate">
          @<ProfileEmojiText pubkey={pubkey} text={name} />
        </span>
      </Link>
    </span>
  );
}
