import { useMemo, useState } from "react";
import { useRoute, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import { VideoEmbed, videoEmbedFor } from "@/components/share/VideoEmbed";
import { LinkChip } from "@/components/share/LinkPreview";
import { nip19 } from "nostr-tools";
import { ArrowLeft, ArrowRight, BadgeCheck, Smartphone, Loader2, FileText } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { VerificationCoin, useTierRing, TierWordChip } from "@/components/score/VerificationCoin";
import { fetchAddressableEvents, fetchProfile } from "@/services/nostr";
import { apiClient, hasSessionToken } from "@/services/api";
import { openArticleInApp } from "@/lib/articleLinks";
import { npubFromPubkey } from "@/lib/shareId";
import { initialsFor } from "@/lib/profileDefaults";
import { useShareMeta } from "@/hooks/useShareMeta";
import { EventThread } from "@/components/share/EventThread";
import { OpenInApp } from "@/components/share/OpenInApp";
import { MoreFromAuthor } from "@/components/share/MoreFromAuthor";
import { ShareNavProvider } from "@/components/share/ShareNavContext";
import { BrainLogo } from "@/components/BrainLogo";
import { PublicPageHeader } from "@/components/PublicPageHeader";

const IMG_RE = /\.(png|jpe?g|gif|webp|avif|bmp|svg)(\?.*)?$/i;
const VID_RE = /\.(mp4|webm|mov|m4v|ogv)(\?.*)?$/i;

/**
 * Custom Markdown renderers so a long-form body reads like a top-tier client,
 * not a wall of raw links: a hosted-video URL becomes an inline player, a bare
 * media URL becomes an inline image / <video>, any other bare URL becomes a
 * tidy favicon chip, and a genuinely-labelled link keeps its text but styled.
 * (Full og-image/title/description previews for arbitrary links await the
 * /api/unfurl proxy — see LinkPreview.tsx.)
 */
const mdComponents: Components = {
  a({ href, children }) {
    const url = typeof href === "string" ? href : "";
    const text = Array.isArray(children) ? children.map((c) => (typeof c === "string" ? c : "")).join("") : String(children ?? "");
    const bare = !!url && text.trim() === url.trim(); // an autolinked bare URL, not [label](url)
    if (url && videoEmbedFor(url)) return <VideoEmbed url={url} />;
    if (url && bare && VID_RE.test(url)) {
      return <video src={url} controls playsInline preload="metadata" className="my-3 block w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-900" />;
    }
    if (url && bare && IMG_RE.test(url)) {
      return <img src={url} alt="" loading="lazy" className="my-3 block max-h-[34rem] w-full rounded-xl border border-slate-200 dark:border-slate-800 object-contain" />;
    }
    if (url && bare) return <LinkChip url={url} />;
    return <a href={url || undefined} target="_blank" rel="noopener noreferrer" className="font-medium text-brand-link underline decoration-brand-link/40 underline-offset-2 hover:decoration-brand-link">{children}</a>;
  },
};

type AddressPointer = { kind: number; pubkey: string; identifier: string; relays?: string[] };

function decodeNaddr(raw: string): AddressPointer | null {
  try {
    const d = nip19.decode(raw.replace(/^nostr:/, ""));
    if (d.type === "naddr") return d.data as AddressPointer;
  } catch {
    /* ignore */
  }
  return null;
}

function publishedAgo(ev: { tags: string[][]; created_at: number }): string {
  const pub = ev.tags.find((t) => t[0] === "published_at")?.[1];
  const ts = pub ? parseInt(pub, 10) : ev.created_at;
  if (!Number.isFinite(ts)) return "";
  try {
    return new Date(ts * 1000).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

/**
 * On-site long-form article reader (NIP-23 kind-30023) — Brainstorm's own
 * replacement for njump. Shows a professional, generously-sized teaser of the
 * article (cover, title, author + trust, and the opening rendered Markdown),
 * then funnels readers into a nostr app to read the rest.
 */
export default function ArticlePage() {
  const tierRing = useTierRing();
  const [, params] = useRoute("/a/:id");
  const naddr = (params?.id || "").replace(/^nostr:/, "");
  const ptr = useMemo(() => decodeNaddr(naddr), [naddr]);

  const articleQuery = useQuery({
    queryKey: ["article", naddr],
    queryFn: async () => {
      if (!ptr) return null;
      const map = await fetchAddressableEvents([ptr], ptr.relays);
      return map.get(`${ptr.kind}:${ptr.pubkey}:${ptr.identifier}`) ?? null;
    },
    enabled: !!ptr,
    staleTime: 5 * 60_000,
    retry: false,
  });

  const profileQuery = useQuery({
    queryKey: ["article-author", ptr?.pubkey],
    queryFn: async () => (ptr ? (await fetchProfile(ptr.pubkey)) ?? null : null),
    enabled: !!ptr?.pubkey,
    staleTime: 5 * 60_000,
    retry: false,
  });

  const trustQuery = useQuery({
    queryKey: ["article-author-trust", ptr?.pubkey],
    queryFn: () => (ptr ? apiClient.getHouseInfluence(ptr.pubkey) : null),
    enabled: !!ptr?.pubkey,
    staleTime: 5 * 60_000,
    retry: false,
  });

  const ev = articleQuery.data;
  const tag = (k: string) => ev?.tags.find((t) => t[0] === k)?.[1];
  const title = tag("title") || "Untitled article";
  const summary = tag("summary") || "";
  const image = tag("image");
  const profile = (profileQuery.data ?? {}) as { display_name?: string; name?: string; picture?: string; nip05?: string };
  const authorName = profile.display_name || profile.name || (ptr ? nip19.npubEncode(ptr.pubkey).slice(0, 12) + "…" : "Unknown");
  const authorNpub = ptr ? (() => { try { return npubFromPubkey(ptr.pubkey); } catch { return ""; } })() : "";
  const score01 = typeof trustQuery.data === "number" ? trustQuery.data : null;
  const loggedIn = hasSessionToken();
  const firstName = authorName.split(" ")[0];
  const [threadGated, setThreadGated] = useState(false);

  // NIP-22 comments on an article reference its addressable coordinate.
  const coord = ptr ? `${ptr.kind}:${ptr.pubkey}:${ptr.identifier}` : "";
  // Sign up / sign in from here → return to this article afterward.
  const here = typeof window !== "undefined" ? window.location.pathname : "";
  const funnelLoginHref = `/login?${[authorNpub ? `invite=${authorNpub}` : "", here ? `next=${encodeURIComponent(here)}` : ""].filter(Boolean).join("&")}`;

  useShareMeta(
    ev
      ? { title: `${title} — Brainstorm`, description: summary || `A long-form article by ${authorName}.`, image, url: typeof window !== "undefined" ? window.location.href : "" }
      : null,
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 dark:from-slate-950 to-white dark:to-slate-900">
      <PublicPageHeader
        maxWidthClass="max-w-3xl"
        actions={authorNpub ? (
          <Link href={`/p/${authorNpub}`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-link hover:underline">
            <ArrowLeft className="h-4 w-4" /> Profile
          </Link>
        ) : undefined}
      />

      <main className="mx-auto max-w-3xl px-4 sm:px-6 py-6 sm:py-10">
        {!ptr ? (
          <div className="text-center py-20">
            <FileText className="h-10 w-10 text-slate-300 dark:text-slate-600 mx-auto" />
            <p className="mt-3 text-slate-600 dark:text-slate-300 font-medium">That article link isn’t valid.</p>
            <Link href="/" className="mt-3 inline-block text-sm font-semibold text-brand-link hover:underline">Go to Brainstorm →</Link>
          </div>
        ) : articleQuery.isLoading ? (
          <div className="flex items-center justify-center py-24 text-slate-400 dark:text-slate-500">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : !ev ? (
          <div className="text-center py-20">
            <FileText className="h-10 w-10 text-slate-300 dark:text-slate-600 mx-auto" />
            <p className="mt-3 text-slate-600 dark:text-slate-300 font-medium">We couldn’t find this article on the relays.</p>
            <button
              type="button"
              onClick={() => openArticleInApp(naddr)}
              className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-brand-primary hover:bg-brand-primary-hover px-4 py-2 text-sm font-semibold text-white"
            >
              <Smartphone className="h-4 w-4" /> Try opening in an app
            </button>
          </div>
        ) : (
          <ShareNavProvider>
          <article>
            {image && (
              <img src={image} alt="" className="w-full max-h-80 object-cover rounded-2xl border border-slate-200 dark:border-slate-800" />
            )}
            <h1 className="mt-5 text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100" style={{ fontFamily: "var(--font-display)" }}>
              {title}
            </h1>
            {summary && <p className="mt-2 text-lg text-slate-500 dark:text-slate-400 leading-snug">{summary}</p>}

            {/* Author + trust + date */}
            <div className="mt-4 flex items-center gap-3 border-b border-slate-100 dark:border-slate-800/60 pb-5">
              <Link href={authorNpub ? `/p/${authorNpub}` : "#"} className="flex items-center gap-2.5 min-w-0 hover:opacity-80">
                <span className="relative shrink-0">
                  <Avatar className={`h-11 w-11 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 ${tierRing(score01) ?? ""}`}>
                    {profile.picture ? <AvatarImage src={profile.picture} alt={authorName} className="object-cover" /> : null}
                    <AvatarFallback className="rounded-full bg-brand-primary/15 text-brand-primary text-sm font-bold">{initialsFor(authorName)}</AvatarFallback>
                  </Avatar>
                  {typeof score01 === "number" && Number.isFinite(score01) && (
                    <VerificationCoin score01={score01} pov="global" size={20} className={tierRing(score01) ? "sr-only" : "absolute -bottom-1 -right-1 ring-2 ring-white dark:ring-slate-900 rounded-full"} />
                  )}
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">{authorName}</span>
                    <TierWordChip score01={score01} />
                    {profile.nip05 && <BadgeCheck className="h-4 w-4 text-sky-500 shrink-0" />}
                  </div>
                  <span className="text-xs text-slate-400 dark:text-slate-500">{publishedAgo(ev)}</span>
                </div>
              </Link>
            </div>

            {/* Full article body — Brainstorm is the reading destination. */}
            <div className="mt-6 prose prose-slate dark:prose-invert max-w-none prose-headings:font-bold prose-a:text-brand-link prose-img:rounded-xl" data-testid="article-body">
              <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]} components={mdComponents}>
                {ev.content || ""}
              </ReactMarkdown>
            </div>

            {/* Comments — teaser-gated for anon, trust-filterable for members (same as /e). */}
            {ev && (
              <EventThread eventId={ev.id} addressCoord={coord} authorNpub={authorNpub} relayHints={ptr?.relays ?? []} onGateChange={setThreadGated} />
            )}

            {/* More from this author — keep readers inside Brainstorm. */}
            {ptr?.pubkey && <MoreFromAuthor pubkey={ptr.pubkey} authorName={authorName} author={profile} relayHints={ptr?.relays ?? []} excludeId={ev?.id} />}

            {/* WoT signup funnel — hidden when the thread's own signup gate is
                showing, and hidden from SIGNED-IN users (it sells them what they
                already have). */}
            {!threadGated && !loggedIn && (
            <div className="mt-6 rounded-2xl border border-brand-accent/25 bg-gradient-to-br from-brand-deep/[0.04] to-brand-accent/[0.06] p-5 text-center" data-testid="article-funnel">
              <p className="text-base font-bold text-slate-900 dark:text-slate-100" style={{ fontFamily: "var(--font-display)" }}>Who can you trust online?</p>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300 max-w-md mx-auto">
                Brainstorm scores reputation from real human connections — no algorithm. See <span className="font-bold text-slate-900 dark:text-slate-100">{firstName}</span> and everyone else through your own network.
              </p>
              <Link
                href={loggedIn ? (authorNpub ? `/p/${authorNpub}?pov=mywot` : "/") : funnelLoginHref}
                className="mt-3 inline-flex items-center justify-center gap-1.5 rounded-xl bg-brand-primary hover:bg-brand-primary-hover px-5 py-2.5 text-sm font-semibold text-white transition-colors"
                data-testid="article-cta"
              >
                {loggedIn ? "See it through your network" : "Create your free account"} <ArrowRight className="h-4 w-4" />
              </Link>
              {!loggedIn && <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">Free, takes a minute — no email required</p>}
              {!loggedIn && (
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  Already part of the network? <Link href={funnelLoginHref} className="font-semibold text-brand-link hover:underline" data-testid="article-funnel-signin">Sign in →</Link>
                </p>
              )}
            </div>
            )}

            {/* Secondary escape hatch — open in a Nostr client to read/zap. */}
            <OpenInApp entity={{ kind: "article", bech32: naddr, uri: `nostr:${naddr}` }} className="mt-6" />
          </article>
          </ShareNavProvider>
        )}

        <div className="mt-10 text-center">
          <p className="text-xs text-slate-400 dark:text-slate-500">
            Read on <Link href="/" className="font-semibold text-brand-deep hover:underline">Brainstorm</Link> — trust, made visible.
          </p>
        </div>
      </main>
    </div>
  );
}
