import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Loader2, PinOff, Tag as TagIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
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
import type { ProfileTag } from "@/services/tags";

/**
 * Everything tagging-related about you, as the Settings → Tags tab.
 *
 * Extracted from the old `/tags/mine` page so there is exactly one
 * implementation; that route now redirects here.
 *
 * The kit specifies no such surface — tags on you live in the profile chip row
 * and you manage them there. But nothing in that design answers "what have I
 * claimed about other people?", and those claims are public, permanent and
 * signed with your key. Rendering is the integrator's call
 * (`core/INTEGRATION.md` §5), so sections 1 and 2 are ordinary UI over machinery
 * the kit already sanctions. Section 3 (pins) is the declared deviation — see
 * `TAG_PINS_ENABLED`.
 */

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

  // Everyone named across "what I've said", resolved in one round-trip.
  const targets = useMemo(
    () => Array.from(new Set(said.filter((a) => a.targetKind === "pubkey").map((a) => a.target))),
    [said],
  );
  const profilesQuery = useQuery({
    queryKey: ["my-assertion-profiles", targets.join(",")],
    queryFn: () => fetchProfileMap(targets),
    enabled: targets.length > 0,
    staleTime: 5 * 60_000,
    retry: false,
  });
  const profiles = profilesQuery.data;

  return (
    <div className="space-y-6" data-testid="your-tags-panel">
        {/* Said once, near the top, in plain words. The protocol has no delete
            and a page called "manage" must not imply otherwise. */}
        <p className="mt-3 text-sm text-slate-500 dark:text-slate-400" data-testid="my-tags-no-delete">
          You can't erase a tag someone else gave you — nobody can, on Nostr. What
          you can do is disagree, and it stops counting.{" "}
          <Link href="/how-tags-work" className="font-semibold text-brand-link hover:underline" data-testid="my-tags-guide">
            How tags work →
          </Link>
        </p>

        {/* ── 1. Tags on me ─────────────────────────────────────────────── */}
        <section className="mt-8" data-testid="my-tags-on-me">
          <SectionLabel>About you</SectionLabel>
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
                <TagOnMeRow key={tag.key} tag={tag} canAct={canAct} viewerPubkey={viewerPubkey!} />
              ))}
            </Card>
          )}
        </section>

        {/* ── 2. Tags I've applied ──────────────────────────────────────── */}
        <section className="mt-8" data-testid="my-tags-said">
          <SectionLabel>What you've said</SectionLabel>
          {loadingSaid ? (
            <Loading />
          ) : said.length === 0 ? (
            <Card className="p-6">
              <EmptyState
                icon={TagIcon}
                compact
                title="You haven't tagged anyone yet"
                description="Tags you add to people or posts are listed here, so you can look back at them."
              />
            </Card>
          ) : (
            <Card className="divide-y divide-slate-100 dark:divide-slate-800/60 overflow-hidden">
              {said.map((a) => {
                const p = a.targetKind === "pubkey" ? profiles?.get(a.target) : undefined;
                const name = p?.display_name || p?.name;
                let npub = "";
                try {
                  npub = a.targetKind === "pubkey" ? npubFromPubkey(a.target) : "";
                } catch {
                  /* unlinkable */
                }
                const href =
                  a.targetKind === "pubkey" ? (npub ? `/p/${npub}` : null) : `/e/${a.target}`;
                const label =
                  a.targetKind === "pubkey"
                    ? name || `${a.target.slice(0, 8)}…`
                    : "a post";

                return (
                  <div
                    key={`${a.key}-${a.target}`}
                    className="flex flex-wrap items-center gap-x-2 gap-y-1 px-4 py-3 text-sm"
                    data-testid="my-tag-said-row"
                  >
                    <Chip tone={a.stance === "apply" ? "brand" : "amber"} size="sm">
                      {a.name}
                    </Chip>
                    <span className="text-slate-400 dark:text-slate-500">
                      {a.stance === "apply" ? "on" : "disagreed on"}
                    </span>
                    {href ? (
                      <Link
                        href={href}
                        className="font-medium text-slate-700 hover:text-brand-primary dark:text-slate-200"
                        data-testid="my-tag-said-target"
                      >
                        {label}
                      </Link>
                    ) : (
                      <span className="font-medium text-slate-700 dark:text-slate-200">{label}</span>
                    )}
                    <span className="ml-auto shrink-0 text-[11px] text-slate-400 dark:text-slate-500">
                      {relativeTime(a.at)}
                    </span>
                  </div>
                );
              })}
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

        {myNpub && (
          <p className="mt-8 text-center text-xs text-slate-400 dark:text-slate-500">
            <Link href={`/p/${myNpub}`} className="font-semibold text-brand-link hover:underline">
              See your public profile →
            </Link>
          </p>
        )}
    </div>
  );
}

/** One tag the network put on you, with the only two actions that exist. */

function TagOnMeRow({
  tag,
  canAct,
  viewerPubkey,
}: {
  tag: ProfileTag;
  canAct: boolean;
  viewerPubkey: string;
}) {
  const applyTag = useApplyTag(viewerPubkey);
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  const others = corroborations(tag);
  const agreed = tag.myStance === "apply";
  const who = onlySelfDeclared(tag)
    ? "Only you say this"
    : others === 1
      ? "1 person says this"
      : `${others} people say this`;

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
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3" data-testid="my-tag-row">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          {authorNpub ? (
            <Link href={`/tags/${authorNpub}/${tag.slug}`}>
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
        <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">{who}</p>
      </div>

      {canAct && (
        <button
          type="button"
          onClick={() => setStance(agreed ? -1 : 1)}
          disabled={busy}
          className="shrink-0 rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition-colors hover:border-brand-primary hover:text-brand-primary disabled:opacity-50 dark:border-slate-700 dark:text-slate-300"
          data-testid="my-tag-stance"
        >
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : agreed ? "Disagree" : "Agree"}
        </button>
      )}
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

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
      {children}
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
