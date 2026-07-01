import { useEffect, useMemo, useState } from "react";
import { useParams, Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Hash, ShieldCheck, Share2, Check, ExternalLink } from "lucide-react";
import { BrainLogo } from "@/components/BrainLogo";
import { PublicPageHeader } from "@/components/PublicPageHeader";
import { PageHeader } from "@/components/PageHeader";
import { ShareNavProvider } from "@/components/share/ShareNavContext";
import { ShareNoteCard } from "@/components/share/ShareNoteCard";
import { EmbeddedArticleCard } from "@/components/share/EmbeddedArticleCard";
import { searchContentByHashtag, rankHashtagEvents, type SortMode } from "@/lib/contentSearch";
import { fetchProfileMap } from "@/services/nostr";
import { getActivePreset, PRESET_THRESHOLDS, type TrustPreset } from "@/services/trustThreshold";
import { eventPath } from "@/lib/shareId";
import { mentionPubkeysFromContent, type MinimalEvent } from "@/lib/noteRefs";

const EMPTY = new Map<string, MinimalEvent>();

// Tag hygiene for the "related topics" row — mirror the profile "Posts about" rules.
const VALID_TAG = /^[\p{L}\p{N}][\p{L}\p{N} _-]*$/u;
const JUNK_TAG = new Set(["www", "com", "net", "org", "http", "https", "html", "co", "io"]);

const SORTS: { key: SortMode; label: string }[] = [
  { key: "top", label: "Top" },
  { key: "latest", label: "Latest" },
];
const PRESETS: { key: TrustPreset; label: string }[] = [
  { key: "relax", label: "Relax" },
  { key: "default", label: "Default" },
  { key: "strict", label: "Strict" },
];

/** Set/reset the document title + OG meta for shareable previews. */
function useHashtagMeta(tag: string) {
  useEffect(() => {
    const title = `#${tag} · Brainstorm`;
    const desc = `Trusted notes and articles tagged #${tag}, ranked by Web of Trust on Brainstorm.`;
    const prevTitle = document.title;
    document.title = title;
    const set = (sel: string, attr: string, val: string) => {
      const el = document.querySelector(sel);
      const prev = el?.getAttribute(attr) ?? null;
      el?.setAttribute(attr, val);
      return () => { if (prev != null) el?.setAttribute(attr, prev); };
    };
    const undo = [
      set('meta[name="description"]', "content", desc),
      set('meta[property="og:title"]', "content", title),
      set('meta[property="og:description"]', "content", desc),
    ];
    return () => { document.title = prevTitle; undo.forEach((u) => u()); };
  }, [tag]);
}

