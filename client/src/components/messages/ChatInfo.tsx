/**
 * Who you're talking to, and why you can trust them: the Verification Score,
 * whether you follow them, the path that connects you, and where their
 * messages actually go.
 */
import { Link } from "wouter";
import { Archive, Ban, ChevronRight, Route, Server, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { SectionHeader } from "@/components/ui/section-header";
import { FollowedByLine } from "@/components/search/EndorsementLine";
import { useHasMywot } from "@/hooks/useHasMywot";
import { npubFromPubkey } from "@/lib/shareId";
import { tierForScore01 } from "@/components/score/VerificationCoin";
import { TIER_LABELS } from "@/services/trustThreshold";
import { PersonAvatar, nameOf, relayHost, roomTitle, shortNpub, type Profiles, PersonName } from "./people";
import { useDmRelays } from "@/hooks/useDmRelays";

function TheirInbox({ pubkey, name }: { pubkey: string; name: string }) {
  const inbox = useDmRelays(pubkey);
  const data = inbox.loading ? undefined : inbox;
  return (
    <div className="flex flex-col gap-2">
      <SectionHeader kicker="Their inbox relays" />
      {data?.relays.length ? (
        data.relays.map((url) => (
          <span key={url} className="flex items-center gap-2 font-mono text-xs text-slate-600 dark:text-slate-300">
            <Server className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{relayHost(url)}</span>
          </span>
        ))
      ) : (
        <span className="text-xs text-slate-500">{data ? "None published." : "Looking…"}</span>
      )}
      <span className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
        From their kind 10050 list. Your messages to {name} only go here.
      </span>
    </div>
  );
}

export function ChatInfo({
  roomKey,
  subject,
  me,
  profiles,
  scoreOf,
  follows,
  onArchive,
  onBlock,
}: {
  roomKey: string;
  subject?: string;
  me: string;
  profiles: Profiles;
  scoreOf: (pk: string) => number | null | undefined;
  follows: ReadonlySet<string>;
  onArchive: () => void;
  onBlock: (pubkey: string) => void;
}) {
  const { hasMywot } = useHasMywot();
  const others = roomKey.split(",").filter((pk) => pk !== me);
  if (others.length > 1) {
    return (
      <aside
        className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto border-l border-border bg-card p-5"
        aria-label="Group details"
      >
        <div className="flex flex-col gap-1">
          <span className="text-lg font-bold">
            {roomTitle({ participants: roomKey.split(","), subject }, me, profiles)}
          </span>
          <span className="text-[13px] text-slate-500">Group · {others.length + 1} people including you</span>
        </div>
        <div className="flex flex-col gap-3">
          <SectionHeader kicker="Members" />
          {others.map((pk) => (
            <Link
              key={pk}
              href={`/p/${npubFromPubkey(pk)}`}
              className="flex items-center gap-3 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/60"
            >
              <PersonAvatar pubkey={pk} profiles={profiles} score={scoreOf(pk)} size={36} />
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-semibold">
                  <PersonName pubkey={pk} profiles={profiles} />
                </span>
                <span className="text-xs text-slate-500">{follows.has(pk) ? "You follow" : "Not in your follows"}</span>
              </span>
            </Link>
          ))}
        </div>
        <p className="flex gap-2 rounded-xl border border-border bg-slate-50 p-3 text-[13px] leading-relaxed text-slate-600 dark:bg-slate-900 dark:text-slate-300">
          <UserPlus className="mt-0.5 h-4 w-4 shrink-0" />A NIP-17 group is its member list. Adding or removing someone
          starts a new chat; this one keeps its history.
        </p>
        <Button variant="outline" onClick={onArchive} className="mt-auto justify-start">
          <Archive className="mr-2 h-4 w-4" /> Archive chat
        </Button>
      </aside>
    );
  }

  const pk = others[0] ?? me;
  const name = nameOf(pk, profiles);
  const score = scoreOf(pk);
  const tier = typeof score === "number" ? tierForScore01(score) : undefined;
  const npub = npubFromPubkey(pk);
  return (
    <aside
      className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto border-l border-border bg-card p-5"
      aria-label="Details"
    >
      <div className="flex flex-col items-center gap-2 text-center">
        <PersonAvatar pubkey={pk} profiles={profiles} score={score} size={76} />
        <Link href={`/p/${npub}`} className="text-lg font-bold hover:underline">
          {name}
        </Link>
        <span className="font-mono text-xs text-slate-500">{shortNpub(pk)}</span>
        <span className="flex flex-wrap justify-center gap-1.5">
          {pk !== me &&
            (follows.has(pk) ? <Chip tone="brand">You follow</Chip> : <Chip tone="slate">Not in your follows</Chip>)}
          {tier && <Chip tone="slate">{TIER_LABELS[tier]}</Chip>}
        </span>
        {pk !== me && <FollowedByLine pubkey={pk} npub={npub} personal={hasMywot} className="mt-1" />}
      </div>
      {pk !== me && (
        <Link
          href={`/p/${npub}/hops`}
          className="flex items-center gap-2 text-[13px] font-semibold text-brand-link hover:underline"
        >
          <Route className="h-4 w-4" /> See how you're connected <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      )}
      <TheirInbox pubkey={pk} name={name} />
      <div className="mt-auto flex flex-col gap-1">
        <Button variant="ghost" onClick={onArchive} className="justify-start">
          <Archive className="mr-2 h-4 w-4" /> Archive chat
        </Button>
        {pk !== me && (
          <Button variant="ghost" onClick={() => onBlock(pk)} className="justify-start text-red-600 dark:text-red-400">
            <Ban className="mr-2 h-4 w-4" /> Block {name}
          </Button>
        )}
      </div>
    </aside>
  );
}
