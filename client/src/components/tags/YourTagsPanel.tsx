import { memo, useCallback, useMemo, useState } from "react";
import { Link } from "wouter";
import { useLiveProfiles } from "@/hooks/useLiveProfile";
import { Box, ChevronDown, ChevronRight, PinOff, Tag as TagIcon, type LucideIcon } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DefaultAvatarImg } from "@/components/share/DefaultAvatarImg";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { ToggleChip } from "@/components/ui/toggle-chip";
import { FacePile, NameList, displayName, profilePath } from "@/components/tags/FacePile";
import { TagsCrossLink } from "@/components/tags/TagsCrossLink";
import { UnscoredReachNotice } from "@/components/tags/UnscoredReachNotice";
import { StanceButtons } from "@/components/share/StanceControl";
import { useToast } from "@/hooks/use-toast";
import { signingProblem } from "@/accounts/signing";
import { useApplyTag, useMyAssertions, usePinnedTags, useProfileTags, useTogglePin } from "@/hooks/useTags";
import { TAG_PINS_ENABLED } from "@/config/tagging";
import { npubFromPubkey } from "@/lib/shareId";
import { relativeTime } from "@/lib/relativeTime";
import { corroborations, onlySelfDeclared } from "@/lib/tagCounts";
import type { FaceProfile } from "@/components/tags/FacePile";
import type { MyAssertion, ProfileTag } from "@/services/tags";
import { useActiveAccountDisplay } from "@/hooks/useActiveAccountDisplay";
import { nip19 } from "nostr-tools";
import { useTaggedItems } from "@/hooks/useTaggedItems";
import { coordinateOf } from "@/lib/tagTarget";
import { eventPath } from "@/lib/shareId";
import {
  UNKNOWN_ITEM,
  taggableDetail,
  taggableImage,
  taggableTitle,
  taggableType,
  type TaggableType,
} from "@/lib/taggable";
import { isReady, useItemView } from "@/hooks/useItemView";
import { ContentSectionHeading, SECTION_ICON } from "@/components/tags/ContentSection";
import type { ItemPresentation } from "@/lib/itemPresentation";
import type { KindEvent } from "@/lib/kindLabel";
import { proxiedSrc } from "@/lib/imageProxy";
import { asyncHandler } from "@/lib/asyncHandler";

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
  const currentUser = useActiveAccountDisplay();
  const viewerPubkey = currentUser?.pubkey;
  // An Account *is* a Signer under the accounts model — local key, extension,
  // bunker or Amber — so holding one is the whole test. Upstream asked
  // `hasLocalSecretKey() || window.nostr`, which quietly excluded every remote
  // signer; this includes them.
  const canAct = !!viewerPubkey;

  const { data: onMe, isLoading: loadingMine } = useProfileTags(viewerPubkey);
  const { data: mySaid, isLoading: loadingSaid } = useMyAssertions();
  const { data: pinned } = usePinnedTags(TAG_PINS_ENABLED);

  let myNpub = "";
  try {
    myNpub = viewerPubkey ? npubFromPubkey(viewerPubkey) : "";
  } catch {
    /* unlinkable */
  }

  const tagsOnMe = useMemo(() => onMe?.tags ?? [], [onMe]);
  const said = useMemo(() => mySaid ?? [], [mySaid]);
  const [stance, setStance] = useState<Stance>("all");

  const applyCount = useMemo(() => said.filter((a) => a.stance === "apply").length, [said]);
  const disputeCount = said.length - applyCount;

  // What each tagging of a thing points at, read so the page can say what it is.
  const contentTargets = useMemo(() => said.filter((a) => a.targetKind === "event").map((a) => a.target), [said]);
  const items = useTaggedItems(contentTargets);
  /**
   * What a tagged thing is: read off the thing when we have it; off its
   * coordinate (which carries its kind) when we don't; an item otherwise, since
   * an id alone says nothing.
   */

  const filtered = useMemo(() => (stance === "all" ? said : said.filter((a) => a.stance === stance)), [said, stance]);

  /**
   * The people you've tagged, collapsed to one row per TAG.
   *
   * Newest group first, and newest claim first inside a group, because the
   * thing you most likely want is what you just did.
   */
  const peopleGroups = useMemo(() => groupByTag(filtered.filter((a) => a.targetKind === "pubkey")), [filtered]);

  /**
   * The content you've tagged, one section per KIND of thing in use (Posts,
   * Issues, Repos, a Dictionary list's Books), each collapsed to one row per
   * tag. A section exists only while something is in it; the newest first.
   */
  const contentSaid = useMemo(() => filtered.filter((a) => a.targetKind === "event"), [filtered]);
  const contentSections = useMemo(() => (items.loading ? [] : sectionsOf(contentSaid, items)), [contentSaid, items]);

  /**
   * A tagged thing's row: what it is called, what it is and the most worth
   * saying about it, its picture, and where it opens. A Dictionary list's item
   * is read as its own page reads it (`shown`, hooks/useItemView): its title,
   * its picture or its list's mark, the line under its title. `named` is read
   * when the row is drawn, so a name arrives when the profile does.
   */
  const describeItem = useCallback(
    (type: TaggableType, named?: Map<string, FaceProfile>): Describe =>
      (a, shown) => {
        const event = items.eventOf(a.target);
        const at = coordinateOf(a.target);
        let href = `/e/${a.target}`;
        if (event) href = eventPath(event);
        else if (at) {
          try {
            href = `/e/${nip19.naddrEncode(at)}`;
          } catch {
            /* an unlinkable coordinate keeps the plain path */
          }
        }
        // What it is, in its own word ("App handler" in a section headed Apps).
        const itsType = event ? taggableType(event, items.listOf(a.target)) : type;
        const name = shown?.title || (event && taggableTitle(event)) || `Untitled ${itsType.noun}`;
        const author = event ? named?.get(event.pubkey) : undefined;
        // Whose it is, once we know their name (a row of hex says nothing), and not when it is
        // the thing's own name over again: an app published under its own account.
        const by = [author?.display_name, author?.name].find((n) => n && n.trim().toLowerCase() !== name.toLowerCase());
        // The most worth saying: what its page says under the title, or when an event is. A
        // list's item says that or nothing: whoever listed it is not whose it is.
        const detail = shown
          ? shown.summary || shown.facts[0]?.value
          : event
            ? (taggableDetail(event) ?? by)
            : undefined;
        const image = shown?.image || (event ? taggableImage(event) : null) || shown?.listImage || null;
        return {
          name,
          href,
          about: [itsType.label, detail].filter(Boolean).join(" · "),
          image,
          // A post with no picture is known by who wrote it.
          author: !image && event && type.key === POSTS ? { picture: author?.picture } : null,
          icon: SECTION_ICON[type.key] ?? Box,
        };
      },
    [items],
  );

  const authorKey = [...new Set(contentTargets.flatMap((target) => items.eventOf(target)?.pubkey ?? []))]
    .sort()
    .join(",");

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
    // And whoever published each thing you tagged: its row says whose it is.
    for (const pk of authorKey ? authorKey.split(",") : []) set.add(pk);
    return Array.from(set);
  }, [tagsOnMe, said, viewerPubkey, authorKey]);

  const profileMap = useLiveProfiles(people);
  const profiles = profileMap;
  // Made once per section and per profiles read, so the cards below skip a render that changes neither.
  const describeSection = useMemo(
    () => new Map(contentSections.map(({ type }) => [type.key, describeItem(type, profiles)])),
    [contentSections, describeItem, profiles],
  );
  const describePeople = useMemo(() => describePerson(profiles), [profiles]);
  const itemEventOf = useCallback<EventOf>((a) => items.eventOf(a.target), [items]);

  return (
    <div className="space-y-6" data-testid="your-tags-panel">
      {/* Leads with what you CAN do.
            The first version opened "You can't erase a tag someone else gave
            you — nobody can, on Nostr", which greeted people with a
            restriction and a protocol lecture in one breath. Nobody arriving
            here needs to know what it rides on; they need to know what to do
            about a label they don't like.
            Two things it must not overpromise, both learned by reading
            `netPositive` rather than the old copy:
            1. One disagreement does NOT necessarily stop a tag counting. The
               rule is applies MINUS disputes > 0, so against three vouchers
               your single no leaves it at 2 and still counting. "Disagree and
               it stops counting" was simply false for any popular tag.
            2. Disagreeing doesn't make it vanish either. It keeps rendering,
               marked. A page implying otherwise surprises people the moment
               they press the button.
            3. Added with #41 B2: your vote can't be taken back. The protocol
               stores one assertion per (tag, target, asserter) and there is no
               polarity 0 and no deletion — you can change your mind, but not
               erase having spoken. The buttons no longer imply otherwise, and
               neither should the paragraph above them. */}
      {/* Advice about tags that exist: on a page with none it was a paragraph
            about votes and take-backs before there was anything to vote on. */}
      {(tagsOnMe.length > 0 || said.length > 0) && (
        <p className="mt-4 text-sm text-slate-500 dark:text-slate-400" data-testid="my-tags-no-delete">
          See a tag that's wrong? Disagree with it. Once more people disagree than agree, the tag stops counting.
          Nothing gets deleted: the tag stays on the page, marked as disagreed. Your vote is public, and you can change
          it later but not take it back.
        </p>
      )}

      {/* ── 1. Tags on me ─────────────────────────────────────────────── */}
      <section className="mt-8" data-testid="my-tags-on-me">
        <SectionLabel count={tagsOnMe.length} hint="What other people say you're known for.">
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
          <Card className="divide-y divide-slate-100 overflow-hidden dark:divide-slate-800/60">
            {tagsOnMe.map((tag) => (
              <TagOnMeRow key={tag.key} tag={tag} canAct={canAct} viewerPubkey={viewerPubkey!} profiles={profiles} />
            ))}
          </Card>
        )}
      </section>

      {/* ── 2. Tags I've applied ──────────────────────────────────────── */}
      {/* People and content are two different things to have said something about: a tag on
          a person says who they are, a tag on a post, an issue or a repo says what it is
          about. They shared one list once, where a tagged video read "1 person" and opened to
          "a post". Each has its own block, and each kind of content its own section. */}
      <section className="mt-8" data-testid="my-tags-said">
        {/* Only where it's actionable: above your own claims, and only once
              you have some. On the "About you" section above it would be
              answering a question nobody asked — those are other people's tags,
              and their reach has nothing to do with your score. */}
        {onMe?.viewerUnscored && said.length > 0 && <UnscoredReachNotice className="mb-3" />}

        {said.length > 0 && (
          <SectionLabel hint="Tags you've put on people and on content. Anyone can see them, with your name on them.">
            What you've said
          </SectionLabel>
        )}

        {/* One filter for everything you've said, people and content alike. */}
        {said.length > 0 && (
          <div className="mb-5 flex flex-wrap items-center gap-1" data-testid="my-tags-said-filters">
            <StanceTab active={stance === "all"} onClick={() => setStance("all")} testId="filter-all">
              All
            </StanceTab>
            <StanceTab active={stance === "apply"} onClick={() => setStance("apply")} testId="filter-added">
              Added {applyCount > 0 && <Count>{applyCount}</Count>}
            </StanceTab>
            <StanceTab active={stance === "dispute"} onClick={() => setStance("dispute")} testId="filter-disagreed">
              Disagreed {disputeCount > 0 && <Count>{disputeCount}</Count>}
            </StanceTab>
          </div>
        )}

        {loadingSaid ? (
          <Loading />
        ) : said.length === 0 ? (
          <>
            <SectionLabel hint="Tags you've put on people and on content. Anyone can see them, with your name on them.">
              What you've said
            </SectionLabel>
            <Card className="p-6">
              <EmptyState
                icon={TagIcon}
                compact
                title="You haven't tagged anything yet"
                description="Open a profile and choose “Tag this profile”, or open a post, an article or a repo and tag it. It will show up here."
              />
            </Card>
          </>
        ) : filtered.length === 0 ? (
          <Card className="p-6">
            <EmptyState
              icon={TagIcon}
              compact
              title={stance === "dispute" ? "You haven't disagreed with anything" : "Nothing here yet"}
              description="Switch back to All to see everything you've said."
            />
          </Card>
        ) : (
          <div className="space-y-8">
            {/* One row per PERSON was the obvious build and the wrong one: tagging
                  is repetitive by nature, so a session of labelling a dozen
                  musicians produced a dozen identical chips down the page. Grouped
                  by tag, that's one row. Someone with a thousand claims has as many
                  rows as they have distinct tags, which is a number a human chose. */}
            {peopleGroups.length > 0 && (
              <div data-testid="my-tags-said-people">
                <SectionLabel count={peopleGroups.length}>People you've tagged</SectionLabel>
                <SaidCard groups={peopleGroups} profiles={profiles} counted={PEOPLE} describe={describePeople} />
              </div>
            )}

            {contentSaid.length > 0 && (
              <div data-testid="my-tags-said-content">
                <SectionLabel>Content you've tagged</SectionLabel>
                {items.loading ? (
                  <div data-testid="my-tags-said-content-loading">
                    <Loading />
                  </div>
                ) : (
                  <div className="space-y-5">
                    {contentSections.map(({ type, groups }) => (
                      <div key={type.key} data-testid="my-tags-said-type">
                        <ContentSectionHeading
                          type={type}
                          count={groups.length}
                          event={items.eventOf(groups[0]?.items[0]?.target ?? "")}
                          testId="my-tags-said-type"
                        />
                        <SaidCard
                          groups={groups}
                          profiles={profiles}
                          counted={type.counted}
                          describe={describeSection.get(type.key)!}
                          eventOf={itemEventOf}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
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
            <Card className="divide-y divide-slate-100 overflow-hidden dark:divide-slate-800/60">
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
            : "Your vote is public. Once disagreements outnumber agreements, the tag stops counting.",
      });
    } catch (error) {
      const description = signingProblem(error, "Check your connection and try again.");
      if (description) toast({ title: "Couldn't save that", description, variant: "destructive" });
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
          <p className="mt-0.5 line-clamp-2 text-xs text-slate-400 dark:text-slate-500">{tag.description}</p>
        )}
      </div>

      {/* Both stances, always reachable (#41 B2). This row is the whole reason
          /tags/mine exists — it's where you answer a label someone applied to
          you — and until now the only button on it said "Agree". */}
      {canAct && (
        <div className="mt-0.5">
          <StanceButtons
            stance={tag.myStance}
            pending={busy}
            onVote={(polarity) => void setStance(polarity)}
            testId="my-tag-stance"
          />
        </div>
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

/** One kind of content you've tagged, and the tags you put on it. */
interface ContentSection {
  type: TaggableType;
  groups: SaidGroupData[];
  latestAt: number;
}

/** How a group counts what it holds: "1 person", "2 issues". */
interface Counted {
  one: string;
  many: string;
}
const PEOPLE: Counted = { one: "person", many: "people" };

/** What one claim's row shows of its target, and where the row opens. */
interface Described {
  name: string;
  href: string;
  /** Under the name: what the thing is, and the most worth saying about it ("Article · Sam"). */
  about?: string;
  /** The thing's own picture, or its list's mark. */
  image?: string | null;
  /** Who wrote it, shown by their face where the thing has no picture of its own: a post. */
  author?: { picture?: string } | null;
  /** What stands for the thing when it has neither: its section's mark. */
  icon?: LucideIcon;
}
/** `shown`: how a Dictionary list's item reads (hooks/useItemView); null for anything else. */
type Describe = (said: MyAssertion, shown: ItemPresentation | null) => Described;
/** The thing a claim is about, when it is content and has been read. */
type EventOf = (said: MyAssertion) => KindEvent | undefined;

type TaggedItems = ReturnType<typeof useTaggedItems>;

/** Stands in for a thing that isn't a list's item, so a row asks for one view whatever it shows. */
const NO_ITEM = { kind: 0, tags: [] as string[][] };
const POSTS = "filter:notes";

const describePerson =
  (profiles?: Map<string, FaceProfile>): Describe =>
  (said) => ({ name: displayName(said.target, profiles), href: profilePath(said.target) });

/** Claims collapsed to one group per tag: newest group first, newest claim first inside it. */
function groupByTag(said: MyAssertion[]): SaidGroupData[] {
  const byTag = new Map<string, SaidGroupData>();
  for (const a of said) {
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
}

/**
 * What a tagged thing is: read off the thing when we have it; off its
 * coordinate (which carries its kind) when we don't; an item otherwise, since
 * an id alone says nothing.
 */
function typeOf(target: string, items: TaggedItems): TaggableType {
  const event = items.eventOf(target);
  if (event) return taggableType(event, items.listOf(target));
  const at = coordinateOf(target);
  if (!at) return UNKNOWN_ITEM;
  return taggableType({
    kind: at.kind,
    pubkey: at.pubkey,
    tags: [["d", at.identifier]],
    id: "",
    content: "",
    created_at: 0,
  });
}

/** Tagged content, one section per kind of thing in use, each grouped by tag; the newest first. */
function sectionsOf(said: MyAssertion[], items: TaggedItems): ContentSection[] {
  const byType = new Map<string, { type: TaggableType; said: MyAssertion[] }>();
  for (const a of said) {
    const type = typeOf(a.target, items);
    const held = byType.get(type.key) ?? { type, said: [] };
    held.said.push(a);
    byType.set(type.key, held);
  }
  const sections: ContentSection[] = [];
  for (const { type, said: inType } of byType.values()) {
    const groups = groupByTag(inType);
    sections.push({ type, groups, latestAt: Math.max(...groups.map((g) => g.latestAt)) });
  }
  return sections.sort((x, y) => y.latestAt - x.latestAt);
}

/** A card of tag groups, the first few shown until asked for the rest. Memoized: its props are. */
const SaidCard = memo(function SaidCard({
  groups,
  profiles,
  counted,
  describe,
  eventOf,
}: {
  groups: SaidGroupData[];
  profiles?: Map<string, FaceProfile>;
  counted: Counted;
  describe: Describe;
  eventOf?: EventOf;
}) {
  const [shown, setShown] = useState(SAID_PREVIEW);
  return (
    <Card className="divide-y divide-slate-100 overflow-hidden dark:divide-slate-800/60">
      {groups.slice(0, shown).map((g) => (
        <SaidGroup key={g.key} group={g} profiles={profiles} counted={counted} describe={describe} eventOf={eventOf} />
      ))}
      {groups.length > shown && (
        <button
          type="button"
          onClick={() => setShown(groups.length)}
          className="w-full px-4 py-3 text-xs font-semibold text-brand-link transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50"
          data-testid="my-tags-said-more"
        >
          Show all {groups.length} tags
        </button>
      )}
    </Card>
  );
});

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
  counted,
  describe,
  eventOf,
}: {
  group: SaidGroupData;
  profiles?: Map<string, FaceProfile>;
  counted: Counted;
  describe: Describe;
  eventOf?: EventOf;
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
    group.applies > 0 ? `${group.applies} ${group.applies === 1 ? counted.one : counted.many}` : "",
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
        {eventOf ? (
          // Content leads with what it is, as people lead with who they are.
          <span className="flex shrink-0 -space-x-2" data-testid="my-tag-said-group-thumbs">
            {group.items.slice(0, PILE).map((a, i) => (
              <PileThumb key={`${a.key}-${a.target}`} said={a} describe={describe} eventOf={eventOf} first={i === 0} />
            ))}
          </span>
        ) : (
          <FacePile pubkeys={applied.map((a) => a.target)} profiles={profiles} size="sm" />
        )}

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
        <div className="border-t border-slate-100 bg-slate-50/70 dark:border-slate-800/60 dark:bg-slate-900/40">
          <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
            {group.items.slice(0, shown).map((a) => (
              <SaidRow
                key={`${a.key}-${a.target}`}
                said={a}
                profiles={profiles}
                describe={describe}
                eventOf={eventOf}
              />
            ))}
          </div>
          {/* What closes the list: the rest of it, then the way to the tag itself. */}
          {(group.items.length > shown || authorNpub) && (
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-slate-100 px-4 py-2.5 text-xs font-semibold dark:border-slate-800/60">
              {group.items.length > shown ? (
                <button
                  type="button"
                  onClick={() => setShown(group.items.length)}
                  className="text-brand-link hover:underline"
                  data-testid="my-tag-said-group-more"
                >
                  Show all {group.items.length}
                </button>
              ) : (
                <span />
              )}
              {authorNpub && (
                <Link
                  href={`/tags/${authorNpub}/${group.slug}`}
                  className="text-brand-link hover:underline"
                  data-testid="my-tag-said-link"
                >
                  Open the {group.name} tag →
                </Link>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** How many of a closed group's things stand at its head. */
const PILE = 3;

/**
 * One of the things at the head of a closed content group: its picture, drawn
 * as its row draws it (hooks/useItemView for a list's item). A thing with no
 * picture shows nothing, except the first, which shows its section's mark so
 * the group never leads with a gap.
 */
function PileThumb({
  said,
  describe,
  eventOf,
  first,
}: {
  said: MyAssertion;
  describe: Describe;
  eventOf: EventOf;
  first: boolean;
}) {
  const view = useItemView(eventOf(said) ?? NO_ITEM);
  const { image, icon: Icon = Box } = describe(said, isReady(view) ? view.shown : null);
  const [broken, setBroken] = useState<string | null>(null);
  const box = "h-7 w-7 shrink-0 rounded-md ring-2 ring-white dark:ring-slate-900";
  if (image && broken !== image) {
    return (
      <img
        src={proxiedSrc(image, "media_320")}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setBroken(image)}
        className={`${box} bg-slate-100 object-cover dark:bg-slate-800`}
      />
    );
  }
  if (!first) return null;
  return (
    <span
      className={`${box} flex items-center justify-center bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400`}
      data-testid="my-tag-said-group-mark"
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
    </span>
  );
}

/**
 * One thing you tagged: its face or its picture, its name, what it is, when.
 *
 * The whole row opens it. A person shows their face; a thing shows its own
 * picture, or its section's mark when it has none, in a square so the two are
 * never mistaken for each other. The tag isn't repeated: the group's heading
 * said it.
 */
function SaidRow({
  said,
  profiles,
  describe,
  eventOf,
}: {
  said: MyAssertion;
  profiles?: Map<string, FaceProfile>;
  describe: Describe;
  eventOf?: EventOf;
}) {
  const isPerson = said.targetKind === "pubkey";
  // A Dictionary list's item is drawn from what its own page is drawn from; the query is
  // batched and shared with the page, and asks nothing for a thing that is not an item.
  const view = useItemView(eventOf?.(said) ?? NO_ITEM);
  const { name, href, about, image, author, icon: Icon = Box } = describe(said, isReady(view) ? view.shown : null);
  const picture = isPerson ? profiles?.get(said.target)?.picture : undefined;
  const [broken, setBroken] = useState<string | null>(null);
  const title = "min-w-0 truncate text-sm font-semibold text-slate-800 dark:text-slate-100";

  return (
    <div
      className="group relative flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-white dark:hover:bg-slate-800/50"
      data-testid="my-tag-said-row"
    >
      {isPerson ? (
        <Avatar className="h-9 w-9 shrink-0">
          {picture ? <AvatarImage src={picture} alt="" className="object-cover" /> : null}
          <AvatarFallback className="overflow-hidden">
            <DefaultAvatarImg />
          </AvatarFallback>
        </Avatar>
      ) : image && broken !== image ? (
        <img
          src={proxiedSrc(image, "media_320")}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setBroken(image)}
          className="h-9 w-9 shrink-0 rounded-lg bg-slate-100 object-cover ring-1 ring-slate-200/70 dark:bg-slate-800 dark:ring-slate-700"
          data-testid="my-tag-said-thumb"
        />
      ) : author ? (
        <Avatar className="h-9 w-9 shrink-0" data-testid="my-tag-said-author-face">
          {author.picture ? <AvatarImage src={author.picture} alt="" className="object-cover" /> : null}
          <AvatarFallback className="overflow-hidden">
            <DefaultAvatarImg />
          </AvatarFallback>
        </Avatar>
      ) : (
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-slate-500 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-700"
          data-testid="my-tag-said-icon"
        >
          <Icon className="h-4 w-4" aria-hidden />
        </span>
      )}

      <div className="min-w-0 flex-1">
        {href ? (
          // Stretched over the row, so the whole row is the link and the name is what it says.
          <Link
            href={href}
            className={`block ${title} after:absolute after:inset-0 group-hover:text-brand-primary`}
            data-testid="my-tag-said-target"
          >
            {name}
          </Link>
        ) : (
          <span className={`block ${title}`}>{name}</span>
        )}
        {about && (
          <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400" data-testid="my-tag-said-about">
            {about}
          </p>
        )}
      </div>

      {said.stance === "dispute" && (
        <Chip tone="amber" size="sm" data-testid="my-tag-said-disagreed">
          Disagreed
        </Chip>
      )}
      <span className="shrink-0 text-[11px] tabular-nums text-slate-400 dark:text-slate-500">
        {relativeTime(said.at)}
      </span>
      {href && (
        <ChevronRight
          className="h-4 w-4 shrink-0 text-slate-300 transition-colors group-hover:text-slate-400 dark:text-slate-600"
          aria-hidden
        />
      )}
    </div>
  );
}

function PinnedRow({
  pin,
}: {
  pin: { key: string; name: string; authorPubkey: string; slug: string; pinEventId: string };
}) {
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
          <Chip tone="brand" className="hover:opacity-80">
            {pin.name}
          </Chip>
        </Link>
      ) : (
        <span className="min-w-0 flex-1">
          <Chip tone="brand">{pin.name}</Chip>
        </span>
      )}
      <button
        type="button"
        onClick={asyncHandler(async () => {
          try {
            await toggle.mutateAsync({ pinEventId: pin.pinEventId });
            toast({ title: `Removed "${pin.name}"` });
          } catch {
            toast({ title: "Couldn't remove that", variant: "destructive" });
          }
        })}
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
    <ToggleChip
      variant="ghost"
      pressed={active}
      onClick={onClick}
      className="flex items-center gap-1.5"
      data-testid={testId}
    >
      {children}
    </ToggleChip>
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
