import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Loader2, PinOff, Tag as TagIcon } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DefaultAvatarImg } from "@/components/share/DefaultAvatarImg";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { FacePile, NameList, displayName, profilePath } from "@/components/tags/FacePile";
import { useToast } from "@/hooks/use-toast";
import { fetchProfileMap, hasLocalSecretKey } from "@/services/nostr";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import {
  useApplyTag,
  useMyAssertions,
  usePinnedTags,
  useProfileTags,
  useTogglePin,
} from "@/hooks/useTags";
import { TAG_PINS_ENABLED } from "@/config/tagging";
import { npubFromPubkey } from "@/lib/shareId";
import { corroborations, onlySelfDeclared } from "@/lib/tagCounts";
import type { FaceProfile } from "@/components/tags/FacePile";
import type { MyAssertion, ProfileTag } from "@/services/tags";

/**
 * Everything tagging-related about you — the body of `/tags/mine`, the "Yours"
 * view of the Tags page.
 *
 * Briefly lived as a Settings tab. See `pages/MyTagsPage.tsx` for why it left:
 * nothing here is a setting.
 *
 * The kit specifies no such surface — tags on you live in the profile chip row
 * and you manage them there. But nothing in that design answers "what have I
 * claimed about other people?", and those claims are public, permanent and
 * signed with your key. Rendering is the integrator's call
 * (`core/INTEGRATION.md` §5), so sections 1 and 2 are ordinary UI over machinery
 * the kit already sanctions. Section 3 (pins) is the declared deviation — see
 * `TAG_PINS_ENABLED`.
 */

/** Roughly a screenful before "Show all" — see the note at the call site. */
const SAID_PREVIEW = 10;

