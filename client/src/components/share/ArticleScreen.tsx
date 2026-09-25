import { memo, useMemo, useState, type ReactNode } from "react";
import type { NoteToken } from "@/lib/noteContent";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import ReactMarkdown, { defaultUrlTransform, type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import { extractBech32FromUrl } from "@/lib/noteContent";
import { clientRef } from "@/lib/clientLinks";
import { ClientLink } from "@/components/share/ClientLink";
import { NostrRef } from "@/components/share/NostrRef";
import { VideoEmbed, videoEmbedFor } from "@/components/share/VideoEmbed";
import { LinkChip } from "@/components/share/LinkPreview";
import { nip19 } from "nostr-tools";
import { ArrowRight, ExternalLink } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { VerificationCoin, useTierRing, TierWordChip, useCoinReplacedByRing } from "@/components/score/VerificationCoin";
import { fetchProfile } from "@/services/nostr";
import { apiClient } from "@/services/api";
import { npubFromPubkey } from "@/lib/shareId";
import { sourceAppFor } from "@/lib/sourceApp";
import { articleSummary, wikiToMarkdown } from "@/lib/wiki";
import { prepareArticleBody } from "@/lib/articleBody";
import { htmlToText, looksLikeHtml, stripStrayHtml } from "@/lib/htmlText";
import { ReadingText } from "@/components/share/ReadingText";
import { Chip } from "@/components/ui/chip";
import { KindPill } from "@/components/ui/kind-pill";
import { specKindTags } from "@/lib/kindLabel";
import { initialsFor } from "@/lib/profileDefaults";
import { useShareMeta } from "@/hooks/useShareMeta";
import { EventThread } from "@/components/share/EventThread";
import { EntityMenu } from "@/components/share/EntityMenu";
import { TechnicalStrip } from "@/components/share/TechnicalStrip";
import { ShareButton } from "@/components/share/ShareButton";
import { MoreFromAuthor } from "@/components/share/MoreFromAuthor";
import { ShareNavProvider } from "@/components/share/ShareNavContext";
import { PublicPageHeader } from "@/components/PublicPageHeader";
import { useHasSession } from "@/hooks/useHasSession";
import { useConnectionSpeed, videoPreload } from "@/lib/connection";
import { Nip05Check } from "@/components/Nip05Check";


const IMG_RE = /\.(png|jpe?g|gif|webp|avif|bmp|svg)(\?.*)?$/i;
const VID_RE = /\.(mp4|webm|mov|m4v|ogv)(\?.*)?$/i;

/**
 * Custom Markdown renderers so a long-form body reads like a top-tier client,
 * not a wall of raw links: a hosted-video URL becomes an inline player, a bare
 * media URL becomes an inline image / <video>, any other bare URL becomes a
 * tidy favicon chip, and a genuinely-labelled link keeps its text but styled.
 * Articles keep chips; title/description/image cards are for notes
 * (LinkPreviewCard).
 */
function InAppLink({ href, children }: { href: string; children?: React.ReactNode }) {
  const [, navigate] = useLocation();
  return (
    <a
      href={href}
      onClick={(e) => {
        e.preventDefault();
        navigate(href);
      }}
      className="font-medium text-brand-link underline decoration-brand-link/40 underline-offset-2 hover:decoration-brand-link"
      data-testid="article-wikilink"
    >
      {children}
    </a>
  );
}

function ArticleVideo({ url }: { url: string }) {
  const speed = useConnectionSpeed();
  return <video src={url} controls playsInline preload={videoPreload(speed)} className="my-3 block w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-900" />;
}

/** Markdown's sanitizer, taught that a `nostr:` link is a link. */
const SANITIZE_SCHEMA = {
  ...defaultSchema,
  protocols: { ...defaultSchema.protocols, href: [...(defaultSchema.protocols?.href ?? []), "nostr"] },
};

/** Markdown's own URL filter drops schemes it does not know; a `nostr:` link is a link. */
const keepNostrUrls = (url: string) => (url.startsWith("nostr:") ? url : defaultUrlTransform(url));

/** A bare `nostr:` reference in prose, made a link so markdown hands it to the renderer below. */
const BARE_NOSTR_URI = /(?<![\w[(`/:])(nostr:(?:npub|nprofile|note|nevent|naddr)1[02-9ac-hj-np-z]+)/gi;
export function linkNostrUris(markdown: string): string {
  return markdown.replace(BARE_NOSTR_URI, "[$1]($1)");
}

/** A link that renders as a thing — a person, a note, an article — rather than as a link. */
function embedFor(url: string): React.ReactNode | null {
  if (url.startsWith("nostr:")) return <NostrRef bech32={url.slice("nostr:".length)} />;
  const bech = extractBech32FromUrl(url);
  if (bech) return <NostrRef bech32={bech} url={url} />;
  if (clientRef(url)) return <ClientLink url={url} />;
  return null;
}

/** The hast paragraph's only content is one bare link that renders as a card. */
function paragraphIsEmbed(node: { children?: { type: string; tagName?: string; value?: string; properties?: { href?: unknown }; children?: { value?: string }[] }[] } | undefined): boolean {
  const kids = (node?.children ?? []).filter((c) => !(c.type === "text" && !(c.value ?? "").trim()));
  if (kids.length !== 1 || kids[0].tagName !== "a") return false;
  const href = typeof kids[0].properties?.href === "string" ? kids[0].properties.href : "";
  const text = (kids[0].children ?? []).map((c) => c.value ?? "").join("").trim();
  return !!href && text === href && (href.startsWith("nostr:") || !!extractBech32FromUrl(href) || !!clientRef(href));
}

const mdComponents: Components = {
  // A paragraph that is only a card is not a paragraph: no <p> around a <div>.
  p({ node, children }) {
    return paragraphIsEmbed(node as Parameters<typeof paragraphIsEmbed>[0]) ? <div className="not-prose my-3">{children}</div> : <p>{children}</p>;
  },
  a({ href, children }) {
    const url = typeof href === "string" ? href : "";
    // A link into Brainstorm itself (a wiki topic's articles search) stays here.
    if (url.startsWith("/")) return <InAppLink href={url}>{children}</InAppLink>;
    const text = Array.isArray(children) ? children.map((c) => (typeof c === "string" ? c : "")).join("") : String(children ?? "");
    const bare = !!url && text.trim() === url.trim(); // an autolinked bare URL, not [label](url)
    // A reference to a person, a note or an article is that thing, not a link.
    if (bare) {
      const embed = embedFor(url);
      if (embed) return embed;
    }
    if (url && videoEmbedFor(url)) return <VideoEmbed url={url} />;
    if (url && bare && VID_RE.test(url)) {
      return <ArticleVideo url={url} />;
    }
    if (url && bare && IMG_RE.test(url)) {
      return <img src={url} alt="" loading="lazy" className="my-3 block max-h-[34rem] w-full rounded-xl border border-slate-200 dark:border-slate-800 object-contain" />;
    }
    if (url && bare) return <LinkChip url={url} />;
    return <a href={url || undefined} target="_blank" rel="noopener" className="font-medium text-brand-link underline decoration-brand-link/40 underline-offset-2 hover:decoration-brand-link">{children}</a>;
  },
};

/** The markdown reader's embeds, for an article read as text: a YouTube or
 *  Vimeo link plays in place, a video file preloads by connection, a bare
 *  link is a chip. Everything else renders as ReadingText's own. */
function articleEmbed(t: NoteToken, key: string): ReactNode | undefined {
  if (t.type === "mention") return <NostrRef key={key} bech32={t.bech32} url={t.url} />;
  if (t.type !== "url" && t.type !== "video") return undefined;
  if (t.type === "url" && clientRef(t.value)) return <ClientLink key={key} url={t.value} />;
  if (videoEmbedFor(t.value)) return <VideoEmbed key={key} url={t.value} />;
  if (t.type === "video") return <ArticleVideo key={key} url={t.value} />;
  return <LinkChip key={key} url={t.value} />;
}

/** Module-level, so the memoized body below sees the same plugins every render. */
const REMARK_PLUGINS = [remarkGfm];
// The sanitizer keeps `nostr:` links (SANITIZE_SCHEMA above) — feat/client-links-native.
const REHYPE_PLUGINS: import("unified").PluggableList = [[rehypeSanitize, SANITIZE_SCHEMA]];

/**
 * The article's text, rendered — and only re-rendered when the text changes.
 *
 * Parsing is the expensive part of this page: remark, GFM and sanitize over
 * the whole article. The screen around it re-renders as its author's profile,
 * trust score, comments and newer versions land; none of those change the
 * body, so none of them should parse it again.
 */
export const ArticleBody = memo(function ArticleBody({ body, fromHtml }: { body: string; fromHtml: boolean }) {
  return !fromHtml && isMarkdown(body) ? (
    // `nostr:` references stay links (the sanitizer would strip the scheme), and
    // bare ones in the text are linked first — feat/client-links-native.
    <ReactMarkdown remarkPlugins={REMARK_PLUGINS} rehypePlugins={REHYPE_PLUGINS} urlTransform={keepNostrUrls} components={mdComponents}>
      {linkNostrUris(body)}
    </ReactMarkdown>
  ) : (
    // Plain text: markdown would fold its single line breaks into
    // one paragraph; the reading renderer keeps them.
    <ReadingText text={body} normalized size="post" headline={false} media embed={articleEmbed} className="not-prose" />
  );
});

/** Written in markdown, not plain text: enough of its syntax to count. */
export function isMarkdown(text: string): boolean {
  const lines = text.split("\n");
  let n = lines.filter((l) => /^\s{0,3}(?:#{1,6} |[-*+] |\d+\. |> |```|\|.*\|)/.test(l) || /^\s*(?:={3,}|-{3,})\s*$/.test(l)).length;
  n += (text.match(/\[[^\]\n]+\]\([^)\s]+\)|\*\*[^*\n]+\*\*|__[^_\n]+__|`[^`\n]+`/g) ?? []).length;
  // Markdown's quieter marks: "\" line breaks, \_ escapes, <https://…> links.
  n += (text.match(/\\\n|\\[_*`#[\]()!]|<https?:\/\/[^>\s]+>/g) ?? []).length;
  return n >= 2;
}

export type AddressPointer = { kind: number; pubkey: string; identifier: string; relays?: string[] };

export function decodeNaddr(raw: string): AddressPointer | null {
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
export type ArticleEvent = { id: string; kind: number; pubkey: string; created_at: number; content: string; tags: string[][]; sig?: string };

/** The article layout's page: header, column, footer. */
export function ArticleShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 dark:from-slate-950 to-white dark:to-slate-900">
      <PublicPageHeader
        maxWidthClass="max-w-3xl"
        actions={<ShareButton url={typeof window !== "undefined" ? window.location.href : ""} title={title} />}
      />
      <main className="mx-auto max-w-3xl px-4 sm:px-6 py-6 sm:py-10">
        {children}
        <div className="mt-10 text-center">
          <p className="text-xs text-slate-400 dark:text-slate-500">
            Read on <Link href="/" className="font-semibold text-brand-deep hover:underline">Brainstorm</Link> — trust, made visible.
          </p>
        </div>
      </main>
    </div>
  );
}

