/**
 * The pack page (kind 30000 on /e) — a follow set opens as its PEOPLE.
 * Title + member count, the curator (whose web of trust this list speaks
 * for), the description, then the full roster: every member a tappable
 * row with avatar, tier ring, and name, into their profile. The search
 * card shows five faces; this page is where the other +12 live.
 */
import { useEffect, useState } from "react";
import { Link } from "wouter";
import { nip19 } from "nostr-tools";
import type { NostrEvent } from "nostr-tools";
import { ListChecks } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DefaultAvatarImg } from "@/components/share/DefaultAvatarImg";
import { useTierRing } from "@/components/score/VerificationCoin";
import { useAuthorScores } from "@/hooks/useAuthorScores";
import { eventStore } from "@/lib/eventStore";
import { fetchProfileMap } from "@/services/nostr";
import { Chip } from "@/components/ui/chip";

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

/** Store-first profiles for a set of pubkeys, one batched relay fallback. */
function useProfiles(pubkeys: string[]): Map<string, MemberProfile> {
  const [map, setMap] = useState<Map<string, MemberProfile>>(new Map());
  const key = pubkeys.join(",");
  useEffect(() => {
    const known = new Map<string, MemberProfile>();
    const missing: string[] = [];
    for (const pk of pubkeys) {
      const stored = eventStore.getReplaceable(0, pk);
      if (stored) {
        try {
          known.set(pk, JSON.parse(stored.content) as MemberProfile);
        } catch {
          /* unparseable — npub row */
        }
      } else missing.push(pk);
    }
    setMap(known);
    if (missing.length === 0) return;
    let alive = true;
    void fetchProfileMap(missing).then((res) => {
      if (!alive || res.size === 0) return;
      setMap((prev) => {
        const next = new Map(prev);
        for (const [pk, content] of res) next.set(pk, content as MemberProfile);
        return next;
      });
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return map;
}

const ROSTER_FOLD = 25;

export function FollowSetHero({ event }: { event: SetEvent }) {
  const title = event.tags.find((t) => t[0] === "title" || t[0] === "name")?.[1] ?? "Follow set";
  const description = event.tags.find((t) => t[0] === "description")?.[1];
  const members = event.tags.filter((t) => t[0] === "p" && t[1]).map((t) => t[1]);

  const tierRing = useTierRing();
  const scoreOf = useAuthorScores([event.pubkey, ...members.slice(0, 50)]);
  const profiles = useProfiles([event.pubkey, ...members]);
  const [rosterOpen, setRosterOpen] = useState(false);

  const curator = profiles.get(event.pubkey);
  const curatorName = curator?.display_name || curator?.name;
  const curatorNpub = npubOf(event.pubkey);
  const shown = rosterOpen ? members : members.slice(0, ROSTER_FOLD);

  return (
    <div data-testid="follow-set-hero">
      {/* Identity left, the list glyph top-right — the settled anatomy. */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100" style={{ fontFamily: "var(--font-display)" }}>
              {title}
            </h1>
            <Chip size="sm" tone="info">
              {members.length} {members.length === 1 ? "member" : "members"}
            </Chip>
          </div>
          {curatorNpub && (
            <Link
              href={`/p/${curatorNpub}`}
              className="mt-0.5 inline-flex items-center gap-1.5 rounded-full py-0.5 pr-1.5 hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors"
              data-testid="set-hero-curator"
            >
              <Avatar
                className={`h-[18px] w-[18px] border border-slate-200/80 dark:border-slate-800/80 ${tierRing(scoreOf(event.pubkey) ?? null, false, "sm", true) ?? ""}`}
              >
                {curator?.picture ? <AvatarImage src={curator.picture} alt="" className="object-cover" /> : null}
                <AvatarFallback className="overflow-hidden">
                  <DefaultAvatarImg />
                </AvatarFallback>
              </Avatar>
              <span className="text-xs font-medium text-brand-link">
                {curatorName ?? `${curatorNpub.slice(0, 12)}…`}
              </span>
            </Link>
          )}
          {description && <p className="mt-1 text-sm text-slate-600 dark:text-slate-300 break-words">{description}</p>}
        </div>
        <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-3xl bg-slate-100 dark:bg-slate-800 shadow-sm">
          <ListChecks className="h-8 w-8 text-slate-400 dark:text-slate-500" />
        </div>
      </div>

      {/* The roster — the whole point of opening a pack. */}
      <div className="mt-4 border-t border-slate-100 dark:border-slate-800/60 pt-3">
        <ul className="space-y-0.5" data-testid="set-hero-roster">
          {shown.map((pk) => {
            const profile = profiles.get(pk);
            const name = profile?.display_name || profile?.name;
            const npub = npubOf(pk);
            return (
              <li key={pk}>
                <Link
                  href={npub ? `/p/${npub}` : "#"}
                  className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 -mx-2 hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors"
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
    </div>
  );
}