export function YourTagsPanel() {
  const [currentUser] = useCurrentUser();
  const viewerPubkey = currentUser?.pubkey;
  const canAct =
    !!viewerPubkey &&
    (hasLocalSecretKey() ||
      (typeof window !== "undefined" && !!(window as unknown as { nostr?: unknown }).nostr));

  const { data: onMe, isLoading: loadingMine } = useProfileTags(viewerPubkey);
  const { data: mySaid, isLoading: loadingSaid } = useMyAssertions();
  const { data: pinned } = usePinnedTags(TAG_PINS_ENABLED);

  let myNpub = "";
  try {
    myNpub = viewerPubkey ? npubFromPubkey(viewerPubkey) : "";
  } catch {
    /* unlinkable */
  }

  const tagsOnMe = onMe?.tags ?? [];
  const said = mySaid ?? [];
  const [saidShown, setSaidShown] = useState(SAID_PREVIEW);

  /**
   * Everyone named anywhere on this page — the people who tagged you AND the
   * people you tagged — resolved in ONE round-trip.
   *
   * Both sections want faces, and the two sets overlap in practice (you tag
   * people who tag you). Two queries would fetch the same profiles twice and
   * make the sections pop in at different moments.
   */
  const people = useMemo(() => {
    const set = new Set<string>();
    for (const t of tagsOnMe) for (const pk of t.asserters) if (pk !== viewerPubkey) set.add(pk);
    for (const a of said) if (a.targetKind === "pubkey") set.add(a.target);
    return Array.from(set);
  }, [tagsOnMe, said, viewerPubkey]);

  const profilesQuery = useQuery({
    queryKey: ["your-tags-profiles", people.join(",")],
    queryFn: () => fetchProfileMap(people),
    enabled: people.length > 0,
    staleTime: 5 * 60_000,
    retry: false,
  });
  const profiles = profilesQuery.data;

  return (
    <div className="space-y-6" data-testid="your-tags-panel">
        {/* Said once, near the top, in plain words. The protocol has no delete
            and a page called "manage" must not imply otherwise. No guide link
            on the end of it — the shell puts one directly above this, and the
            same link twice in four lines reads as a mistake. */}
        <p className="mt-4 text-sm text-slate-500 dark:text-slate-400" data-testid="my-tags-no-delete">
          You can't erase a tag someone else gave you — nobody can, on Nostr. What
          you can do is disagree, and it stops counting.
        </p>

        {/* ── 1. Tags on me ─────────────────────────────────────────────── */}
        <section className="mt-8" data-testid="my-tags-on-me">
          <SectionLabel
            count={tagsOnMe.length}
            hint="What other people say you're known for."
          >
            About you
          </SectionLabel>
          {loadingMine ? (
            <Loading />
          ) : tagsOnMe.length === 0 ? (
            <Card className="p-6">
              <EmptyState
                icon={TagIcon}
                compact
                title="Nobody has tagged you yet"
                description="When someone does, it shows up here and on your profile."
              />
            </Card>
          ) : (
            <Card className="divide-y divide-slate-100 dark:divide-slate-800/60 overflow-hidden">
              {tagsOnMe.map((tag) => (
                <TagOnMeRow
                  key={tag.key}
                  tag={tag}
                  canAct={canAct}
                  viewerPubkey={viewerPubkey!}
                  profiles={profiles}
                />
              ))}
            </Card>
          )}
        </section>

        {/* ── 2. Tags I've applied ──────────────────────────────────────── */}
        <section className="mt-8" data-testid="my-tags-said">
          <SectionLabel
            count={said.length}
            hint="Public and signed by you. These are your claims about other people."
          >
            What you've said
          </SectionLabel>
          {loadingSaid ? (
            <Loading />
          ) : said.length === 0 ? (
            <Card className="p-6">
              <EmptyState
                icon={TagIcon}
                compact
                title="You haven't tagged anyone yet"
                description="Open someone's profile and use “Add a tag” to say what they're known for. It shows up here so you can look back at it."
              />
            </Card>
          ) : (
            <Card className="divide-y divide-slate-100 dark:divide-slate-800/60 overflow-hidden">
              {said.slice(0, saidShown).map((a) => (
                <SaidRow key={`${a.key}-${a.target}`} said={a} profiles={profiles} />
              ))}
              {/* This list grows by one row every time you tag anybody, and
                  there is no delete — an active account has hundreds. Newest
                  first, a screenful by default, the rest on request. */}
              {said.length > saidShown && (
                <button
                  type="button"
                  onClick={() => setSaidShown(said.length)}
                  className="w-full px-4 py-3 text-xs font-semibold text-brand-link transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50"
                  data-testid="my-tags-said-more"
                >
                  Show all {said.length}
                </button>
              )}
            </Card>
          )}
        </section>

        {/* ── 3. Pinned — the declared deviation, off by default ─────────── */}
        {TAG_PINS_ENABLED && (
          <section className="mt-8" data-testid="my-tags-pinned">
            <SectionLabel>Saved tags</SectionLabel>
            {!pinned?.length ? (
              <Card className="p-6">
                <EmptyState
                  icon={TagIcon}
                  compact
                  title="No saved tags"
                  description="Save a tag from its page to keep it here."
                />
              </Card>
            ) : (
              <Card className="divide-y divide-slate-100 dark:divide-slate-800/60 overflow-hidden">
                {pinned.map((p) => (
                  <PinnedRow key={p.key} pin={p} />
                ))}
              </Card>
            )}
          </section>
        )}

        {/* Everyone-else's tags are one tap away in the view switcher above,
            so the only thing left worth linking is the public face of all
            this — what other people actually see. */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 border-t border-slate-100 pt-6 text-xs dark:border-slate-800/60">
          {myNpub && (
            <Link
              href={`/p/${myNpub}`}
              className="font-semibold text-brand-link hover:underline"
              data-testid="your-tags-profile"
            >
              See your public profile →
            </Link>
          )}
        </div>
    </div>
  );
}

/** One tag the network put on you, with the only two actions that exist. */

function TagOnMeRow({
  tag,
  canAct,
  viewerPubkey,
  profiles,
}: {
  tag: ProfileTag;
  canAct: boolean;
  viewerPubkey: string;
  profiles?: Map<string, FaceProfile>;
}) {
  const applyTag = useApplyTag(viewerPubkey);
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  const others = corroborations(tag);
  const agreed = tag.myStance === "apply";
  // Whoever vouched, minus you. "3 people say this" is a statistic; "Tanja, Avi
  // and 1 other say this" is a claim you can go and check, which is the whole
  // point of a signed tag.
  const vouchers = tag.asserters.filter((pk) => pk !== viewerPubkey);

  let authorNpub = "";
  try {
    authorNpub = npubFromPubkey(tag.authorPubkey);
  } catch {
    /* unlinkable */
  }

  async function setStance(polarity: 1 | -1) {
    setBusy(true);
    try {
      await applyTag.mutateAsync({
        tag: { authorPubkey: tag.authorPubkey, slug: tag.slug },
        polarity,
        displayName: tag.name,
      });
      toast({
        title: polarity === 1 ? `You agree with "${tag.name}"` : `You disagree with "${tag.name}"`,
        description:
          polarity === 1
            ? "Your agreement is public."
            : "It stops counting. The original stays on Nostr — nothing is ever deleted.",
      });
    } catch {
      toast({
        title: "Couldn't save that",
        description: "Check your connection and try again.",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-start gap-3 px-4 py-3.5" data-testid="my-tag-row">
      <FacePile pubkeys={vouchers} profiles={profiles} />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          {authorNpub ? (
            <Link href={`/tags/${authorNpub}/${tag.slug}`} data-testid="my-tag-link">
              <Chip tone={tag.counted ? "brand" : "slate"} className="hover:opacity-80">
                {tag.name}
              </Chip>
            </Link>
          ) : (
            <Chip tone={tag.counted ? "brand" : "slate"}>{tag.name}</Chip>
          )}
          {tag.subjectDisagreed && (
            <span className="text-[11px] text-amber-600 dark:text-amber-500">you disagreed</span>
          )}
        </div>

        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          {onlySelfDeclared(tag) ? (
            "Only you say this"
          ) : vouchers.length ? (
            <>
              <NameList
                pubkeys={vouchers}
                profiles={profiles}
                className="font-semibold text-slate-600 hover:text-brand-primary dark:text-slate-300"
              />{" "}
              {vouchers.length === 1 ? "says" : "say"} this
            </>
          ) : others === 1 ? (
            "1 person says this"
          ) : (
            `${others} people say this`
          )}
        </p>
        {tag.description && (
          <p className="mt-0.5 line-clamp-2 text-xs text-slate-400 dark:text-slate-500">
            {tag.description}
          </p>
        )}
      </div>

      {canAct && (
        <button
          type="button"
          onClick={() => setStance(agreed ? -1 : 1)}
          disabled={busy}
          className="mt-0.5 shrink-0 rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition-colors hover:border-brand-primary hover:text-brand-primary disabled:opacity-50 dark:border-slate-700 dark:text-slate-300"
          data-testid="my-tag-stance"
        >
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : agreed ? "Disagree" : "Agree"}
        </button>
      )}
    </div>
  );
}

/**
 * One thing you said about somebody — their face, their name, the tag, when.
 *
 * The tag chip links to the tag's page and the person links to their profile:
 * two different questions ("who else is this?" / "who is this?"), and before
 * this the row answered neither.
 */
function SaidRow({
  said,
  profiles,
}: {
  said: MyAssertion;
  profiles?: Map<string, FaceProfile>;
}) {
  const isPerson = said.targetKind === "pubkey";
  const name = isPerson ? displayName(said.target, profiles) : "a post";
  const targetHref = isPerson ? profilePath(said.target) : `/e/${said.target}`;
  const picture = isPerson ? profiles?.get(said.target)?.picture : undefined;

  let authorNpub = "";
  try {
    authorNpub = npubFromPubkey(said.authorPubkey);
  } catch {
    /* unlinkable */
  }

  const chip = (
    <Chip tone={said.stance === "apply" ? "brand" : "amber"} size="sm">
      {said.name}
    </Chip>
  );

  return (
    <div className="flex items-center gap-3 px-4 py-3" data-testid="my-tag-said-row">
      {isPerson ? (
        <Avatar className="h-8 w-8 shrink-0">
          {picture ? <AvatarImage src={picture} alt={name} className="object-cover" /> : null}
          <AvatarFallback className="overflow-hidden">
            <DefaultAvatarImg />
          </AvatarFallback>
        </Avatar>
      ) : (
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-800">
          <TagIcon className="h-3.5 w-3.5" />
        </span>
      )}

      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        {authorNpub ? (
          <Link href={`/tags/${authorNpub}/${said.slug}`} className="hover:opacity-80" data-testid="my-tag-said-link">
            {chip}
          </Link>
        ) : (
          chip
        )}
        <span className="text-slate-400 dark:text-slate-500">
          {said.stance === "apply" ? "on" : "disagreed on"}
        </span>
        {targetHref ? (
          <Link
            href={targetHref}
            className="min-w-0 truncate font-semibold text-slate-700 hover:text-brand-primary dark:text-slate-200"
            data-testid="my-tag-said-target"
          >
            {name}
          </Link>
        ) : (
          <span className="min-w-0 truncate font-semibold text-slate-700 dark:text-slate-200">
            {name}
          </span>
        )}
      </div>

      <span className="shrink-0 text-[11px] tabular-nums text-slate-400 dark:text-slate-500">
        {relativeTime(said.at)}
      </span>
    </div>
  );
}

function PinnedRow({ pin }: { pin: { key: string; name: string; authorPubkey: string; slug: string; pinEventId: string } }) {
  const toggle = useTogglePin();
  const { toast } = useToast();
  let authorNpub = "";
  try {
    authorNpub = npubFromPubkey(pin.authorPubkey);
  } catch {
    /* unlinkable */
  }

  return (
    <div className="flex items-center gap-3 px-4 py-3" data-testid="my-pinned-row">
      {authorNpub ? (
        <Link href={`/tags/${authorNpub}/${pin.slug}`} className="min-w-0 flex-1">
          <Chip tone="brand" className="hover:opacity-80">{pin.name}</Chip>
        </Link>
      ) : (
        <span className="min-w-0 flex-1"><Chip tone="brand">{pin.name}</Chip></span>
      )}
      <button
        type="button"
        onClick={async () => {
          try {
            await toggle.mutateAsync({ pinEventId: pin.pinEventId });
            toast({ title: `Removed "${pin.name}"` });
          } catch {
            toast({ title: "Couldn't remove that", variant: "destructive" });
          }
        }}
        disabled={toggle.isPending}
        aria-label={`Remove ${pin.name}`}
        className="shrink-0 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50 dark:hover:bg-slate-800"
        data-testid="my-pinned-remove"
      >
        <PinOff className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function SectionLabel({
  children,
  count,
  hint,
}: {
  children: React.ReactNode;
  count?: number;
  /** One line saying what the section is for — the two are easy to confuse. */
  hint?: string;
}) {
  return (
    <div className="mb-3">
      <div className="flex items-baseline gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
        <span>{children}</span>
        {count !== undefined && count > 0 && (
          <span className="tabular-nums text-slate-300 dark:text-slate-600">{count}</span>
        )}
      </div>
      {hint && <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">{hint}</p>}
    </div>
  );
}

function Loading() {
  return (
    <Card className="space-y-3 p-4">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="h-6 animate-pulse rounded-full bg-slate-100 dark:bg-slate-800" />
      ))}
    </Card>
  );
}

/** Coarse "how long ago" — precision past a day isn't worth a date library. */
function relativeTime(unixSeconds: number): string {
  const secs = Math.max(0, Math.floor(Date.now() / 1000) - unixSeconds);
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(unixSeconds * 1000).toLocaleDateString();
}
