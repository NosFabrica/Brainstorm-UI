/** Comments on a tag (NIP-22 on its address), read and written through the app's general relays. */
import { fetchEventsByFilter, publishToRelays } from "@/services/nostr";
import { relayHintFor, tagWithHint } from "@/lib/relayRouting";
import { PROFILE_RELAYS } from "@/lib/relays";
import { activeAccount, requireActiveAccount, signAs } from "@/accounts/signing";
import { tagCoordinate } from "./catalogue";
import { TAG_ELEMENT_KIND, type NostrEvent } from "./shared";

/** NIP-22 comment kind. */
const COMMENT_KIND = 1111;

/**
 * Comments do NOT live on the tag hub.
 *
 * `dcosl.brainstorm.world` rejects anything that isn't a Decentralized Lists
 * kind — publishing a 1111 there returns "blocked: not a supported
 * Decentralized Lists event kind". That's correct behaviour for a purpose-built
 * hub, and it means any comment layer on tags is inherently split across two
 * relay sets: the tag on the hub, the discussion of it on general relays.
 *
 * So comments read and write through the app's normal relays, exactly like any
 * other nostr note. Filed in KIT-FEEDBACK.md, because it constrains anyone
 * else's comment design too.
 */
export function fetchCommentEvents(filter: Record<string, unknown>): Promise<NostrEvent[]> {
  return fetchEventsByFilter(filter, PROFILE_RELAYS) as Promise<NostrEvent[]>;
}

export interface TagComment {
  id: string;
  author: string;
  content: string;
  createdAt: number;
  /** The comment's tags: its NIP-30 emoji among them. */
  tags: string[][];
}

/**
 * Comments on a TAG — "what does Bitcoin Vendor actually mean?" — not on any
 * one person carrying it.
 *
 * That distinction is the whole design (see COMMENTS-PROPOSAL.md). A thread
 * hung off a person's tagging would be unmoderated commentary about a named
 * individual on a page they don't control; a thread on the tag is a definition
 * argument, which is where the disagreement actually lives. Polarity already
 * expresses "this person doesn't belong" without prose.
 *
 * Standard NIP-22 against the tag-element's address, so any NIP-22 client
 * renders these — nothing bespoke. Read from the app's general relays, never
 * the tag hub: see `fetchCommentEvents` above for why they can't be the same.
 *
 * OFF by default (`TAG_COMMENTS_ENABLED`) — no kit document defines a comment
 * layer, so nothing extra-protocol should be live during an acceptance run.
 */
export async function fetchTagComments(authorPubkey: string, slug: string): Promise<TagComment[]> {
  const coord = tagCoordinate({ authorPubkey, slug });
  // NIP-22 puts the ROOT scope in uppercase `#A` and the immediate parent in
  // lowercase `#a`. For a top-level comment they're the same address, but
  // clients differ on which they set, so query both and dedupe.
  const [byRoot, byParent] = await Promise.all([
    fetchCommentEvents({ kinds: [COMMENT_KIND], "#A": [coord], limit: 200 }).catch(() => []),
    fetchCommentEvents({ kinds: [COMMENT_KIND], "#a": [coord], limit: 200 }).catch(() => []),
  ]);

  const byId = new Map<string, NostrEvent>();
  for (const ev of [...byRoot, ...byParent]) byId.set(ev.id, ev);

  return Array.from(byId.values())
    .filter((ev) => (ev.content ?? "").trim().length > 0)
    .map((ev) => ({
      id: ev.id,
      author: ev.pubkey,
      content: ev.content,
      createdAt: ev.created_at,
      tags: ev.tags,
    }))
    .sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Post a comment on a tag.
 *
 * This is the first user-authored free text this app publishes — everything
 * else it signs is structured (follows, reports, prefs, tag assertions). Worth
 * knowing when weighing spam and moderation questions later.
 */
export async function publishTagComment(authorPubkey: string, slug: string, content: string): Promise<void> {
  const user = activeAccount();
  if (!user?.pubkey) throw new Error("Sign in to comment.");
  const text = content.trim();
  if (!text) throw new Error("Write something first.");

  const coord = tagCoordinate({ authorPubkey, slug });
  // Where the tag's author writes — the `A`/`a` coordinate is resolvable from
  // the hint alone, without the reader guessing at a relay set.
  const hint = relayHintFor(authorPubkey);
  const unsigned = {
    kind: COMMENT_KIND,
    pubkey: user.pubkey,
    created_at: Math.floor(Date.now() / 1000),
    content: text,
    // Root scope (uppercase) and parent (lowercase) are the same event for a
    // top-level comment. `K`/`k` carry the kind being commented on, `P`/`p` its
    // author — both required by NIP-22 for clients that filter by them.
    tags: [
      tagWithHint("A", coord, hint),
      ["K", String(TAG_ELEMENT_KIND)],
      tagWithHint("P", authorPubkey, hint),
      tagWithHint("a", coord, hint),
      ["k", String(TAG_ELEMENT_KIND)],
      tagWithHint("p", authorPubkey, hint),
    ],
  };

  const signed = await signAs(requireActiveAccount(), unsigned as never);
  // The app's normal publish path — the author's outbox, the tag author's inbox
  // (they are `p`-tagged, so the comment reaches them), and our defaults. NOT
  // the tag-hub one: see fetchCommentEvents above for why.
  const result = await publishToRelays(signed);
  if (!result.success) throw new Error(result.error || "No relay accepted the comment");
}
