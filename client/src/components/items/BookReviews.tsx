/**
 * Reviews of a book, by people you'd ask: each the shared review record
 * (lib/bookReviews — kind 34259 marked `book`, the one Unbnd reads and
 * writes too), shown with the reviewer's face and tier ring, their stars, their
 * words — ordered the way every endorsement surface orders people
 * (services/endorsements: people the reader follows, then verified, then
 * everyone else), so the first review a reader sees is from someone they
 * trust, not the loudest stranger. That is the difference from a shop's
 * reviews, and the page says so.
 *
 * A signed-in reader writes one in the composer: the stars, then a few
 * words. It's public and signed, and the composer says so. One review per
 * person: a reader who has one finds it in the composer to change, and can
 * take it down from the review itself.
 */
import { useState } from "react";
import { Link } from "wouter";
import { Loader2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DefaultAvatarImg } from "@/components/share/DefaultAvatarImg";
import { useTierRing } from "@/components/score/VerificationCoin";
import { useActiveAccountDisplay } from "@/hooks/useActiveAccountDisplay";
import { usePostBookReview, useRemoveBookReview } from "@/hooks/useBookReviews";
import type { BookReview } from "@/lib/bookReviews";
import { relativeTime } from "@/lib/relativeTime";
import { LinkedText } from "@/components/LinkedText";
import { StarPicker, Stars } from "@/components/items/Stars";
import type { useRankedReviews } from "@/components/items/PlaceReviews";

type Item = { id: string; kind: number; pubkey: string; tags: string[][] };
const MAX_LENGTH = 1200;

export function BookReviews({
  item,
  title,
  ranked,
}: {
  item: Item;
  /** The book's title, which the review's `alt` names. */
  title: string;
  ranked: ReturnType<typeof useRankedReviews>;
}) {
  const me = useActiveAccountDisplay()?.pubkey ?? null;
  const tierRing = useTierRing();
  const { reviews, nameOf, pictureOf, npubOf, scoreOf } = ranked;
  const own = me ? (reviews as BookReview[]).find((r) => r.pubkey === me) : undefined;
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
      {me && <Composer key={own?.id ?? "new"} item={item} title={title} own={own} />}
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
                  {r.rating != null && <Stars value={r.rating} testId="book-review-stars" />}
                  <span className="text-xs text-slate-400">{relativeTime(r.at)}</span>
                </p>
                {r.text && (
                  <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed text-slate-800 dark:text-slate-200">
                    <LinkedText text={r.text} />
                  </p>
                )}
                {r.pubkey === me && <RemoveReview item={item} review={r as BookReview} />}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** The reader's review: a new one, or their own as they left it, to change (one person, one review). */
function Composer({ item, title, own }: { item: Item; title: string; own?: BookReview }) {
  const post = usePostBookReview(item, title);
  const [rating, setRating] = useState<number | null>(own?.rating == null ? null : Math.round(own.rating));
  const [text, setText] = useState(own?.text ?? "");
  const words = text.trim();

  const submit = () => {
    if (!words && rating == null) return;
    post.mutate(
      { draft: { text: words, rating }, previous: own },
      {
        onSuccess: () => {
          // A new review clears the box; a changed one stays as it now reads.
          if (own) return;
          setText("");
          setRating(null);
        },
      },
    );
  };

  return (
    <div
      className="space-y-2 rounded-xl border border-slate-200 p-3 dark:border-slate-700"
      data-testid="book-review-composer"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-slate-500 dark:text-slate-400">{own ? "Your review" : "Your rating"}</span>
        <StarPicker value={rating} onChange={setRating} />
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
          {own ? "Update review" : "Post review"}
        </button>
      </div>
    </div>
  );
}

/** The reader's own review can be taken down, once they say so on the review itself. */
function RemoveReview({ item, review }: { item: Item; review: BookReview }) {
  const remove = useRemoveBookReview(item);
  const [asking, setAsking] = useState(false);
  const quiet = "text-xs font-semibold text-slate-500 hover:text-brand-link dark:text-slate-400";
  if (!asking)
    return (
      <button type="button" className={quiet} onClick={() => setAsking(true)}>
        Remove
      </button>
    );
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600 dark:text-slate-300">
      <span>Remove your review? Apps that read it will stop showing it.</span>
      <button
        type="button"
        className="inline-flex items-center gap-1 font-semibold text-red-600 hover:text-red-700 disabled:opacity-60 dark:text-red-400"
        onClick={() => remove.mutate(review)}
        disabled={remove.isPending}
      >
        {remove.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
        Remove review
      </button>
      <button type="button" className={quiet} onClick={() => setAsking(false)}>
        Keep it
      </button>
    </p>
  );
}
