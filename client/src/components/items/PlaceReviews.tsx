/**
 * Reviews of a place, by people: each a signed comment on the place
 * (lib/placeReviews), shown with the reviewer's face and tier ring, name,
 * words, photos, and the price and payment they gave — ordered the way every
 * endorsement surface orders people (services/endorsements: people the
 * reader follows, then verified, then everyone else), so the first review a
 * reader sees is from someone they'd ask.
 *
 * A signed-in reader writes one in the composer: the words, a price from $
 * to $$$$, how they paid, photos uploaded to the reader's Blossom server
 * (services/blossom). It's public and signed, and the composer says so.
 */
import { useRef, useState } from "react";
import { Link } from "wouter";
import { Camera, Loader2, X } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DefaultAvatarImg } from "@/components/share/DefaultAvatarImg";
import { useTierRing } from "@/components/score/VerificationCoin";
import { useActiveAccountDisplay } from "@/hooks/useActiveAccountDisplay";
import { useAuthorScores } from "@/hooks/useAuthorScores";
import { useMyFollows } from "@/hooks/useMyFollows";
import { usePostPlaceReview } from "@/hooks/usePlaceReviews";
import { useProfileMap } from "@/hooks/useProfileMap";
import { useToast } from "@/hooks/use-toast";
import { avatarSrc } from "@/lib/avatarSrc";
import { PAID_LABELS, type Paid, type PlaceReview } from "@/lib/placeReviews";
import { getDisplayLabel } from "@/lib/profileSearch";
import { relativeTime } from "@/lib/relativeTime";
import { rankEndorsers } from "@/services/endorsements";
import { uploadToBlossom } from "@/services/blossom";
import { LinkedText } from "@/components/LinkedText";

type Item = { id: string; kind: number; pubkey: string; tags: string[][] };
const MAX_LENGTH = 1200;
const PRICES = [1, 2, 3, 4];

/** The reviews in the one order, with names and faces: what the page and its photo strip read. */
export function useRankedReviews({ reviews, pending }: { reviews: PlaceReview[]; pending: boolean }) {
  const { follows } = useMyFollows();
  const people = [...new Set(reviews.map((r) => r.pubkey))];
  const scoreOf = useAuthorScores(people);
  const profiles = useProfileMap(people);
  const rank = new Map(rankEndorsers(reviews, { follows, scoreOf }).map((e, i) => [e.pubkey, { i, score: e.score }]));
  const ranked = [...reviews].sort(
    (a, b) => (rank.get(a.pubkey)?.i ?? 99) - (rank.get(b.pubkey)?.i ?? 99) || b.at - a.at,
  );
  return {
    reviews: ranked,
    pending,
    nameOf: (pk: string) => {
      const p = profiles.get(pk);
      return p ? getDisplayLabel(p) : pk.slice(0, 8);
    },
    pictureOf: (pk: string) => profiles.get(pk)?.picture,
    npubOf: (pk: string) => profiles.get(pk)?.npub,
    scoreOf: (pk: string) => rank.get(pk)?.score ?? null,
  };
}

