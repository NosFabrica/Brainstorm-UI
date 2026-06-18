import { BadgeCheck } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { NoteContent } from "@/components/share/NoteContent";
import { npubFromPubkey } from "@/lib/shareId";
import { initialsFor } from "@/lib/profileDefaults";
import type { MinimalEvent } from "@/lib/noteRefs";

type ProfileLite = { name?: string; display_name?: string; picture?: string; nip05?: string };

function ago(ts?: number): string {
  if (!ts) return "";
  const s = Math.floor(Date.now() / 1000 - ts);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 2592000) return `${Math.floor(s / 86400)}d`;
  return `${Math.floor(s / 2592000)}mo`;
}

/**
 * Compact embedded note — the quoted or reposted note shown inside a share-page
 * note card, with its author's avatar + name (Primal-style). Links to the
 * author's share page. Truncates long content.
 */
export function EmbeddedNoteCard({
  event,
  author,
  profiles,
}: {
  event: MinimalEvent;
  author?: ProfileLite;
  profiles?: Map<string, ProfileLite>;
}) {
  const name = author?.display_name || author?.name || "Unknown";
  let npub = "";
  try { npub = npubFromPubkey(event.pubkey); } catch { /* ignore */ }

  return (
    <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50/70 p-3" data-testid="embedded-note">
      <div className="flex items-center gap-2 mb-1.5">
        <a href={npub ? `/p/${npub}` : undefined} className="flex items-center gap-2 min-w-0 hover:opacity-80">
          <Avatar className="h-6 w-6 rounded-full bg-white border border-slate-200">
            {author?.picture ? <AvatarImage src={author.picture} alt={name} className="object-cover" /> : null}
            <AvatarFallback className="rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-bold">{initialsFor(name)}</AvatarFallback>
          </Avatar>
          <span className="text-sm font-semibold text-slate-900 truncate">{name}</span>
          {author?.nip05 && <BadgeCheck className="h-3.5 w-3.5 text-sky-500 shrink-0" />}
        </a>
        <span className="text-xs text-slate-400 ml-auto shrink-0">{ago(event.created_at)}</span>
      </div>
      <div className="line-clamp-5 text-[14px]">
        <NoteContent content={event.content} compact profiles={profiles} />
      </div>
    </div>
  );
}
