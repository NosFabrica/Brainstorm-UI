import { useMemo } from "react";
import type { NostrEvent } from "nostr-tools";
import { useQuery } from "@tanstack/react-query";
import { Copy, Loader2 } from "lucide-react";
import { useLiveProfiles } from "@/hooks/useLiveProfile";
import { useRefEvents } from "@/hooks/useRefEvents";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { PersonCell } from "@/components/admin/billing/DivergenceRows";
import { QuotedRef } from "@/components/share/activity/parts";
import { AllResults } from "@/components/search/AllResults";
import { useToast } from "@/hooks/use-toast";
import { copyToClipboard } from "@/lib/clipboard";
import { isDListItem } from "@/lib/dlistFields";
import type { EventRef } from "@/lib/activity";
import { loadTrustedList, type ListMember, type TrustedListKind } from "./listMembers";

const NO_SCORE = () => null;

/** One published list's members, read back from the relay it went to. */
export function TrustedListMembers({
  observer,
  signingPubkey,
  dTag,
  kind = 30392,
  testId,
}: {
  observer: string;
  signingPubkey: string;
  dTag: string;
  kind?: TrustedListKind;
  testId: string;
}) {
  const { toast } = useToast();
  const list = useQuery({
    // A relay probe: read back from the relay it was published to, never a cache.
    queryKey: ["trusted-list", observer, signingPubkey, kind, dTag],
    staleTime: 0,
    gcTime: 0,
    queryFn: () => loadTrustedList({ observer, signingPubkey, dTag, kind }),
  });
  const pubkeys = list.data?.members.flatMap((m) => ("pubkey" in m ? [m.pubkey] : [])) ?? [];
  // Names and pictures are best-effort: a member without a kind-0 still shows.
  const profilesMap = useLiveProfiles(pubkeys);

  const note = "text-xs text-slate-500 dark:text-slate-400";
  return (
    <div
      className="mt-1 basis-full rounded-lg border border-slate-100 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-950/40"
      data-testid={testId}
    >
      {list.isPending && (
        <p className={`${note} inline-flex items-center gap-1.5`}>
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Reading the list from the relay…
        </p>
      )}
      {list.isError && (
        <p className="text-xs text-red-600 dark:text-red-400">
          {list.error instanceof Error ? list.error.message : "Couldn't read the list."}
        </p>
      )}
      {list.isSuccess && !list.data && (
        <p className={note}>Not on the relay yet — a new list can take a moment to appear.</p>
      )}
      {list.data?.retracted && <p className={note}>This list has been retracted.</p>}
      {list.data && !list.data.retracted && (
        <>
          <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
            <span className={note}>
              {list.data.members.length} {list.data.members.length === 1 ? "member" : "members"} · on {list.data.relay}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 text-xs"
              onClick={async () => {
                const ok = await copyToClipboard(list.data!.naddr);
                toast({
                  title: ok ? "Link copied" : "Couldn't copy the link",
                  description: ok ? "Paste it into any Nostr app to open the list." : undefined,
                });
              }}
            >
              <Copy className="h-3.5 w-3.5" /> Copy link
            </Button>
          </div>
          {kind === 30392 ? (
            <ul className="space-y-1">
              {list.data.members.map((m) => {
                if (!("pubkey" in m)) return null;
                const p = profilesMap?.get(m.pubkey);
                return (
                  <li key={m.pubkey} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                    <PersonCell
                      pubkey={m.pubkey}
                      profile={p ? { name: p.display_name || p.name, picture: p.picture } : undefined}
                    />
                    <MemberScore member={m} />
                  </li>
                );
              })}
            </ul>
          ) : (
            <TaggedMembers members={list.data.members} />
          )}
        </>
      )}
    </div>
  );
}

/**
 * A list of tagged notes or items, each drawn as the event it names: a note as its card, an
 * addressable thing (an article, a listing, a DList item) as search's All draws it, as a tag's
 * page does (TaggedNotes). One ask for all of them, from the store first (ADR 0005); one the
 * relays don't have still shows, as a row that leads to its page.
 */
function TaggedMembers({ members }: { members: ListMember[] }) {
  const targets = useMemo(
    () =>
      members.flatMap((m): { member: ListMember; ref: EventRef }[] =>
        "id" in m
          ? [{ member: m, ref: { id: m.id } }]
          : "address" in m
            ? [{ member: m, ref: { addr: m.address } }]
            : [],
      ),
    [members],
  );
  const asked = useMemo(() => targets.map((t) => t.ref), [targets]);
  const refs = useRefEvents(asked);
  return (
    <ul className="space-y-2.5">
      {targets.map(({ member, ref }) => {
        const event = refs.get(ref) as NostrEvent | undefined;
        return (
          <li key={ref.id ?? ref.addr} className="space-y-1" data-testid="trusted-list-member">
            {/* A DList item tagged by id (kind 9999) reads as its list draws it, not as a note. */}
            {event && (ref.addr || isDListItem(event)) ? (
              <AllResults
                hits={[{ event, author: null, rank: null }]}
                settled={refs.settled}
                scoreOf={NO_SCORE}
                query=""
              />
            ) : (
              <QuotedRef target={ref} refs={refs} />
            )}
            <div className="flex justify-end">
              <MemberScore member={member} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function MemberScore({ member: m }: { member: ListMember }) {
  return (
    <span className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
      {m.endorsements !== undefined && (
        <span>
          {m.endorsements} {m.endorsements === 1 ? "endorsement" : "endorsements"}
        </span>
      )}
      {m.score !== null && (
        <Chip tone="brand" size="sm">
          score {m.score}
        </Chip>
      )}
    </span>
  );
}
