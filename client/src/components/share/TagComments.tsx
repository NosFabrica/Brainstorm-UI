import { useMemo, useState } from "react";
import { Link } from "wouter";
import { Loader2, MessageSquare } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { DefaultAvatarImg } from "@/components/share/DefaultAvatarImg";
import { LinkedText } from "@/components/LinkedText";
import { useToast } from "@/hooks/use-toast";
import { fetchProfileMap } from "@/services/nostr";
import { npubFromPubkey } from "@/lib/shareId";
import { useTagComments, usePostTagComment } from "@/hooks/useTags";

/**
 * Discussion of what a tag MEANS.
 *
 * Anchored on the tag, never on a person's tagging — see
 * docs/decentralized-tagging/COMMENTS-PROPOSAL.md. "Does Bitcoin Vendor require
 * accepting BTC in person?" is a question the whole list depends on; "here's
 * why Bob doesn't belong" is commentary about a named individual on a page he
 * doesn't control, and the vote already expresses that without prose.
 *
 * Standard NIP-22 kind-1111, so other clients can read and answer these.
 */
const MAX_LENGTH = 500;

export function TagComments({
  authorPubkey,
  slug,
  canPost,
}: {
  authorPubkey: string;
  slug: string;
  /** Signed in AND holds a signer — a session token can't sign an event. */
  canPost: boolean;
}) {
  const [draft, setDraft] = useState("");
  const { toast } = useToast();
  const { data: comments, isLoading } = useTagComments(authorPubkey, slug);
  const post = usePostTagComment(authorPubkey, slug);

  const authors = useMemo(
    () => Array.from(new Set((comments ?? []).map((c) => c.author))),
    [comments],
  );
  const profilesQuery = useQuery({
    queryKey: ["tag-comment-profiles", authors.join(",")],
    queryFn: () => fetchProfileMap(authors),
    enabled: authors.length > 0,
    staleTime: 5 * 60_000,
    retry: false,
  });
  const profiles = profilesQuery.data;

  async function submit() {
    const text = draft.trim();
    if (!text) return;
    try {
      await post.mutateAsync(text);
      setDraft("");
    } catch {
      toast({
        title: "Couldn't post that",
        description: "Check your connection and try again.",
        variant: "destructive",
      });
    }
  }

  const list = comments ?? [];

  return (
    <section className="mt-8" data-testid="tag-comments">
      <div className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
        <MessageSquare className="h-3.5 w-3.5" />
        {isLoading ? "Loading" : `${list.length} ${list.length === 1 ? "comment" : "comments"}`}
      </div>

      {canPost && (
        <div className="mb-4">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, MAX_LENGTH))}
            placeholder={`What does "${slug.replace(/-/g, " ")}" mean to you?`}
            rows={2}
            className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition-colors placeholder:text-slate-400 focus:border-brand-primary dark:border-slate-700 dark:bg-slate-900"
            data-testid="tag-comment-input"
          />
          <div className="mt-1.5 flex items-center justify-between">
            <span className="text-[11px] text-slate-400 dark:text-slate-500">
              {/* Say it plainly. This is a public, signed, permanent event —
                  people should know that before they type, not after. */}
              Public and signed by your account.
            </span>
            <button
              type="button"
              onClick={submit}
              disabled={!draft.trim() || post.isPending}
              className="inline-flex items-center gap-1.5 rounded-full bg-brand-primary px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-brand-primary-hover disabled:opacity-50"
              data-testid="tag-comment-post"
            >
              {post.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
              Post
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3" data-testid="tag-comments-loading">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="flex gap-3 animate-pulse">
              <div className="h-8 w-8 shrink-0 rounded-full bg-slate-100 dark:bg-slate-800" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 w-24 rounded bg-slate-100 dark:bg-slate-800" />
                <div className="h-3 w-full rounded bg-slate-100 dark:bg-slate-800" />
              </div>
            </div>
          ))}
        </div>
      ) : list.length === 0 ? (
        <p className="text-sm text-slate-400 dark:text-slate-500" data-testid="tag-comments-empty">
          {canPost
            ? "No comments yet — say what this tag should mean."
            : "No comments yet."}
        </p>
      ) : (
        <ul className="space-y-4">
          {list.map((c) => {
            const p = profiles?.get(c.author);
            const name = p?.display_name || p?.name || `${c.author.slice(0, 8)}…`;
            let npub = "";
            try { npub = npubFromPubkey(c.author); } catch { /* unlinkable */ }
            return (
              <li key={c.id} className="flex gap-3" data-testid="tag-comment">
                <Avatar className="h-8 w-8 shrink-0 border border-slate-200 dark:border-slate-800">
                  {p?.picture ? <AvatarImage src={p.picture} alt="" className="object-cover" /> : null}
                  <AvatarFallback className="overflow-hidden"><DefaultAvatarImg /></AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    {npub ? (
                      <Link
                        href={`/p/${npub}`}
                        className="text-sm font-semibold text-slate-900 hover:text-brand-primary dark:text-slate-100"
                        data-testid="tag-comment-author"
                      >
                        {name}
                      </Link>
                    ) : (
                      <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{name}</span>
                    )}
                    <span className="text-[11px] text-slate-400 dark:text-slate-500">
                      {relativeTime(c.createdAt)}
                    </span>
                  </div>
                  <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-slate-600 dark:text-slate-300">
                    <LinkedText text={c.content} />
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
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