export function PlaceReviews({ item, ranked }: { item: Item; ranked: ReturnType<typeof useRankedReviews> }) {
  const me = useActiveAccountDisplay()?.pubkey ?? null;
  const tierRing = useTierRing();
  const { reviews, nameOf, pictureOf, npubOf, scoreOf } = ranked;
  return (
    <section className="space-y-3" data-testid="place-reviews">
      <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-400 dark:text-slate-500">
        Reviews{reviews.length > 0 ? ` · ${reviews.length}` : ""}
      </p>
      {me && <Composer item={item} />}
      {reviews.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          No reviews yet.{me ? " Be the first." : " Sign in to write one."}
        </p>
      ) : (
        <ul className="space-y-4">
          {reviews.map((r) => (
            <li key={r.id} className="flex gap-3" data-testid="place-review">
              <Avatar
                className={`h-9 w-9 shrink-0 rounded-full bg-white dark:bg-slate-900 ${tierRing(scoreOf(r.pubkey), false, "sm", true) ?? "ring-2 ring-white dark:ring-slate-900"}`}
              >
                {pictureOf(r.pubkey) ? <AvatarImage src={pictureOf(r.pubkey)} alt="" className="object-cover" /> : null}
                <AvatarFallback className="overflow-hidden rounded-full">
                  <DefaultAvatarImg />
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1 space-y-1.5">
                <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
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
                  <span className="text-xs text-slate-400">{relativeTime(r.at)}</span>
                  {(r.price || r.paid) && (
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      {[r.price ? "$".repeat(r.price) : null, r.paid ? `paid with ${PAID_LABELS[r.paid]}` : null]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  )}
                </p>
                {r.text && (
                  <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed text-slate-800 dark:text-slate-200">
                    <LinkedText text={r.text} />
                  </p>
                )}
                {r.photos.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {r.photos.map((url) => (
                      <a key={url} href={url} target="_blank" rel="noopener noreferrer nofollow">
                        <img
                          src={avatarSrc(url, "lg")}
                          alt=""
                          className="h-24 w-24 rounded-lg border border-border object-cover"
                        />
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** The photos reviewers added, as the page's pictures: the first few, each a link to the full one. */
export function ReviewPhotos({ reviews }: { reviews: PlaceReview[] }) {
  const photos = reviews.flatMap((r) => r.photos).slice(0, 8);
  if (photos.length === 0) return null;
  return (
    <div className="flex gap-2 overflow-x-auto" data-testid="place-photos">
      {photos.map((url) => (
        <a key={url} href={url} target="_blank" rel="noopener noreferrer nofollow" className="shrink-0">
          <img src={avatarSrc(url, "lg")} alt="" className="h-28 w-36 rounded-lg border border-border object-cover" />
        </a>
      ))}
    </div>
  );
}

function Composer({ item }: { item: Item }) {
  const post = usePostPlaceReview(item);
  const { toast } = useToast();
  const [text, setText] = useState("");
  const [price, setPrice] = useState<number | null>(null);
  const [paid, setPaid] = useState<Paid | null>(null);
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  const addPhoto = async (f: File | undefined) => {
    if (!f) return;
    setUploading(true);
    try {
      const url = await uploadToBlossom(f, "Review photo");
      setPhotos((p) => [...p, url]);
    } catch {
      toast({
        title: "Couldn't upload the photo",
        description: "Try a smaller image, or again in a moment.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      if (file.current) file.current.value = "";
    }
  };

  const submit = () => {
    const words = text.trim();
    if (!words && photos.length === 0) return;
    post.mutate(
      { text: words, price, paid, photos },
      {
        onSuccess: () => {
          setText("");
          setPrice(null);
          setPaid(null);
          setPhotos([]);
        },
      },
    );
  };

  const chip = (active: boolean) =>
    `rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors ${
      active
        ? "border-brand-primary bg-brand-primary text-white"
        : "border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
    }`;

  return (
    <div
      className="space-y-2 rounded-xl border border-slate-200 p-3 dark:border-slate-700"
      data-testid="place-review-composer"
    >
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, MAX_LENGTH))}
        placeholder="What was it like?"
        rows={2}
        className="w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition-colors placeholder:text-slate-400 focus:border-brand-primary dark:border-slate-700 dark:bg-slate-900"
        aria-label="Your review"
      />
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs text-slate-500 dark:text-slate-400">Price</span>
        {PRICES.map((p) => (
          <button
            key={p}
            type="button"
            className={chip(price === p)}
            onClick={() => setPrice(price === p ? null : p)}
            aria-pressed={price === p}
          >
            {"$".repeat(p)}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs text-slate-500 dark:text-slate-400">Paid with</span>
        {(Object.keys(PAID_LABELS) as Paid[]).map((p) => (
          <button
            key={p}
            type="button"
            className={chip(paid === p)}
            onClick={() => setPaid(paid === p ? null : p)}
            aria-pressed={paid === p}
          >
            {PAID_LABELS[p]}
          </button>
        ))}
      </div>
      {photos.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {photos.map((url) => (
            <span key={url} className="relative">
              <img src={url} alt="" className="h-16 w-16 rounded-lg border border-border object-cover" />
              <button
                type="button"
                onClick={() => setPhotos((p) => p.filter((u) => u !== url))}
                className="absolute -right-1.5 -top-1.5 rounded-full bg-slate-900 p-0.5 text-white"
                aria-label="Remove photo"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <input
            ref={file}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => void addPhoto(e.target.files?.[0])}
          />
          <button
            type="button"
            onClick={() => file.current?.click()}
            disabled={uploading}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-brand-link disabled:opacity-60 dark:text-slate-300"
          >
            {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
            Add a photo
          </button>
          <span className="text-[11px] text-slate-400 dark:text-slate-500">Public and signed by your account.</span>
        </div>
        <button
          type="button"
          onClick={submit}
          disabled={(!text.trim() && photos.length === 0) || post.isPending || uploading}
          className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-full bg-brand-primary px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-brand-primary-hover disabled:opacity-50 sm:self-auto"
        >
          {post.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
          Post review
        </button>
      </div>
    </div>
  );
}
