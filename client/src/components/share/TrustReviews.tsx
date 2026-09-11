/**
 * The person page's Reviews — every Relay Outpost vouch about someone,
 * in the one order the rest of the product uses (people you follow →
 * verified accounts → the rest folded), each with its type, its words, and
 * the person's own public reply when they answered. A signed-in viewer can
 * write one here (Vouched or Identity, words optional), which publishes the
 * same kind-31871 event Relay Outpost does — one review per person, so an
 * existing one prefills and updates; Remove is the NIP-09 delete. Silent for
 * a signed-out reader when nobody has vouched.
 */
import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { nip19 } from "nostr-tools";
import { BadgeCheck, ChevronDown, ChevronUp, Heart, MessageSquareText, PenLine } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { DefaultAvatarImg } from "@/components/share/DefaultAvatarImg";
import { TierWordChip, useTierRing } from "@/components/score/VerificationCoin";
import { VouchBadge, useRankedVouches } from "@/components/search/EndorsementLine";
import { NotesInline } from "@/components/share/NotesInline";
import { reviewsSummaryLabel } from "@/services/endorsements";
import { useActiveAccountDisplay } from "@/hooks/useActiveAccountDisplay";
import { useMyFollows } from "@/hooks/useMyFollows";
import { forgetPersonEndorsements, usePersonEndorsements } from "@/hooks/usePersonEndorsements";
import { useProfileMap } from "@/hooks/useProfileMap";
import { getDisplayLabel } from "@/lib/profileSearch";
import { fetchVouchReplies, type PersonVouch, type VouchReply } from "@/services/search";
import { publishVouch, revokeVouch, type VouchType } from "@/services/vouches";
import type { EndorserGroup } from "@/services/endorsements";

const GROUP_HEADERS: Record<EndorserGroup, string> = {
  followed: "From people you follow",
  verified: "From verified accounts",
  other: "More from the network",
};

const MAX_LEN = 500;

/** Bring the section to rest just under the sticky search bar — "center"
 *  hides the lower half behind a phone's bottom bars, "start" hides the
 *  summary line under the header. Returns where the section sat in the
 *  document when we aimed, so a later check can tell if it moved. */
function scrollToReviews(): number | null {
  if (typeof window === "undefined") return null;
  const el = document.getElementById("trust-reviews");
  if (!el) return null;
  const docTop = el.getBoundingClientRect().top + window.scrollY;
  window.scrollTo({ top: Math.max(0, docTop - 72), behavior: "smooth" });
  return docTop;
}

/**
 * Land, then settle. Content above the section (the follower faces, the
 * tags) keeps arriving for a second or two after the first scroll and pushes
 * it down — so re-aim a few times while the section's document position is
 * still moving, and stop the moment the reader scrolls themselves.
 */
function settleScrollToReviews(): () => void {
  let aimedAt = scrollToReviews();
  if (aimedAt == null || typeof window === "undefined") return () => {};
  let cancelled = false;
  const stop = () => {
    cancelled = true;
    window.removeEventListener("wheel", stop);
    window.removeEventListener("touchstart", stop);
    window.removeEventListener("keydown", stop);
  };
  window.addEventListener("wheel", stop, { passive: true });
  window.addEventListener("touchstart", stop, { passive: true });
  window.addEventListener("keydown", stop);
  const timers = [400, 900, 1600, 2600].map((ms) =>
    window.setTimeout(() => {
      if (cancelled) return;
      const el = document.getElementById("trust-reviews");
      if (!el) return;
      const docTop = el.getBoundingClientRect().top + window.scrollY;
      if (Math.abs(docTop - (aimedAt ?? docTop)) > 8) aimedAt = scrollToReviews();
    }, ms),
  );
  return () => {
    stop();
    timers.forEach((t) => window.clearTimeout(t));
  };
}

