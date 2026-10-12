/**
 * "Who stands behind it": what the reader's network says about a list item,
 * for any tier-three page (ADR 0007) — the GitHub account's, the place's.
 * How many people the reader trusts vouch for it, their faces ranked as
 * every endorsement surface ranks them (services/endorsements: followed,
 * verified, other), and a Vouch button for a signed-in reader: one "+",
 * public and signed. "Nobody you trust yet" when none, so the reader sees
 * the way to be the first. Who listed it is the footer's.
 *
 * useNetworkView reads it once for a page, with names and faces for
 * everyone it names; a view that also wants the profiles claiming a handle
 * (the GitHub page) passes the handle and reads `claimants` and `split`.
 */
import { Link } from "wouter";
import { Check, Loader2, ThumbsUp } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DefaultAvatarImg } from "@/components/share/DefaultAvatarImg";
import { useTierRing } from "@/components/score/VerificationCoin";
import { useActiveAccountDisplay } from "@/hooks/useActiveAccountDisplay";
import { useAuthorScores } from "@/hooks/useAuthorScores";
import { useEndorseItem, useItemEngagement } from "@/hooks/useItemEngagement";
import { useMyFollows } from "@/hooks/useMyFollows";
import { useProfileMap } from "@/hooks/useProfileMap";
import { useWotItems } from "@/hooks/useWotItems";
import { rankEndorsers } from "@/services/endorsements";
import { getDisplayLabel } from "@/lib/profileSearch";
import type { ItemEvent } from "@/components/share/DListItemParts";

/**
 * What the network says, read once for the page: the listing's endorsers,
 * ranked as every endorsement surface ranks them (services/endorsements:
 * followed, verified, other), the profiles claiming the handle split by the
 * reader's web of trust, the lister's distance, and names and faces for all
 * of them.
 */
export function useNetworkView(event: ItemEvent, handle: string | null = null) {
  const { endorsers, claimants } = useItemEngagement(event, handle);
  const me = useActiveAccountDisplay()?.pubkey ?? null;
  const endorse = useEndorseItem(event);
  const { follows } = useMyFollows();
  const people = [...new Set([...endorsers.map((e) => e.pubkey), ...claimants.map((c) => c.pubkey)])];
  const scoreOf = useAuthorScores(people);
  const profiles = useProfileMap(people);
  const nameOf = (pk: string) => {
    const p = profiles.get(pk);
    return p ? getDisplayLabel(p) : pk.slice(0, 8);
  };
  const ranked = rankEndorsers(endorsers, { follows, scoreOf });
  const split = useWotItems(claimants);
  return {
    me,
    endorse,
    endorsers,
    ranked,
    claimants,
    split,
    scoreOf,
    nameOf,
    pictureOf: (pk: string) => profiles.get(pk)?.picture,
    npubOf: (pk: string) => profiles.get(pk)?.npub,
    mine: !!me && endorsers.some((e) => e.pubkey === me),
  };
}
export type NetworkView = ReturnType<typeof useNetworkView>;

/**
 * What the reader's network says, as labelled facts between GitHub's
 * content and the rest of the list: how many in the reader's network vouch for it (their
 * faces, the Endorse button at the row's end), who added it with how they
 * relate to the reader beside the name ("a friend of a friend"), and — only
 * when someone else filed the same handle — who else added it. Each fact has a line on
 * hover saying what it means; a fact with nothing to say is left out, except
 * vouches, which read "none yet" so a signed-in reader sees the Endorse path.
 */
/**
 * The words for the act: one puts their name behind an account or a place
 * ("vouch"), and recommends a book ("recommend"). Same signed signal.
 */
export type Voice = "vouch" | "recommend";
const WORDS: Record<Voice, { heading: string; by: string; verb: string; done: string; youDid: string }> = {
  vouch: {
    heading: "Who stands behind it",
    by: "Vouched for by",
    verb: "Vouch for it",
    done: "Vouched",
    youDid: "You vouched for this",
  },
  recommend: {
    heading: "Who recommends it",
    by: "Recommended by",
    verb: "Recommend",
    done: "Recommended",
    youDid: "You recommended this",
  },
};

