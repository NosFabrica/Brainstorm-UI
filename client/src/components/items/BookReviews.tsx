/**
 * Reviews of a book, by people you'd ask: each a signed comment on the book
 * (lib/placeReviews — the same comment a place gets, with one to five
 * stars), shown with the reviewer's face and tier ring, their stars, their
 * words — ordered the way every endorsement surface orders people
 * (services/endorsements: people the reader follows, then verified, then
 * everyone else), so the first review a reader sees is from someone they
 * trust, not the loudest stranger. That is the difference from a shop's
 * reviews, and the page says so.
 *
 * A signed-in reader writes one in the composer: the stars, then a few
 * words. It's public and signed, and the composer says so.
 */
import { useState } from "react";
import { Link } from "wouter";
import { Loader2, Star } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DefaultAvatarImg } from "@/components/share/DefaultAvatarImg";
import { useTierRing } from "@/components/score/VerificationCoin";
import { useActiveAccountDisplay } from "@/hooks/useActiveAccountDisplay";
import { usePostPlaceReview } from "@/hooks/usePlaceReviews";
import { relativeTime } from "@/lib/relativeTime";
import { LinkedText } from "@/components/LinkedText";
import type { useRankedReviews } from "@/components/items/PlaceReviews";

type Item = { id: string; kind: number; pubkey: string; tags: string[][] };
const MAX_LENGTH = 1200;
const STARS = [1, 2, 3, 4, 5];

export function BookReviews({ item, ranked }: { item: Item; ranked: ReturnType<typeof useRankedReviews> }) {
  const me = useActiveAccountDisplay()?.pubkey ?? null;
  const tierRing = useTierRing();
  const { reviews, nameOf, pictureOf, npubOf, scoreOf } = ranked;
  return (
    <section className="space-y-3" id="book-reviews" data-testid="book-reviews">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-400 dark:text-slate-500">
          Reviews{reviews.length > 0 ? ` · ${reviews.length}` : ""}
        </p>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
          From people you trust first, then everyone else — never the loudest stranger.
        </p>
      </div>
      {me && <Composer item={item} />}
      {reviews.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          No reviews yet.{me ? " Be the first." : " Sign in to write one."}
        </p>
      ) : (
        <ul className="space-y-4">
          {reviews.map((r) => (
            <li key={r.id} className="flex gap-3" data-testid="book-review">
              <Avatar
                className={`h-9 w-9 shrink-0 rounded-full bg-white dark:bg-slate-900 ${tierRing(scoreOf(r.pubkey), false, "sm", true) ?? "ring-2 ring-white dark:ring-slate-900"}`}
              >
                {pictureOf(r.pubkey) ? <AvatarImage src={pictureOf(r.pubkey)} alt="" className="object-cover" /> : null}
                <AvatarFallback className="overflow-hidden rounded-full">
                  <DefaultAvatarImg />
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1 space-y-1">
                <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
                  {npubOf(r.pubkey) ? (
                    <Link
                      href={`/p/${npubOf(r.pubkey)}`}
                      className="font-semibold text-slate-900 hover:text-brand-link dark:text-slate-100"
                    >
                      {nameOf(r.pubkey)}
                    </Link>
                  ) : (
                    <span className="font-semibold text-slate-900 dark:text-slate-100">{nameOf(r.pubkey)}</span>
                  )}
                  {r.rating != null && <Stars value={r.rating} />}
                  <span className="text-xs text-slate-400">{relativeTime(r.at)}</span>
                </p>
                {r.text && (
                  <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed text-slate-800 dark:text-slate-200">
                    <LinkedText text={r.text} />
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** One to five stars, read out as such. */
export function Stars({ value, size = "sm" }: { value: number; size?: "sm" | "md" }) {
  const px = size === "md" ? "h-5 w-5" : "h-3.5 w-3.5";
  return (
    <span
      className="inline-flex items-center gap-0.5"
      role="img"
      aria-label={`${value} out of 5 stars`}
      data-testid="book-review-stars"
    >
      {STARS.map((n) => (
        <Star
          key={n}
          aria-hidden="true"
          className={`${px} ${n <= value ? "fill-amber-400 text-amber-400" : "fill-slate-200 text-slate-200 dark:fill-slate-700 dark:text-slate-700"}`}
        />
      ))}
    </span>
  );
}

function Composer({ item }: { item: Item }) {
  const post = usePostPlaceReview(item);
  const [rating, setRating] = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [text, setText] = useState("");
  const words = text.trim();

  const submit = () => {
    if (!words && rating == null) return;
    post.mutate(
      { text: words, rating, price: null, paid: null, photos: [] },
      {
        onSuccess: () => {
          setText("");
          setRating(null);
        },
      },
    );
  };

  const lit = hover ?? rating ?? 0;
  return (
    <div
      className="space-y-2 rounded-xl border border-slate-200 p-3 dark:border-slate-700"
      data-testid="book-review-composer"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-slate-500 dark:text-slate-400">Your rating</span>
        <span className="inline-flex items-center" onMouseLeave={() => setHover(null)}>
          {STARS.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setRating(rating === n ? null : n)}
              onMouseEnter={() => setHover(n)}
              aria-label={`${n} ${n === 1 ? "star" : "stars"}`}
              aria-pressed={rating === n}
              className="p-0.5"
            >
              <Star
                aria-hidden="true"
                className={`h-6 w-6 transition-colors ${n <= lit ? "fill-amber-400 text-amber-400" : "fill-slate-200 text-slate-200 hover:text-amber-300 dark:fill-slate-700 dark:text-slate-700"}`}
              />
            </button>
          ))}
        </span>
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, MAX_LENGTH))}
        placeholder="What did you think?"
        rows={2}
        className="w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition-colors placeholder:text-slate-400 focus:border-brand-primary dark:border-slate-700 dark:bg-slate-900"
        aria-label="Your review"
      />
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <span className="text-[11px] text-slate-400 dark:text-slate-500">Public and signed by your account.</span>
        <button
          type="button"
          onClick={submit}
          disabled={(!words && rating == null) || post.isPending}
          className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-full bg-brand-primary px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-brand-primary-hover disabled:opacity-50"
        >
          {post.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
          Post review
        </button>
      </div>
    </div>
  );
}