/**
 * An article, wiki page or spec, read in full — from an `naddr` (the
 * address's latest version) or a `nevent` (one exact version).
 */
export function ArticleScreen({ ev, naddr, ptr }: { ev: ArticleEvent; naddr: string; ptr: AddressPointer }) {
  const tierRing = useTierRing();
  const coinReplaced = useCoinReplacedByRing();

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

  // Where this piece lives, when an app we know published it (a zap.cooking recipe).
  const sourceApp = ev ? sourceAppFor(ev) : null;
  const tag = (k: string) => ev?.tags.find((t) => t[0] === k)?.[1];
  const title = tag("title") || "Untitled article";
  // The page shows the title above the byline; a spec's `# Title` and its
  // `draft` `optional` status line leave the body and read as themselves.
  // Whatever the text came in: AsciiDoc (wiki) as markdown, HTML converted,
  // stray HTML in markdown cleaned.
  const source = useMemo(() => (ev ? (ev.kind === 30818 ? wikiToMarkdown(ev.content || "") : ev.content || "") : ""), [ev]);
  // HTML converted to text is text: its decoded "<div>" and "2*3*4" must
  // not be read again as markdown, so it goes to the reading renderer.
  const fromHtml = useMemo(() => looksLikeHtml(source), [source]);
  const prepared = useMemo(
    () => prepareArticleBody(fromHtml ? htmlToText(source) : stripStrayHtml(source), title, { identifier: tag("d") }),
    [source, fromHtml, title], // eslint-disable-line react-hooks/exhaustive-deps
  );
  // The kinds a spec covers: the `k` tags and the front matter, one list, each
  // wearing the name its author gave it — a number alone tells a reader nothing.
  const coveredKinds = useMemo(() => {
    if (ev?.kind !== 30817) return [] as { kind: string; label?: string }[];
    const byKind = new Map<string, string | undefined>(specKindTags(ev).map((k) => [k.kind, k.label]));
    for (const k of prepared.kinds) byKind.set(k.kind, k.label ?? byKind.get(k.kind));
    // In order, however the author tagged them.
    return [...byKind.entries()].map(([kind, label]) => ({ kind, label })).sort((a, b) => Number(a.kind) - Number(b.kind));
  }, [ev, prepared.kinds]);
  // The author's summary, never a publisher's placeholder ("No description available").
  const summary = ev ? articleSummary(ev) : "";
  // A summary that is nothing but a link to a note or an article (Geyser
  // publishes an "article" for a shared Primal link: title the host, summary
  // the link, body empty) is that thing, shown where the summary would be —
  // unless the body is the same link, which already shows it.
  const summaryEntity = /^\S+$/.test(summary) ? (summary.startsWith("nostr:") ? summary.slice("nostr:".length) : extractBech32FromUrl(summary)) : null;
  const summaryEmbed = summaryEntity && prepared.body.trim() !== summary.trim() ? summaryEntity : null;
  // A wiki page mirrored from elsewhere names its source in an "s" tag
  // (GitCitadel: the Wikipedia URL). Attribution is owed, and one line does it.
  const sourceUrl = ev?.kind === 30818 && /^https?:\/\//.test(tag("s") || "") ? tag("s")! : "";
  const sourceName = (() => {
    try {
      const host = new URL(sourceUrl).hostname.replace(/^www\./, "");
      return /(^|\.)wikipedia\.org$/.test(host) ? "Wikipedia" : host;
    } catch {
      return "";
    }
  })();
  const image = tag("image");
  const profile = (profileQuery.data ?? {}) as { display_name?: string; name?: string; picture?: string; nip05?: string };
  const authorName = profile.display_name || profile.name || (ptr ? nip19.npubEncode(ptr.pubkey).slice(0, 12) + "…" : "Unknown");
  const authorNpub = ptr ? (() => { try { return npubFromPubkey(ptr.pubkey); } catch { return ""; } })() : "";
  const score01 = typeof trustQuery.data === "number" ? trustQuery.data : null;
  const loggedIn = useHasSession();
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
    <ArticleShell title={`${title} — Brainstorm`}>
          <ShareNavProvider>
          <article>
            {image && (
              <img src={image} alt="" className="w-full max-h-80 object-cover rounded-2xl border border-slate-200 dark:border-slate-800" />
            )}
            {/* A spec says so before its title (Benjamin, 2026-09-24: only a spec —
                an essay, a wiki page or a recipe looks like what it is). */}
            <KindPill event={ev} mixed={ev.kind === 30817} className="mt-5" />
            <h1 className="mt-2 text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100" style={{ fontFamily: "var(--font-display)" }}>
              {title}
            </h1>
            {summaryEmbed ? (
              <div className="mt-3" data-testid="article-summary"><NostrRef bech32={summaryEmbed} url={summary} /></div>
            ) : summary ? (
              <p className="mt-2 text-lg text-slate-500 dark:text-slate-400 leading-snug" data-testid="article-summary">{summary}</p>
            ) : null}
            {/* A spec's details, read out of its front matter and tags: its
                standing, the kinds it defines (each a search for that kind),
                and the tags it defines. */}
            {(prepared.status.length > 0 || coveredKinds.length > 0 || prepared.tags.length > 0) && (
              <div className="mt-4 space-y-2 text-sm" data-testid="article-details">
                {prepared.status.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5" data-testid="article-status">
                    <span className="mr-1 font-mono text-[11px] uppercase tracking-wider text-slate-400 dark:text-slate-500">Status</span>
                    {prepared.status.map((s) => (
                      <Chip key={s} tone="slate" size="sm">{s}</Chip>
                    ))}
                  </div>
                )}
                {coveredKinds.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5" data-testid="article-kinds">
                    <span className="mr-1 font-mono text-[11px] uppercase tracking-wider text-slate-400 dark:text-slate-500">Kinds</span>
                    {coveredKinds.map(({ kind, label }) => (
                      <Link
                        key={kind}
                        href={`/?t=nips&q=${encodeURIComponent(`kind:${kind}`)}`}
                        title={`Specs that cover kind ${kind}`}
                        className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-700 transition-colors hover:border-brand-accent/40 hover:text-brand-deep dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:text-brand-link"
                        data-testid={`article-kind-${kind}`}
                      >
                        <span className="font-mono">{kind}</span>
                        {label && <span className="text-slate-500 dark:text-slate-400">{label}</span>}
                      </Link>
                    ))}
                  </div>
                )}
                {prepared.tags.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5" data-testid="article-tags">
                    <span className="mr-1 font-mono text-[11px] uppercase tracking-wider text-slate-400 dark:text-slate-500">Tags</span>
                    {prepared.tags.map((t) => (
                      <span key={t.name} className="inline-flex items-center gap-1.5 rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                        <span className="font-mono">{t.name}</span>
                        {t.label && <span className="text-slate-500 dark:text-slate-400">{t.label}</span>}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
            {sourceUrl && sourceName && (
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400" data-testid="article-source">
                Mirrored from{" "}
                <a href={sourceUrl} target="_blank" rel="noopener" className="font-medium text-brand-link hover:underline">
                  {sourceName}
                </a>
              </p>
            )}

            {/* Author + trust + date — and the ⋯, on the object it acts on. */}
            <div className="mt-4 flex items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800/60 pb-5">
              <Link href={authorNpub ? `/p/${authorNpub}` : "#"} className="flex items-center gap-2.5 min-w-0 hover:opacity-80">
                <span className="relative shrink-0">
                  <Avatar className={`h-11 w-11 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 ${tierRing(score01) ?? ""}`}>
                    {profile.picture ? <AvatarImage src={profile.picture} alt={authorName} className="object-cover" /> : null}
                    <AvatarFallback className="rounded-full bg-brand-primary/15 text-brand-primary text-sm font-bold">{initialsFor(authorName)}</AvatarFallback>
                  </Avatar>
                  {typeof score01 === "number" && Number.isFinite(score01) && (
                    <VerificationCoin score01={score01} pov="global" size={20} className={tierRing(score01) && coinReplaced ? "sr-only" : "absolute -bottom-1 -right-1 ring-2 ring-white dark:ring-slate-900 rounded-full"} />
                  )}
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">{authorName}</span>
                    <TierWordChip score01={score01} />
                    <Nip05Check nip05={profile.nip05} pubkey={ev.pubkey} className="h-4 w-4 text-sky-500 shrink-0" />
                  </div>
                  <span className="text-xs text-slate-400 dark:text-slate-500">{publishedAgo(ev)}</span>
                </div>
              </Link>
              <div className="flex shrink-0 items-center gap-2">
                {/* The app that published this piece — a recipe's home on
                    zap.cooking — is the primary way out, named. Other clients
                    stay behind the ⋯: Brainstorm is the destination. */}
                {sourceApp && (
                  <a
                    href={sourceApp.url}
                    target="_blank"
                    rel="noopener"
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-100 transition-colors hover:border-brand-accent/40"
                    title={`Opens ${sourceApp.host} in a new tab`}
                    data-testid="article-source-app"
                  >
                    <img src={sourceApp.icon} alt="" className="h-3.5 w-3.5 rounded-sm" /> Open in {sourceApp.name} <ExternalLink className="h-3 w-3 text-slate-400" />
                  </a>
                )}
                {ptr && (
                  <EntityMenu
                    entity={{ kind: "article", eventKind: ev.kind, bech32: naddr, uri: `nostr:${naddr}` }}
                    copies={[{ id: "naddr", label: "Copy naddr", value: naddr, hint: "The article's address, for Nostr apps" }]}
                    triggerTestId="article-menu"
                  />
                )}
              </div>
            </div>
            {/* The technical view's line: kind, ids, a click to copy. Nothing with it off. */}
            <TechnicalStrip event={ev} ids={naddr ? [{ label: "naddr", value: naddr }] : []} className="mt-2" />

            {/* Full article body — Brainstorm is the reading destination. */}
            {/* Inline code wears no decorative backticks (the typography plugin's
                default) and wraps — a spec's example URIs used to push the page sideways. */}
            <div className="article-prose mt-6 prose prose-slate dark:prose-invert max-w-none prose-headings:font-bold prose-a:text-brand-link prose-img:rounded-xl prose-code:before:content-none prose-code:after:content-none prose-pre:overflow-x-auto" data-testid="article-body">
              <ArticleBody body={prepared.body} fromHtml={fromHtml} />
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
          </article>
          </ShareNavProvider>
    </ArticleShell>
  );
}
