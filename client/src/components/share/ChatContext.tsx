/**
 * The breadcrumb above a chat message: where it was said — a NIP-28 channel,
 * a NIP-53 stream's live chat, a NIP-29 group — named and linked, the way
 * lib/chatMessage reads each spec. A message on its own ("any girl") says
 * nothing about where it was; this line does. The channel and the stream are
 * asked in the page's batch (services/refBatch), so a feed of quoted chat
 * messages asks once, not once a card.
 */
import { useMemo } from "react";
import { Link } from "wouter";
import { nip19 } from "nostr-tools";
import { Hash, MessagesSquare, Radio } from "lucide-react";
import { EmojiText } from "@/components/ui/custom-emoji";
import { useArticlesByRefs } from "@/hooks/useLinkedArticles";
import { useStoreEvents } from "@/hooks/useStoreEvents";
import { chatContextOf, type ChatPlace } from "@/lib/chatMessage";
import { liveTitleOf } from "@/lib/liveStream";
import type { MinimalEvent } from "@/lib/noteRefs";
import { neventFor } from "@/lib/shareId";
import { describeThing } from "@/lib/thing";
import { fetchRefBatched } from "@/services/refBatch";

const NO_REFS: never[] = [];

function useChannel(place: ChatPlace | null): MinimalEvent | undefined {
  const id = place?.type === "channel" ? place.id : null;
  const relay = place?.type === "channel" ? place.relay : undefined;
  const filters = useMemo(() => (id ? [{ ids: [id] }] : null), [id]);
  const found = useStoreEvents(id ? `chat-channel:${id}` : null, filters, () => fetchRefBatched({ id: id!, relay }));
  return (found.events as MinimalEvent[]).find((e) => e.kind === 40);
}

export function ChatContextLine({ event, className = "" }: { event: MinimalEvent; className?: string }) {
  const context = useMemo(() => chatContextOf(event), [event]);
  const place = context?.place ?? null;
  const channel = useChannel(place);
  const streamRefs = useMemo(() => (place?.type === "stream" ? [place.address] : NO_REFS), [place]);
  const stream = useArticlesByRefs(streamRefs, { batched: true }).articles[0];
  if (!place) return null;

  let icon = <MessagesSquare className="h-3.5 w-3.5 shrink-0" />;
  let kicker = "Group";
  let name: string | null = null;
  let href: string | null = null;
  let tags: MinimalEvent | undefined;
  if (place.type === "channel") {
    icon = <Hash className="h-3.5 w-3.5 shrink-0" />;
    kicker = "Channel";
    // A channel's name is JSON in its kind-40 content (lib/thing reads it).
    name = channel ? (describeThing(channel)?.title ?? null) : null;
    href = `/e/${neventFor(place.id, place.relay ? [place.relay] : [])}`;
    tags = channel;
  } else if (place.type === "stream") {
    icon = <Radio className="h-3.5 w-3.5 shrink-0" />;
    kicker = "Live chat";
    name = stream ? (liveTitleOf(stream) ?? null) : null;
    try {
      href = `/e/${nip19.naddrEncode(place.address)}`;
    } catch {
      href = null;
    }
    tags = stream;
  } else {
    // NIP-29: the id alone; the group's name is the hosting relay's to say.
    name = place.id.length > 24 ? `${place.id.slice(0, 22)}…` : place.id;
  }
  const label = name ?? (place.type === "channel" ? "a channel" : "a stream");
  return (
    <p
      className={`flex min-w-0 items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 ${className}`}
      data-testid="chat-context"
      data-place={place.type}
    >
      {icon}
      <span className="shrink-0 font-medium">{kicker}</span>
      <span aria-hidden="true">·</span>
      {href ? (
        <Link
          href={href}
          onClick={(e: React.MouseEvent) => e.stopPropagation()}
          className="min-w-0 truncate font-semibold text-brand-link hover:underline"
          data-testid="chat-context-link"
        >
          {tags ? <EmojiText text={label} tags={tags} /> : label}
        </Link>
      ) : (
        <span className="min-w-0 truncate font-semibold text-slate-700 dark:text-slate-200">{label}</span>
      )}
    </p>
  );
}