export function WhoStandsBehindIt({
  network: n,
  noun,
  idPrefix,
  voice = "vouch",
}: {
  network: NetworkView;
  /** What the item is, in the button's words: "account", "place". */
  noun: string;
  /** The test ids' prefix, one per view. */
  idPrefix: string;
  voice?: Voice;
}) {
  const tierRing = useTierRing();
  const words = WORDS[voice];
  const inNetwork = n.ranked.filter((e) => e.group !== "other" && e.pubkey !== n.me).length;
  const people = (k: number) => `${k} ${k === 1 ? "person" : "people"} you trust`;
  const vouches = n.mine
    ? inNetwork > 0
      ? `you and ${people(inNetwork)}`
      : "you"
    : inNetwork > 0
      ? people(inNetwork)
      : "nobody you trust yet";
  // The author is the footer's "Listed by"; the strip names only who else filed the same handle.
  return (
    <div className="space-y-2" data-testid={`${idPrefix}-verdict`}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-400 dark:text-slate-500">
          {words.heading}
        </p>
        {n.me && <EndorseButton network={n} noun={noun} idPrefix={idPrefix} voice={voice} />}
      </div>
      <dl className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        <div
          className="flex items-center gap-2"
          data-testid={`${idPrefix}-fact-vouches`}
          title={`People you follow, or people they trust, who put their name behind this ${noun}`}
        >
          <dt className="text-slate-500 dark:text-slate-400">{words.by}</dt>
          <dd className="flex items-center gap-2">
            {n.ranked.length > 0 && (
              <span className="flex -space-x-1.5">
                {n.ranked.slice(0, 3).map((e) => {
                  const npub = n.npubOf(e.pubkey);
                  const face = (
                    <Avatar
                      data-face={e.pubkey}
                      className={`h-6 w-6 rounded-full bg-white dark:bg-slate-900 ${tierRing(e.score, false, "sm", true) ?? "ring-2 ring-white dark:ring-slate-900"}`}
                    >
                      {n.pictureOf(e.pubkey) ? (
                        <AvatarImage src={n.pictureOf(e.pubkey)} alt="" className="object-cover" />
                      ) : null}
                      <AvatarFallback className="overflow-hidden rounded-full">
                        <DefaultAvatarImg />
                      </AvatarFallback>
                    </Avatar>
                  );
                  return npub ? (
                    <Link key={e.pubkey} href={`/p/${npub}`} className="rounded-full" title={n.nameOf(e.pubkey)}>
                      {face}
                    </Link>
                  ) : (
                    <span key={e.pubkey} title={n.nameOf(e.pubkey)}>
                      {face}
                    </span>
                  );
                })}
              </span>
            )}
            <span
              className={
                inNetwork > 0 || n.mine
                  ? "font-semibold text-slate-900 dark:text-slate-100"
                  : "text-slate-500 dark:text-slate-400"
              }
            >
              {vouches}
            </span>
          </dd>
        </div>
      </dl>
    </div>
  );
}

/** One "+" on the item, public and signed by the reader's account; "Endorsed" once they have. */
function EndorseButton({
  network: n,
  noun,
  idPrefix,
  voice,
}: {
  network: NetworkView;
  noun: string;
  idPrefix: string;
  voice: Voice;
}) {
  const { endorse, mine } = n;
  const words = WORDS[voice];
  return (
    <button
      type="button"
      onClick={() => endorse.mutate()}
      disabled={mine || endorse.isPending}
      className={`inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold transition-colors ${
        mine
          ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
          : "border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
      }`}
      title={mine ? `${words.youDid} ${noun}` : "Public and signed by your account"}
      data-testid={`${idPrefix}-endorse`}
    >
      {endorse.isPending ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : mine ? (
        <Check className="h-3.5 w-3.5" />
      ) : (
        <ThumbsUp className="h-3.5 w-3.5" />
      )}
      {mine ? words.done : words.verb}
    </button>
  );
}
