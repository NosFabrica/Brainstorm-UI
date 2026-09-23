/**
 * Fountain (fountain.fm) episodes and tracks, read for a card that plays.
 *
 * Probed 2026-09-04: a Fountain page carries everything in Open Graph —
 * `og:title` as "Show • Episode • Listen on Fountain" (tracks: "Artist •
 * Title • …"), `og:description`, `og:image`, and the mp3 itself as
 * `og:audio` — and fountain.fm answers the browser with an open CORS header,
 * so the page is readable client-side. No proxy, no API key: one fetch of the
 * page, once, and the card has its artwork, its words and its audio.
 */
import { useEffect, useState } from "react";

export type FountainKind = "episode" | "track" | "show" | "live";

export interface FountainItem {
  kind: FountainKind;
  id: string;
  /** The show for an episode, the artist for a track. */
  show: string | null;
  title: string;
  description: string | null;
  image: string | null;
  audio: string;
  url: string;
}

export function fountainRef(url: string): { kind: FountainKind; id: string } | null {
  try {
    const u = new URL(url);
    if (!/(^|\.)fountain\.fm$/i.test(u.hostname)) return null;
    const m = u.pathname.match(/^\/(episode|track|show|live)\/([A-Za-z0-9_-]+)/);
    return m ? { kind: m[1] as FountainKind, id: m[2] } : null;
  } catch {
    return null;
  }
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
}

function og(html: string, prop: string): string | null {
  const re = new RegExp(`<meta[^>]+property=["']${prop}["'][^>]+content=["']([^"']*)["']`, "i");
  const alt = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+property=["']${prop}["']`, "i");
  const m = html.match(re) ?? html.match(alt);
  return m?.[1] ? decodeEntities(m[1]).trim() : null;
}

/** Fountain's own marketing line, on pages that have no description of their own. */
const BOILERPLATE = /^Discover millions of podcasts and emerging artists/i;

export function parseFountainPage(html: string, url: string): FountainItem | null {
  const ref = fountainRef(url);
  const audio = og(html, "og:audio");
  if (!ref || !audio) return null;
  const rawTitle = og(html, "og:title") ?? "";
  const parts = rawTitle
    .split("•")
    .map((p) => p.trim())
    .filter((p) => p && !/^Listen on Fountain$/i.test(p));
  const show = parts.length > 1 ? parts[0] : null;
  const title = parts.length > 1 ? parts.slice(1).join(" • ") : parts[0] || "Untitled";
  const description = og(html, "og:description");
  return {
    kind: ref.kind,
    id: ref.id,
    show,
    title,
    description: description && !BOILERPLATE.test(description) ? description : null,
    image: og(html, "og:image"),
    audio,
    url,
  };
}

const cache = new Map<string, Promise<FountainItem | null>>();

/** Test seam: forget every page read. */
export function __resetFountainCache() {
  cache.clear();
}

/** The item behind a Fountain link — read once, remembered; null when the page cannot be read. */
export function fetchFountainItem(url: string): Promise<FountainItem | null> {
  const ref = fountainRef(url);
  if (!ref) return Promise.resolve(null);
  const key = `${ref.kind}/${ref.id}`;
  if (!cache.has(key)) {
    cache.set(
      key,
      fetch(`https://fountain.fm/${ref.kind}/${ref.id}`, { signal: AbortSignal.timeout(10_000) })
        .then((r) => (r.ok ? r.text() : null))
        .then((html) => (html ? parseFountainPage(html, `https://fountain.fm/${ref.kind}/${ref.id}`) : null))
        .catch(() => null),
    );
  }
  return cache.get(key)!;
}

export function useFountainItem(url: string): { loading: boolean; item: FountainItem | null } {
  const [state, setState] = useState<{ loading: boolean; item: FountainItem | null }>({ loading: !!fountainRef(url), item: null });
  useEffect(() => {
    let cancelled = false;
    if (!fountainRef(url)) {
      setState({ loading: false, item: null });
      return;
    }
    setState({ loading: true, item: null });
    fetchFountainItem(url).then((item) => {
      if (!cancelled) setState({ loading: false, item });
    });
    return () => {
      cancelled = true;
    };
  }, [url]);
  return state;
}
