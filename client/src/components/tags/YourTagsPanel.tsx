import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Loader2, PinOff, Tag as TagIcon } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DefaultAvatarImg } from "@/components/share/DefaultAvatarImg";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { FacePile, NameList, displayName, profilePath } from "@/components/tags/FacePile";
import { TagsCrossLink } from "@/components/tags/TagsCrossLink";
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

/** Tag groups shown before "Show all". Groups, not claims — see `groups`. */
const SAID_PREVIEW = 8;

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
  const [stance, setStance] = useState<Stance>("all");

  const applyCount = useMemo(() => said.filter((a) => a.stance === "apply").length, [said]);
  const disputeCount = said.length - applyCount;

  /**
   * Everything you've said, collapsed to one row per TAG.
   *
   * Newest group first, and newest claim first inside a group, because the
   * thing you most likely want is what you just did.
   */
  const groups = useMemo<SaidGroupData[]>(() => {
    const filtered = stance === "all" ? said : said.filter((a) => a.stance === stance);
    const byTag = new Map<string, SaidGroupData>();
    for (const a of filtered) {
      let g = byTag.get(a.key);
      if (!g) {
        g = {
          key: a.key,
          name: a.name,
          authorPubkey: a.authorPubkey,
          slug: a.slug,
          items: [],
          applies: 0,
          disputes: 0,
          latestAt: 0,
        };
        byTag.set(a.key, g);
      }
      g.items.push(a);
      if (a.stance === "apply") g.applies++;
      else g.disputes++;
      if (a.at > g.latestAt) g.latestAt = a.at;
    }
    const out = Array.from(byTag.values());
    for (const g of out) g.items.sort((x, y) => y.at - x.at);
    return out.sort((x, y) => y.latestAt - x.latestAt);
  }, [said, stance]);

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
            count={groups.length}
            hint="Public and signed by you. These are your claims about other people."
          >
            What you've said
          </SectionLabel>

          {/* One row per PERSON was the obvious build and the wrong one: tagging
              is repetitive by nature, so a session of labelling a dozen
              musicians produced a dozen identical chips down the page. Grouped
              by tag, that's one row. Someone with a thousand claims has as many
              rows as they have distinct tags, which is a number a human chose. */}
          {said.length > 0 && (
            <div className="mb-3 flex flex-wrap items-center gap-1" data-testid="my-tags-said-filters">
              <StanceTab active={stance === "all"} onClick={() => setStance("all")} testId="filter-all">
                All
              </StanceTab>
              <StanceTab active={stance === "apply"} onClick={() => setStance("apply")} testId="filter-added">
                Added {applyCount > 0 && <Count>{applyCount}</Count>}
              </StanceTab>
              <StanceTab
                active={stance === "dispute"}
                onClick={() => setStance("dispute")}
                testId="filter-disagreed"
              >
                Disagreed {disputeCount > 0 && <Count>{disputeCount}</Count>}
              </StanceTab>
            </div>
          )}

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
          ) : groups.length === 0 ? (
            <Card className="p-6">
              <EmptyState
                icon={TagIcon}
                compact
                title={stance === "dispute" ? "You haven't disagreed with anything" : "Nothing here yet"}
                description="Switch back to All to see everything you've said."
              />
            </Card>
          ) : (
            <Card className="divide-y divide-slate-100 dark:divide-slate-800/60 overflow-hidden">
              {groups.slice(0, saidShown).map((g) => (
                <SaidGroup key={g.key} group={g} profiles={profiles} />
              ))}
              {groups.length > saidShown && (
                <button
                  type="button"
                  onClick={() => setSaidShown(groups.length)}
                  className="w-full px-4 py-3 text-xs font-semibold text-brand-link transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50"
                  data-testid="my-tags-said-more"
                >
                  Show all {groups.length} tags
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

        {/* The catalogue's home in the app.

            It used to sit under the search box on the landing page, which was
            the wrong place: that screen asks you to do exactly one thing, and
            a static second CTA competed with it. Tags already reach search
            through the field itself — type two letters and matching tags come
            back above the people — so the standing link belongs here, where
            somebody is already thinking about tags.

            A labelled row, not the pill switcher this replaced: a toggle only
            reads as a toggle once you know what's on the other side. */}
        <div className="mt-8 space-y-4 border-t border-slate-100 pt-6 dark:border-slate-800/60">
          <TagsCrossLink
            href="/tags"
            title="Browse tags"
            description="What people are known for, across the network"
            testId="your-tags-browse"
          />

          {myNpub && (
            <p className="text-center text-xs">
              <Link
                href={`/p/${myNpub}`}
                className="font-semibold text-brand-link hover:underline"
                data-testid="your-tags-profile"
              >
                See your public profile →
              </Link>
            </p>
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

type Stance = "all" | "apply" | "dispute";

interface SaidGroupData {
  key: string;
  name: string;
  authorPubkey: string;
  slug: string;
  items: MyAssertion[];
  applies: number;
  disputes: number;
  latestAt: number;
}

/** Rough cap on rows revealed inside one expanded group before "Show all". */
const GROUP_PREVIEW = 10;

/**
 * One tag you've used, and everyone you used it on.
 *
 * Collapsed it reads as a sentence: the faces, the tag, how many people. Open
 * it and you get the individual claims, each still linked to that person.
 *
 * The chip stays out of the expanded rows. Inside a group headed "Musician",
 * repeating "Musician" on all twelve rows is the exact noise this grouping
 * exists to remove.
 */
function SaidGroup({
  group,
  profiles,
}: {
  group: SaidGroupData;
  profiles?: Map<string, FaceProfile>;
}) {
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState(GROUP_PREVIEW);

  let authorNpub = "";
  try {
    authorNpub = npubFromPubkey(group.authorPubkey);
  } catch {
    /* unlinkable */
  }

  // Faces of the people, not of the tag. Disputes go in the count line rather
  // than the pile — a face here reads as "I said this about them".
  const applied = group.items.filter((a) => a.stance === "apply" && a.targetKind === "pubkey");
  const parts = [
    group.applies > 0 ? `${group.applies} ${group.applies === 1 ? "person" : "people"}` : "",
    group.disputes > 0 ? `${group.disputes} you disagreed with` : "",
  ].filter(Boolean);

  return (
    <div data-testid="my-tag-said-group">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/40"
        data-testid="my-tag-said-group-toggle"
      >
        <FacePile pubkeys={applied.map((a) => a.target)} profiles={profiles} size="sm" />

        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
          <Chip tone={group.applies > 0 ? "brand" : "amber"} size="sm">
            {group.name}
          </Chip>
          <span className="text-xs text-slate-500 dark:text-slate-400">{parts.join(" · ")}</span>
        </span>

        <span className="shrink-0 text-[11px] tabular-nums text-slate-400 dark:text-slate-500">
          {relativeTime(group.latestAt)}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-slate-300 transition-transform dark:text-slate-600 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="border-t border-slate-100 bg-slate-50/60 dark:border-slate-800/60 dark:bg-slate-900/40">
          {authorNpub && (
            <Link
              href={`/tags/${authorNpub}/${group.slug}`}
              className="block px-4 pt-3 text-xs font-semibold text-brand-link hover:underline"
              data-testid="my-tag-said-link"
            >
              Open the {group.name} tag →
            </Link>
          )}
          <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
            {group.items.slice(0, shown).map((a) => (
              <SaidRow key={`${a.key}-${a.target}`} said={a} profiles={profiles} showTag={false} />
            ))}
          </div>
          {group.items.length > shown && (
            <button
              type="button"
              onClick={() => setShown(group.items.length)}
              className="w-full px-4 py-2.5 text-xs font-semibold text-brand-link transition-colors hover:bg-slate-100 dark:hover:bg-slate-800/60"
              data-testid="my-tag-said-group-more"
            >
              Show all {group.items.length}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * One thing you said about somebody — their face, their name, when.
 *
 * The person links to their profile. `showTag` adds the tag chip, linked to
 * the tag's page; it's off inside a group, where the heading already said it.
 */
function SaidRow({
  said,
  profiles,
  showTag = true,
}: {
  said: MyAssertion;
  profiles?: Map<string, FaceProfile>;
  showTag?: boolean;
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
        {showTag &&
          (authorNpub ? (
            <Link href={`/tags/${authorNpub}/${said.slug}`} className="hover:opacity-80" data-testid="my-tag-said-link">
              {chip}
            </Link>
          ) : (
            chip
          ))}
        <span className="text-slate-400 dark:text-slate-500">
          {said.stance === "apply" ? (showTag ? "on" : "") : "disagreed on"}
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

/** Pill filter for the stance split. Same shape as the tag page's sort pills. */
function StanceTab({
  children,
  active,
  onClick,
  testId,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
  testId: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
        active
          ? "bg-brand-primary text-white"
          : "text-slate-500 hover:text-brand-primary dark:text-slate-400"
      }`}
      data-testid={testId}
    >
      {children}
    </button>
  );
}

function Count({ children }: { children: React.ReactNode }) {
  return <span className="tabular-nums opacity-60">{children}</span>;
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