/** Segmented pill control (tabs style), matching the rest of the app. */
function Segmented<T extends string>({ value, options, onChange, testId }: {
  value: T; options: { key: T; label: string }[]; onChange: (v: T) => void; testId?: string;
}) {
  return (
    <div className="inline-flex rounded-full bg-slate-100 p-0.5" data-testid={testId}>
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => onChange(o.key)}
          aria-pressed={value === o.key}
          className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
            value === o.key ? "bg-white text-[#3730a3] shadow-sm" : "text-slate-500 hover:text-slate-700"
          }`}
          data-testid={`${testId}-${o.key}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export default function HashtagPage() {
  const params = useParams();
  const [, navigate] = useLocation();
  const tag = (params.tag || "").toLowerCase().replace(/^#/, "").trim();
  useHashtagMeta(tag);

  const [sort, setSort] = useState<SortMode>("top");
  const [preset, setPreset] = useState<TrustPreset>(() => getActivePreset());
  const [copied, setCopied] = useState(false);

  const contentQuery = useQuery({
    queryKey: ["hashtag-content", tag],
    queryFn: () => searchContentByHashtag(tag),
    enabled: !!tag,
    staleTime: 60_000,
  });

  const candidates = contentQuery.data?.events ?? [];
  const scores = useMemo(() => contentQuery.data?.scores ?? new Map<string, number>(), [contentQuery.data]);
  const candidateCount = contentQuery.data?.candidateCount ?? 0;

  // Page-local filter + sort: strictness (threshold) and Top/Latest re-apply instantly.
  const events = useMemo(
    () => rankHashtagEvents(candidates, scores, PRESET_THRESHOLDS[preset], sort),
    [candidates, scores, preset, sort],
  );
  const voiceCount = useMemo(() => new Set(events.map((e) => e.pubkey)).size, [events]);

  // Related topics: hashtags co-occurring in the trusted results.
  const relatedTopics = useMemo(() => {
    const counts = new Map<string, number>();
    for (const ev of events) {
      for (const t of ev.tags) {
        if (t[0] !== "t" || !t[1]) continue;
        const other = t[1].toLowerCase().replace(/^#/, "").trim();
        if (other === tag || other.length < 2 || other.length > 22 || !VALID_TAG.test(other) || JUNK_TAG.has(other)) continue;
        counts.set(other, (counts.get(other) || 0) + 1);
      }
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([t]) => t);
  }, [events, tag]);

  // Profiles for authors + everyone @-mentioned / p-tagged in the visible feed.
  const refPubkeys = useMemo(() => {
    const set = new Set<string>();
    for (const ev of events) {
      set.add(ev.pubkey);
      mentionPubkeysFromContent(ev.content || "").forEach((pk) => set.add(pk));
      for (const t of ev.tags) if (t[0] === "p" && t[1]) set.add(t[1]);
    }
    return [...set];
  }, [events]);
  const profilesQuery = useQuery({
    queryKey: ["hashtag-profiles", refPubkeys.join(",")],
    queryFn: () => fetchProfileMap(refPubkeys),
    enabled: refPubkeys.length > 0,
    staleTime: 5 * 60_000,
  });
  const profiles = profilesQuery.data ?? new Map();

  const loading = contentQuery.isLoading;
  const shareUrl = typeof window !== "undefined" ? `${window.location.origin}/t/${tag}` : "";
  const onShare = async () => {
    try {
      if (navigator.share) { await navigator.share({ title: `#${tag} · Brainstorm`, url: shareUrl }); return; }
    } catch { /* user cancelled */ return; }
    try { await navigator.clipboard.writeText(shareUrl); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* ignore */ }
  };
  const clientLinks = [
    { name: "Primal", href: `https://primal.net/search/${encodeURIComponent(`#${tag}`)}` },
    { name: "nostr.band", href: `https://nostr.band/?q=${encodeURIComponent(`#${tag}`)}` },
  ];

  return (
    <ShareNavProvider>
      <div className="min-h-screen bg-[#F8FAFC] text-slate-900 font-sans flex flex-col">
        <PublicPageHeader
          maxWidthClass="max-w-2xl"
          actions={
            <button
              type="button"
              onClick={onShare}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50"
              data-testid="hashtag-share"
            >
              {copied ? <><Check className="h-4 w-4 text-emerald-600" /> Copied</> : <><Share2 className="h-4 w-4" /> Share</>}
            </button>
          }
        />

        <main className="w-full max-w-2xl mx-auto px-4 sm:px-6 py-8 flex-1" data-testid="hashtag-page">
          <PageHeader
            kicker="Topic"
            title={<><Hash className="inline-block h-7 w-7 -mt-1 text-[#7c86ff]" />{tag}</>}
            subtitle="Trusted notes and articles on this topic — ranked by Web of Trust, spam filtered out."
          />

          {/* Related topics */}
          {relatedTopics.length > 0 && (
            <div className="mt-6 flex flex-wrap items-center gap-2" data-testid="hashtag-related">
              <span className="text-[11px] font-mono font-semibold uppercase tracking-[0.2em] text-[#7c86ff]">Related</span>
              {relatedTopics.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => navigate(`/t/${encodeURIComponent(t)}`)}
                  className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-200"
                  data-testid={`hashtag-related-${t}`}
                >
                  #{t}
                </button>
              ))}
            </div>
          )}

          {/* Controls: sort + strictness + count */}
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4" data-testid="hashtag-controls">
            <div className="flex flex-wrap items-center gap-2">
              <Segmented value={sort} options={SORTS} onChange={setSort} testId="hashtag-sort" />
              <Segmented value={preset} options={PRESETS} onChange={setPreset} testId="hashtag-strictness" />
            </div>
            {!loading && (
              <p className="text-xs text-slate-400" data-testid="hashtag-count">
                {events.length} trusted post{events.length !== 1 ? "s" : ""} · {voiceCount} voice{voiceCount !== 1 ? "s" : ""}
              </p>
            )}
          </div>

          <div className="mt-6 space-y-4">
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" data-testid="hashtag-skeleton">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-full bg-slate-100 animate-pulse" />
                    <div className="h-3 w-32 rounded bg-slate-100 animate-pulse" />
                  </div>
                  <div className="mt-3 h-3 w-full rounded bg-slate-100 animate-pulse" />
                  <div className="mt-2 h-3 w-3/4 rounded bg-slate-100 animate-pulse" />
                </div>
              ))
            ) : events.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white px-6 py-12 text-center shadow-sm" data-testid="hashtag-empty">
                <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-[#7c86ff]/10 border border-[#7c86ff]/20 text-[#333286]">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <p className="text-sm font-semibold text-slate-900">
                  {candidateCount > 0 && preset !== "relax" ? `Nothing at this strictness for #${tag}` : `No trusted content for #${tag} yet`}
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  {candidateCount > 0 && preset !== "relax"
                    ? "Try loosening the trust filter to Relax to see more."
                    : "We only show posts from accounts with Web-of-Trust standing, so spam doesn't make the cut."}
                </p>
                {candidateCount > 0 && preset !== "relax" && (
                  <button type="button" onClick={() => setPreset("relax")} className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-[#6366f1] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#4f46e5]" data-testid="hashtag-relax">
                    Loosen to Relax
                  </button>
                )}
              </div>
            ) : (
              events.map((ev) =>
                ev.kind === 30023 ? (
                  <EmbeddedArticleCard key={ev.id} event={ev as MinimalEvent} author={profiles.get(ev.pubkey)} />
                ) : (
                  <div key={ev.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <ShareNoteCard event={ev as MinimalEvent} profiles={profiles} eventsById={EMPTY} href={eventPath(ev)} showAuthor authorScore={scores.get(ev.pubkey)} />
                  </div>
                ),
              )
            )}
          </div>

          {/* Cross-client: no universal hashtag deep-link, so link the clients that have one. */}
          {!loading && events.length > 0 && (
            <div className="mt-10 border-t border-slate-200 pt-6" data-testid="hashtag-openin">
              <p className="text-[11px] font-mono font-semibold uppercase tracking-[0.2em] text-slate-400">Explore #{tag} elsewhere</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {clientLinks.map((c) => (
                  <a
                    key={c.name}
                    href={c.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 transition-colors hover:border-[#7c86ff]/50"
                    data-testid={`hashtag-client-${c.name}`}
                  >
                    {c.name} <ExternalLink className="h-3.5 w-3.5 text-slate-400" />
                  </a>
                ))}
              </div>
            </div>
          )}
        </main>
      </div>
    </ShareNavProvider>
  );
}
