/**
 * The pack page (kind 30000 on /e) — a follow set opens as its PEOPLE.
 * Title + member count, the curator (whose web of trust this list speaks
 * for), the description, then the full roster: every member a tappable
 * row with avatar, tier ring, and name, into their profile. The search
 * card shows five faces; this page is where the other +12 live.
 */
import { useMemo, useState, type ReactNode } from "react";
import { useLiveProfiles } from "@/hooks/useLiveProfile";
import { Link } from "wouter";
import { nip19 } from "nostr-tools";
import { ListChecks } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DefaultAvatarImg } from "@/components/share/DefaultAvatarImg";
import { useTierRing } from "@/components/score/VerificationCoin";
import { useAuthorScores } from "@/hooks/useAuthorScores";
import { Chip } from "@/components/ui/chip";
import { EmojiText } from "@/components/ui/custom-emoji";

// Structural minimum (EventPage hands heroes MinimalEvent, which has no sig).
type SetEvent = {
  pubkey: string;
  tags: string[][];
  content: string;
  created_at: number;
};

type MemberProfile = { name?: string; display_name?: string; picture?: string; nip05?: string };

function npubOf(pubkey: string): string {
  try {
    return nip19.npubEncode(pubkey);
  } catch {
    return "";
  }
}

/** Profiles for a set of pubkeys, live. */
function useProfiles(pubkeys: string[]): Map<string, MemberProfile> {
  return useLiveProfiles(pubkeys) as Map<string, MemberProfile>;
}

const ROSTER_FOLD = 25;

export function FollowSetHero({ event }: { event: SetEvent }) {
  const title = event.tags.find((t) => t[0] === "title" || t[0] === "name")?.[1] ?? "Follow set";
  const description = event.tags.find((t) => t[0] === "description")?.[1];
  const members = useMemo(() => event.tags.filter((t) => t[0] === "p" && t[1]).map((t) => t[1]), [event.tags]);

  return (
    <div data-testid="follow-set-hero">
      {/* Title left, the list glyph right — the settled anatomy, at the title's
          own height: the glyph says "a list", it is not the list's picture
          (Benjamin, 2026-09-09: "this icon is big"). The curator is not named
          here: the page's author row above the card already does. */}
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1
              className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100"
              style={{ fontFamily: "var(--font-display)" }}
            >
              <EmojiText text={title} tags={event} />
            </h1>
            <Chip size="sm" tone="info">
              {members.length} {members.length === 1 ? "member" : "members"}
            </Chip>
          </div>
          {description && (
            <p className="mt-1 break-words text-sm text-slate-600 dark:text-slate-300">
              <EmojiText text={description} tags={event} />
            </p>
          )}
        </div>
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800"
          data-testid="set-hero-glyph"
        >
          <ListChecks className="h-5 w-5 text-slate-400 dark:text-slate-500" />
        </div>
      </div>

      {/* The roster — the whole point of opening a pack. */}
      <SetRoster members={members} />
    </div>
  );
}

/**
 * A list's people as tappable rows — avatar in the tier ring, name, NIP-05 —
 * folded after the first 25. `trailing` puts something at each row's end
 * (a Trusted List's per-member score).
 */
export function SetRoster({ members, trailing }: { members: string[]; trailing?: (pubkey: string) => ReactNode }) {
  const tierRing = useTierRing();
  const [rosterOpen, setRosterOpen] = useState(false);

  const shown = useMemo(() => (rosterOpen ? members : members.slice(0, ROSTER_FOLD)), [members, rosterOpen]);
  // Asked for the rows on screen: a folded list of hundreds asks for 25, and
  // opening it asks for the rest — rings included, past the first 50.
  const scoreOf = useAuthorScores(shown);
  const profiles = useProfiles(shown);

  // Most of the relay's pinned-tag Trusted Lists are empty (probed 2026-10-08:
  // 477 of 500): say so rather than draw an empty roster.
  if (members.length === 0)
    return (
      <p
        className="mt-4 border-t border-slate-100 pt-3 text-sm text-slate-500 dark:border-slate-800/60 dark:text-slate-400"
        data-testid="set-hero-roster-empty"
      >
        No one is on this list yet.
      </p>
    );

  return (
    <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-800/60">
      <ul className="space-y-0.5" data-testid="set-hero-roster">
        {shown.map((pk) => {
          const profile = profiles.get(pk);
          const name = profile?.display_name || profile?.name;
          const npub = npubOf(pk);
          return (
            <li key={pk} className="flex items-center gap-3">
              <Link
                href={npub ? `/p/${npub}` : "#"}
                className="-mx-2 flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-slate-50 dark:hover:bg-slate-900"
                data-testid={`set-member-${pk}`}
              >
                <Avatar
                  className={`h-8 w-8 shrink-0 border border-slate-200/80 dark:border-slate-800/80 ${tierRing(scoreOf(pk) ?? null, false, "sm", true) ?? ""}`}
                >
                  {profile?.picture ? <AvatarImage src={profile.picture} alt="" className="object-cover" /> : null}
                  <AvatarFallback className="overflow-hidden">
                    <DefaultAvatarImg />
                  </AvatarFallback>
                </Avatar>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                    {name ?? `${npub.slice(0, 16)}…`}
                  </span>
                  {profile?.nip05 && (
                    <span className="block truncate text-[11px] text-slate-500 dark:text-slate-400">
                      {profile.nip05.replace(/^_@/, "")}
                    </span>
                  )}
                </span>
              </Link>
              {trailing?.(pk)}
            </li>
          );
        })}
      </ul>
      {members.length > ROSTER_FOLD && (
        <button
          type="button"
          onClick={() => setRosterOpen((v) => !v)}
          className="mt-2 text-xs font-medium text-brand-primary hover:underline"
          data-testid="set-hero-roster-toggle"
        >
          {rosterOpen ? "Show fewer" : `Show all ${members.length} members`}
        </button>
      )}
    </div>
  );
}
