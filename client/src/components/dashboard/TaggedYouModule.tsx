import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Tag as TagIcon, X } from "lucide-react";
import { FacePile, NameList } from "@/components/tags/FacePile";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { fetchProfileMap, getCurrentUser } from "@/services/nostr";
import { useProfileTags } from "@/hooks/useTags";
import { npubFromPubkey } from "@/lib/shareId";

/**
 * "Alice and Bob tagged you as Musician."
 *
 * ## Why this exists
 *
 * Nothing else in the app tells you anything happened — `/alerts` is a
 * moderation surface and there is no notification system. So before this,
 * someone could label you in public and you would simply never find out unless
 * you independently decided to go look at a settings page.
 *
 * That's the missing step in the whole flywheel: A tags B → **B finds out** → B
 * tags C. Page placement never fixed it; only a signal does.
 *
 * ## Deliberate choices
 *
 * - **Names are links, and that's the entire call to action.** Clicking a
 *   tagger opens their profile, which is where the tag picker already lives —
 *   so the loop closes without a new flow. There is intentionally no "tag them
 *   back" button: manufactured reciprocity pollutes the very data the trust
 *   filter depends on.
 * - **Event, not wallpaper.** It shows only what's new since you last looked and
 *   returns null otherwise. A permanent "you're known for…" panel becomes
 *   invisible within a week; `/tags/mine` is the durable home.
 * - **Self-tagging is not news.** `asserters` includes the subject (the
 *   deliberate count-parity fix), so we filter ourselves out — same reasoning as
 *   `distinctVouchers` on the tag page.
 */

/**
 * Per-account, like `ScoringStatusBar`'s keys. A global key would leak one
 * account's "seen" state into another's UI on a shared device — a bug that file
 * already documents fixing, so we don't repeat it.
 */
const seenKey = (pubkey?: string) => `brainstorm_tags_seen:${pubkey || "anon"}`;

function readWatermark(pubkey?: string): number {
  try {
    const raw = window.localStorage.getItem(seenKey(pubkey));
    const n = raw ? Number(raw) : 0;
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

export function TaggedYouModule() {
  const viewerPubkey = getCurrentUser()?.pubkey;
  const { data } = useProfileTags(viewerPubkey);
  // Read once per mount. Re-reading on every render would make the list vanish
  // mid-glance the moment anything wrote the key.
  const [watermark, setWatermark] = useState(() => readWatermark(viewerPubkey));

  const fresh = useMemo(() => {
    const tags = data?.tags ?? [];
    return (
      tags
        // Somebody ELSE has to have applied it. A tag you gave yourself, or one
        // that only survives because you disputed it, is not news.
        .filter((t) => t.addedAt > watermark)
        .map((t) => ({
          ...t,
          others: t.asserters.filter((pk) => pk !== viewerPubkey),
        }))
        .filter((t) => t.others.length > 0)
        .sort((a, b) => b.addedAt - a.addedAt)
    );
  }, [data, watermark, viewerPubkey]);

  const taggers = useMemo(
    () => Array.from(new Set(fresh.flatMap((t) => t.others))),
    [fresh],
  );
  const profilesQuery = useQuery({
    queryKey: ["tagged-you-profiles", taggers.join(",")],
    queryFn: () => fetchProfileMap(taggers),
    enabled: taggers.length > 0,
    staleTime: 5 * 60_000,
    retry: false,
  });
  const profiles = profilesQuery.data;

  function dismiss() {
    const now = Math.floor(Date.now() / 1000);
    try {
      window.localStorage.setItem(seenKey(viewerPubkey), String(now));
    } catch {
      // Storage blocked. The in-memory update below still clears it for this
      // session — better than a card that refuses to go away.
    }
    setWatermark(now);
  }

  if (!viewerPubkey || fresh.length === 0) return null;

  return (
    <Card className="mb-6 p-4" data-testid="module-tagged-you">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-accent/10">
            <TagIcon className="h-3.5 w-3.5 text-brand-deep dark:text-brand-link" />
          </span>
          <span
            className="text-sm font-bold tracking-tight text-slate-800 dark:text-slate-200"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {fresh.length === 1 ? "You were tagged" : `You were tagged ${fresh.length} times`}
          </span>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="shrink-0 rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
          data-testid="tagged-you-dismiss"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <ul className="divide-y divide-slate-100 dark:divide-slate-800/60">
        {fresh.map((tag) => {
          let authorNpub = "";
          try {
            authorNpub = npubFromPubkey(tag.authorPubkey);
          } catch {
            /* unlinkable */
          }
          const chip = <Chip tone="brand" size="sm">{tag.name}</Chip>;

          return (
            <li
              key={tag.key}
              className="flex items-start gap-3 py-3 first:pt-0 last:pb-0"
              data-testid="tagged-you-row"
            >
              <FacePile pubkeys={tag.others} profiles={profiles} />

              <div className="min-w-0 flex-1">
                {/* Name and tag on one line where there's room, wrapping on a
                    phone rather than truncating someone's name. */}
                <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-slate-600 dark:text-slate-300">
                  <NameList
                    pubkeys={tag.others}
                    profiles={profiles}
                    className="font-semibold text-slate-800 hover:text-brand-primary dark:text-slate-100"
                  />
                  <span>tagged you as</span>
                  {authorNpub ? (
                    <Link href={`/tags/${authorNpub}/${tag.slug}`} className="hover:opacity-80">
                      {chip}
                    </Link>
                  ) : (
                    chip
                  )}
                </div>

                {/* The tag's own description — the closest thing to an
                    explanation that exists. A tagging carries no free text:
                    its content is a fixed payload, so there is no per-tag
                    note to show and inventing one would be a lie. */}
                {tag.description && (
                  <p
                    className="mt-0.5 line-clamp-2 text-xs text-slate-400 dark:text-slate-500"
                    data-testid="tagged-you-description"
                  >
                    {tag.description}
                  </p>
                )}
              </div>

              <span className="shrink-0 pt-0.5 text-[11px] tabular-nums text-slate-400 dark:text-slate-500">
                {relativeTime(tag.addedAt)}
              </span>
            </li>
          );
        })}
      </ul>

      <Link
        href="/tags/mine"
        className="mt-3 inline-block text-xs font-semibold text-brand-link hover:underline"
        data-testid="tagged-you-manage"
      >
        See all your tags →
      </Link>
    </Card>
  );
}

/** Coarse "how long ago" — precision past a day isn't worth a date library. */
function relativeTime(unixSeconds: number): string {
  if (!unixSeconds) return "";
  const secs = Math.max(0, Math.floor(Date.now() / 1000) - unixSeconds);
  if (secs < 60) return "now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  return `${Math.floor(days / 30)}mo`;
}
