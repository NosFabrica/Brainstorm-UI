import { useMemo } from "react";
import { useRoute, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import { nip19 } from "nostr-tools";
import { ArrowLeft, BadgeCheck, Smartphone, Loader2, FileText } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { tierForScore } from "@/components/share/TrustScoreBadge";
import { fetchAddressableEvents, fetchProfile } from "@/services/nostr";
import { apiClient } from "@/services/api";
import { openArticleInApp } from "@/lib/articleLinks";
import { npubFromPubkey } from "@/lib/shareId";
import { initialsFor } from "@/lib/profileDefaults";
import { useShareMeta } from "@/hooks/useShareMeta";
import { BrainLogo } from "@/components/BrainLogo";

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
    queryFn: () => (ptr ? fetchProfile(ptr.pubkey) : null),
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
  const tier = score01 != null ? tierForScore(score01) : null;

  useShareMeta(
    ev
      ? { title: `${title} — Brainstorm`, description: summary || `A long-form article by ${authorName}.`, image, url: typeof window !== "undefined" ? window.location.href : "" }
      : null,
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      {/* Top bar */}
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/80 backdrop-blur">
        <div className="mx-auto max-w-3xl flex items-center justify-between px-4 sm:px-6 h-14">
          <Link href="/" className="flex items-center gap-2">
            <BrainLogo size={26} className="text-indigo-500" />
            <span className="text-lg font-bold text-slate-900" style={{ fontFamily: "var(--font-display)" }}>Brainstorm</span>
          </Link>
          {authorNpub && (
            <Link href={`/p/${authorNpub}`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#3730a3] hover:underline">
              <ArrowLeft className="h-4 w-4" /> Profile
            </Link>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 sm:px-6 py-6 sm:py-10">
        {!ptr ? (
          <div className="text-center py-20">
            <FileText className="h-10 w-10 text-slate-300 mx-auto" />
            <p className="mt-3 text-slate-600 font-medium">That article link isn’t valid.</p>
            <Link href="/" className="mt-3 inline-block text-sm font-semibold text-[#3730a3] hover:underline">Go to Brainstorm →</Link>
          </div>
        ) : articleQuery.isLoading ? (
          <div className="flex items-center justify-center py-24 text-slate-400">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : !ev ? (
          <div className="text-center py-20">
            <FileText className="h-10 w-10 text-slate-300 mx-auto" />
            <p className="mt-3 text-slate-600 font-medium">We couldn’t find this article on the relays.</p>
            <button
              type="button"
              onClick={() => openArticleInApp(naddr)}
              className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-[#3730a3] hover:bg-[#312e81] px-4 py-2 text-sm font-semibold text-white"
            >
              <Smartphone className="h-4 w-4" /> Try opening in an app
            </button>
          </div>
        ) : (
          <article>
            {image && (
              <img src={image} alt="" className="w-full max-h-80 object-cover rounded-2xl border border-slate-200" />
            )}
            <h1 className="mt-5 text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900" style={{ fontFamily: "var(--font-display)" }}>
              {title}
            </h1>
            {summary && <p className="mt-2 text-lg text-slate-500 leading-snug">{summary}</p>}

            {/* Author + trust + date */}
            <div className="mt-4 flex items-center gap-3 border-b border-slate-100 pb-5">
              <Link href={authorNpub ? `/p/${authorNpub}` : "#"} className="flex items-center gap-2.5 min-w-0 hover:opacity-80">
                <Avatar className="h-10 w-10 rounded-full bg-white border border-slate-200">
                  {profile.picture ? <AvatarImage src={profile.picture} alt={authorName} className="object-cover" /> : null}
                  <AvatarFallback className="rounded-full bg-indigo-100 text-indigo-700 text-sm font-bold">{initialsFor(authorName)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-bold text-slate-900 truncate">{authorName}</span>
                    {profile.nip05 && <BadgeCheck className="h-4 w-4 text-sky-500 shrink-0" />}
                  </div>
                  <span className="text-xs text-slate-400">{publishedAgo(ev)}</span>
                </div>
              </Link>
              {tier && (
                <span
                  className="ml-auto shrink-0 inline-flex items-center gap-1.5 rounded-full border pl-1.5 pr-2.5 py-1 text-[11px] font-bold uppercase tracking-wide"
                  style={{ color: tier.color, backgroundColor: `${tier.color}14`, borderColor: `${tier.color}55` }}
                  title="Network web-of-trust score"
                >
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: tier.color }} />
                  {tier.name} · {Math.round((score01 ?? 0) * 100)}
                </span>
              )}
            </div>

            {/* Generously-sized teaser of the rendered body, then a fade + funnel. */}
            <div className="relative mt-6 max-h-[34rem] overflow-hidden" data-testid="article-body">
              <div className="prose prose-slate max-w-none prose-headings:font-bold prose-a:text-[#3730a3] prose-img:rounded-xl">
                <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
                  {ev.content || ""}
                </ReactMarkdown>
              </div>
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-white via-white/90 to-transparent" />
            </div>

            {/* Continue-reading funnel — open in a nostr app (never njump). */}
            <div className="mt-2 rounded-2xl border border-[#7c86ff]/25 bg-gradient-to-br from-[#333286]/[0.04] to-[#7c86ff]/[0.06] p-5 text-center" data-testid="article-funnel">
              <p className="text-base font-bold text-slate-900" style={{ fontFamily: "var(--font-display)" }}>Keep reading</p>
              <p className="mt-1 text-sm text-slate-600 max-w-md mx-auto">Open the full article in a nostr app to read it end to end.</p>
              <button
                type="button"
                onClick={() => openArticleInApp(naddr)}
                className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-[#3730a3] hover:bg-[#312e81] px-5 py-2.5 text-sm font-semibold text-white transition-colors"
                data-testid="article-open-app"
              >
                <Smartphone className="h-4 w-4" /> Open in an app
              </button>
              <p className="mt-2 text-[11px] text-slate-400">Android installs Amethyst · everywhere else opens Nostria</p>
            </div>
          </article>
        )}

        <div className="mt-10 text-center">
          <p className="text-xs text-slate-400">
            Read on <Link href="/" className="font-semibold text-[#333286] hover:underline">Brainstorm</Link> — trust, made visible.
          </p>
        </div>
      </main>
    </div>
  );
}
