import type { ProfileContent } from "applesauce-core/helpers/profile";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DefaultAvatarImg } from "@/components/share/DefaultAvatarImg";
import { VerificationCoin } from "@/components/score/VerificationCoin";
import { npubFromPubkey } from "@/lib/shareId";
import { cn } from "@/lib/utils";
import { ProfileEmojiText } from "@/components/ui/custom-emoji";
import type { DmRoom } from "@/lib/dm/store";

export type Profiles = Map<string, ProfileContent>;

export function shortNpub(pubkey: string): string {
  try {
    const npub = npubFromPubkey(pubkey);
    return `${npub.slice(0, 10)}…${npub.slice(-4)}`;
  } catch {
    return `${pubkey.slice(0, 8)}…`;
  }
}

export function nameOf(pubkey: string, profiles: Profiles): string {
  const p = profiles.get(pubkey);
  return (p?.display_name || p?.name || "").trim() || shortNpub(pubkey);
}

export function firstName(pubkey: string, profiles: Profiles): string {
  const name = nameOf(pubkey, profiles);
  return name.startsWith("npub") ? name : name.split(/\s+/)[0];
}

/** "Ana Ribeiro", "Marco, Jun and Sofia", or the group's subject. */
export function roomTitle(room: Pick<DmRoom, "participants" | "subject">, me: string, profiles: Profiles): string {
  if (room.subject) return room.subject;
  const others = room.participants.filter((pk) => pk !== me);
  if (!others.length) return "Note to self";
  if (others.length === 1) return nameOf(others[0], profiles);
  const names = others.map((pk) => firstName(pk, profiles));
  return names.length === 2 ? `${names[0]} and ${names[1]}` : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

/** `nameOf` (or `firstName`) as an element: the person's NIP-30 emoji drawn. */
export function PersonName({
  pubkey,
  profiles,
  first = false,
}: {
  pubkey: string;
  profiles: Profiles;
  first?: boolean;
}) {
  return <ProfileEmojiText pubkey={pubkey} text={first ? firstName(pubkey, profiles) : nameOf(pubkey, profiles)} />;
}

/** `roomTitle` as an element: a one-to-one chat's title is the person, emoji and all. */
export function RoomTitle({
  room,
  me,
  profiles,
}: {
  room: Pick<DmRoom, "participants" | "subject">;
  me: string;
  profiles: Profiles;
}) {
  const others = room.participants.filter((pk) => pk !== me);
  if (!room.subject && others.length === 1) return <PersonName pubkey={others[0]} profiles={profiles} />;
  return <>{roomTitle(room, me, profiles)}</>;
}

export function PersonAvatar({
  pubkey,
  profiles,
  score,
  size = 44,
  className,
}: {
  pubkey: string;
  profiles: Profiles;
  /** Verification Score 0–1, or undefined to leave the coin off. */
  score?: number | null;
  size?: number;
  className?: string;
}) {
  const picture = profiles.get(pubkey)?.picture;
  return (
    <span className={cn("relative inline-flex shrink-0", className)} style={{ width: size, height: size }}>
      <Avatar className="h-full w-full rounded-full bg-white ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
        {picture ? <AvatarImage src={picture} alt="" className="object-cover" /> : null}
        <AvatarFallback className="overflow-hidden rounded-full">
          <DefaultAvatarImg />
        </AvatarFallback>
      </Avatar>
      {score !== undefined && score !== null && (
        <VerificationCoin
          score01={score}
          pov="global"
          size={Math.max(18, Math.round(size * 0.42))}
          className="absolute -bottom-1 -right-1"
        />
      )}
    </span>
  );
}

/** One face for a 1:1 chat, two overlapping for a group. */
export function RoomAvatar({
  room,
  me,
  profiles,
  scoreOf,
  size = 48,
}: {
  room: Pick<DmRoom, "participants">;
  me: string;
  profiles: Profiles;
  scoreOf?: (pk: string) => number | null | undefined;
  size?: number;
}) {
  const others = room.participants.filter((pk) => pk !== me);
  if (others.length <= 1) {
    const pk = others[0] ?? me;
    return <PersonAvatar pubkey={pk} profiles={profiles} score={scoreOf?.(pk)} size={size} />;
  }
  const small = Math.round(size * 0.68);
  return (
    <span className="relative inline-block shrink-0" style={{ width: size, height: size }}>
      <PersonAvatar pubkey={others[0]} profiles={profiles} size={small} className="absolute left-0 top-0" />
      <PersonAvatar
        pubkey={others[1]}
        profiles={profiles}
        size={small}
        className="absolute bottom-0 right-0 rounded-full ring-2 ring-card"
      />
    </span>
  );
}

const DAY = 86400;

/** "10:42", "Yesterday", "Mon", "Sep 27", "Sep 27, 2025". */
export function listTime(at: number, now = Date.now() / 1000): string {
  const d = new Date(at * 1000);
  const today = new Date(now * 1000);
  const sameDay = d.toDateString() === today.toDateString();
  if (sameDay) return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const yesterday = new Date((now - DAY) * 1000);
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  if (now - at < 6 * DAY) return d.toLocaleDateString([], { weekday: "short" });
  if (d.getFullYear() === today.getFullYear()) return d.toLocaleDateString([], { month: "short", day: "numeric" });
  return d.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

export function clockTime(at: number): string {
  return new Date(at * 1000).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/** A day divider: "Today", "Yesterday", "Monday, September 28". */
export function dayLabel(at: number, now = Date.now() / 1000): string {
  const d = new Date(at * 1000);
  if (d.toDateString() === new Date(now * 1000).toDateString()) return "Today";
  if (d.toDateString() === new Date((now - DAY) * 1000).toDateString()) return "Yesterday";
  const sameYear = d.getFullYear() === new Date(now * 1000).getFullYear();
  return d.toLocaleDateString([], {
    weekday: "long",
    month: "long",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

/** "Sep 20" — how far a relay is complete. */
export function shortDate(at: number): string {
  const d = new Date(at * 1000);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString([], { month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) });
}

/** "inbox.nostr.wine" from "wss://inbox.nostr.wine/". */
export function relayHost(url: string): string {
  return url.replace(/^wss?:\/\//, "").replace(/\/$/, "");
}