function ago(at: number): string {
  const days = Math.floor((Date.now() / 1000 - at) / 86400);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

/** The inline composer: type, words, publish — or update / remove your own. */
function VouchComposer({
  subject,
  existing,
  onPublished,
  onRemoved,
  onCancel,
}: {
  subject: string;
  existing: PersonVouch | null;
  onPublished: (v: PersonVouch) => void;
  onRemoved: () => void;
  onCancel: () => void;
}) {
  const [type, setType] = useState<VouchType>(existing?.type ?? "vouch");
  const [text, setText] = useState(existing?.text ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    const res = await publishVouch(subject, { type, content: text });
    setBusy(false);
    if (!res.success) {
      if (!res.cancelled) setError(res.error ?? "Couldn't publish your review");
      return;
    }
    const ev = res.event;
    onPublished({
      id: ev?.id ?? `local-${Date.now()}`,
      pubkey: ev?.pubkey ?? "",
      type,
      text: text.trim(),
      at: ev?.created_at ?? Math.floor(Date.now() / 1000),
    });
  };

  const remove = async () => {
    if (!existing) return;
    if (!confirmRemove) {
      setConfirmRemove(true);
      return;
    }
    setBusy(true);
    setError(null);
    const res = await revokeVouch(subject, existing.id);
    setBusy(false);
    if (!res.success) {
      if (!res.cancelled) setError(res.error ?? "Couldn't remove your review");
      return;
    }
    onRemoved();
  };

  const typeButton = (t: VouchType, label: string, help: string, Icon: typeof Heart) => (
    <button
      type="button"
      onClick={() => setType(t)}
      aria-pressed={type === t}
      className={`flex-1 rounded-xl border px-3 py-2 text-left transition-colors ${
        type === t
          ? "border-brand-primary/50 bg-brand-primary/5 dark:bg-brand-primary/15"
          : "border-slate-200 dark:border-slate-700 hover:border-brand-accent/40"
      }`}
      data-testid={`vouch-type-${t}`}
    >
      <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-800 dark:text-slate-100">
        <Icon className="h-3.5 w-3.5 text-brand-primary" /> {label}
      </span>
      <span className="mt-0.5 block text-[11px] leading-snug text-slate-500 dark:text-slate-400">{help}</span>
    </button>
  );

  return (
    <div className="mt-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40 p-3" data-testid="vouch-composer">
      {/* Phones stack the two types; the side-by-side pair needs the sm width. */}
      <div className="flex flex-col gap-2 sm:flex-row">
        {typeButton("vouch", "Recommend", "I know this person and recommend them", Heart)}
        {typeButton("identity", "Confirm identity", "I personally know this is really them", BadgeCheck)}
      </div>
      <Textarea
        value={text}
        onChange={(ev) => setText(ev.target.value.slice(0, MAX_LEN))}
        placeholder="In your words — optional"
        rows={3}
        className="mt-2 text-sm"
        data-testid="vouch-text"
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={submit} disabled={busy} data-testid="vouch-publish">
          {existing ? "Update review" : "Publish review"}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        {existing && (
          <Button size="sm" variant="ghost" onClick={remove} disabled={busy} className="ml-auto text-red-600 dark:text-red-400" data-testid="vouch-remove">
            {confirmRemove ? "Confirm remove" : "Remove"}
          </Button>
        )}
        <span className="w-full text-[11px] text-slate-400 dark:text-slate-500 sm:ml-auto sm:w-auto">
          {text.length}/{MAX_LEN} · published publicly to your relays
        </span>
      </div>
      {error && (
        <p className="mt-2 text-xs text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function TrustReviews({
  pubkey,
  personal,
  composeRequest = 0,
}: {
  pubkey: string;
  personal: boolean;
  /** The page's pen icon beside Zap bumps this to ask for the composer. */
  composeRequest?: number;
}) {
  const e = usePersonEndorsements(pubkey, personal);
  const viewer = useActiveAccountDisplay()?.pubkey ?? null;
  const canWrite = !!viewer && viewer !== pubkey;
  // What the viewer just wrote or removed shows at once — no refetch to wait for.
  const [local, setLocal] = useState<PersonVouch[] | null>(null);
  const vouches = local ?? e?.vouches ?? [];
  const { ranked, nameOf, pictureOf } = useRankedVouches(e ? { ...e, vouches } : null);
  const { signedIn } = useMyFollows();
  const tierRing = useTierRing();
  const [othersOpen, setOthersOpen] = useState(false);
  const [composing, setComposing] = useState(false);
  // Collapsed by default — a summary line, Google's way. The panel's link
  // deep-links here with #trust-reviews and arrives unfolded.
  const [open, setOpen] = useState(() => typeof window !== "undefined" && window.location.hash === "#trust-reviews");
  // The pen beside Zap opens the composer in place — no scroll. The section
  // sits just under the header, so moving the page only jolts the reader.
  useEffect(() => {
    if (composeRequest <= 0) return;
    setComposing(true);
    setOpen(true);
  }, [composeRequest]);
  // The section renders only once the reviews arrive — after the browser's own
  // hash jump has already happened — so a deep link scrolls itself here, once.
  const landed = useRef(false);
  const hasVouches = vouches.length > 0;
  useEffect(() => {
    if (landed.current || !hasVouches) return;
    if (typeof window === "undefined" || window.location.hash !== "#trust-reviews") return;
    landed.current = true;
    return settleScrollToReviews();
  }, [hasVouches]);
  const [replies, setReplies] = useState<Map<string, VouchReply>>(new Map());
  const subjectProfile = useProfileMap([pubkey]).get(pubkey);
  const vouchIds = vouches.map((v) => v.id);
  const idsKey = vouchIds.join(",");
  useEffect(() => {
    if (vouchIds.length === 0) return;
    let alive = true;
    void fetchVouchReplies(vouchIds).then((r) => {
      if (alive) setReplies(r);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  if (!e) return null;
  if (vouches.length === 0 && !canWrite) return null;

  const mine = viewer ? vouches.find((v) => v.pubkey === viewer) ?? null : null;
  const grouped: Record<EndorserGroup, typeof ranked> = { followed: [], verified: [], other: [] };
  for (const v of ranked) grouped[v.group].push(v);
  const trustedCount = grouped.followed.length + grouped.verified.length;
  const subjectName = subjectProfile ? getDisplayLabel(subjectProfile) : "them";

  const onPublished = (v: PersonVouch) => {
    setLocal([...vouches.filter((x) => x.pubkey !== v.pubkey), v]);
    setComposing(false);
    setOpen(true); // show them what they just wrote
    forgetPersonEndorsements(pubkey);
  };
  // Plain words for the collapsed line — no faces (the Followed-by row has
  // them), no names (the rows do): how many, and from whom.
  const summaryLabel = reviewsSummaryLabel({
    total: vouches.length,
    followed: signedIn ? grouped.followed.length : 0,
    verified: grouped.verified.length,
  });
  const onRemoved = () => {
    setLocal(vouches.filter((x) => x.pubkey !== viewer));
    setComposing(false);
    forgetPersonEndorsements(pubkey);
  };

  return (
    <section className="mt-2.5" id="trust-reviews" data-testid="trust-reviews">
      {/* The summary line — the same anatomy as "Followed by …" above it:
          reviewer faces + "Reviewed by friend & benjamin". Tap to unfold. */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1" data-testid="trust-reviews-summary">
        {vouches.length > 0 ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="group inline-flex items-center gap-1.5 rounded-md text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40"
            data-testid="trust-reviews-toggle-open"
          >
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
              <MessageSquareText className="h-3 w-3" aria-hidden />
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-200 transition-colors">{summaryLabel}</span>
            {open ? (
              <ChevronUp className="h-3.5 w-3.5 text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300" />
            )}
          </button>
        ) : (
          !composing && (
            // Nobody yet: the invitation is itself the door (the page's pen
            // icon beside Zap is the other one).
            <button
              type="button"
              onClick={() => setComposing(true)}
              className="text-left text-xs text-slate-500 dark:text-slate-400 hover:text-brand-deep dark:hover:text-brand-link hover:underline"
              data-testid="trust-reviews-invite"
            >
              Be the first to review {subjectName}
            </button>
          )
        )}
      </div>
      {composing && (
        <VouchComposer subject={pubkey} existing={mine} onPublished={onPublished} onRemoved={onRemoved} onCancel={() => setComposing(false)} />
      )}
      {open && vouches.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 dark:border-slate-800/60 pt-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Reviews <span className="font-normal normal-case tracking-normal text-slate-400 dark:text-slate-500">· {vouches.length}</span>
          </h2>
          {/* The secondary door lives in the area that unfolds — the summary
              line above stays a quiet social-proof row. */}
          {canWrite && !composing && (
            <button
              type="button"
              onClick={() => setComposing(true)}
              className="inline-flex items-center gap-1 rounded-full border border-slate-200 dark:border-slate-700 px-2.5 py-1 text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:border-brand-accent/40 transition-colors"
              data-testid="trust-reviews-write"
            >
              <PenLine className="h-3 w-3" /> {mine ? "Edit your review" : "Write a review"}
            </button>
          )}
        </div>
      )}
      {open && (["followed", "verified", "other"] as EndorserGroup[]).map((group) => {
        const rows = grouped[group];
        if (rows.length === 0) return null;
        if (group === "followed" && !signedIn) return null;
        const folded = group === "other" && trustedCount > 0 && !othersOpen;
        return (
          <div key={group} className="mt-3" data-testid={`trust-reviews-${group}`}>
            {(group !== "other" || trustedCount > 0) && (
              <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                {GROUP_HEADERS[group]} <span className="text-slate-400 dark:text-slate-500">· {rows.length}</span>
              </div>
            )}
            {folded ? (
              <button
                type="button"
                onClick={() => setOthersOpen(true)}
                className="mt-1 text-xs font-medium text-brand-primary hover:underline"
                data-testid="trust-reviews-toggle"
              >
                Show {rows.length} more
              </button>
            ) : (
              <ul className="mt-2 divide-y divide-slate-100 dark:divide-slate-800/60 border-y border-slate-100 dark:border-slate-800/60">
                {/* Each review is its own enclosed item: hairlines above, between
                    and below, breathing room inside — the LinkedIn recommendation
                    list, not a chat log. */}
                {rows.map((v) => {
                  let npub = "";
                  try {
                    npub = nip19.npubEncode(v.pubkey);
                  } catch {
                    /* malformed pubkey — row renders without a link */
                  }
                  const reply = replies.get(v.id);
                  const isMine = v.pubkey === viewer;
                  return (
                    <li key={v.id} className="flex items-start gap-3 py-3 first:pt-2.5 last:pb-2.5" data-testid={`trust-review-${v.id}`}>
                      <Link href={npub ? `/p/${npub}` : "#"} className="shrink-0">
                        <Avatar className={`h-7 w-7 border border-slate-200/80 dark:border-slate-800/80 ${tierRing(v.score, false, "sm", true) ?? ""}`}>
                          {pictureOf(v.pubkey) ? <AvatarImage src={pictureOf(v.pubkey)} alt="" className="object-cover" /> : null}
                          <AvatarFallback className="overflow-hidden">
                            <DefaultAvatarImg />
                          </AvatarFallback>
                        </Avatar>
                      </Link>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                          <span className="truncate text-xs font-semibold text-slate-800 dark:text-slate-100">
                            {isMine ? "You" : nameOf(v.pubkey) ?? (npub ? `${npub.slice(0, 12)}…` : "Someone")}
                          </span>
                          <TierWordChip score01={v.score} />
                          <VouchBadge type={v.type} />
                          <span className="text-[11px] text-slate-400 dark:text-slate-500">{ago(v.at)}</span>
                        </div>
                        {v.text ? (
                          // A comment, not a paragraph: the words sit in a speech
                          // bubble off the reviewer's avatar — the shape people
                          // read as "someone said this".
                          <div className="mt-1.5 inline-block max-w-full rounded-2xl rounded-tl-md bg-slate-50 dark:bg-slate-800/60 px-3.5 py-2 text-[13px] leading-relaxed text-slate-800 dark:text-slate-100 break-words">
                            <NotesInline text={v.text} />
                          </div>
                        ) : (
                          <p className="mt-0.5 text-xs italic text-slate-400 dark:text-slate-500">No note — a review by name alone</p>
                        )}
                        {reply && (
                          // The subject's answer: a second bubble, tinted the
                          // brand's interaction colour, indented under the review.
                          <div
                            className="ml-3 mt-1.5 inline-block max-w-full rounded-2xl rounded-tl-md bg-brand-primary/5 dark:bg-brand-primary/15 px-3.5 py-2 text-[13px] leading-relaxed text-slate-800 dark:text-slate-100 break-words"
                            data-testid={`trust-review-reply-${v.id}`}
                          >
                            <div className="text-[11px] font-medium text-brand-deep dark:text-brand-link">
                              {subjectName} replied <span className="font-normal text-slate-400 dark:text-slate-500">· {ago(reply.at)}</span>
                            </div>
                            <div className="mt-0.5">
                              <NotesInline text={reply.text} />
                            </div>
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </section>
  );
}
