/**
 * What Next means when nothing is lined up: more from the same artist. No
 * queue to manage — the source that gave us the track gives us the rest: the
 * author's other tracks on Nostr, or the artist's other songs on Wavlake.
 * Empty, never a throw.
 */
import { nip19 } from "nostr-tools";
import { fetchRecentByKinds } from "@/services/nostr";
import { searchWavlake } from "@/lib/wavlake";
import { parseTrack } from "@/lib/trackEvent";
import { eventPath } from "@/lib/shareId";
import type { PlaylistTrack, TrackMeta } from "@/lib/audioPlayer";

const normalise = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/** An in-app profile path for a Nostr key given as hex or npub; undefined otherwise. */
export function profileHrefOf(key: string | undefined | null): string | undefined {
  if (!key) return undefined;
  try {
    if (/^npub1[02-9ac-hj-np-z]+$/i.test(key)) return `/p/${key.toLowerCase()}`;
    if (/^[0-9a-f]{64}$/i.test(key)) return `/p/${nip19.npubEncode(key.toLowerCase())}`;
  } catch { /* not a key */ }
  return undefined;
}

export async function moreFromArtist(current: TrackMeta & { id: string }, limit = 12): Promise<PlaylistTrack[]> {
  try {
    if (current.id.startsWith("wavlake:")) {
      if (!current.artist) return [];
      const want = normalise(current.artist);
      const { songs } = await searchWavlake(current.artist, limit + 1);
      return songs
        .filter((s) => s.id !== current.id && normalise(s.artist) === want)
        .slice(0, limit)
        .map((s) => ({ id: s.id, src: s.audio, title: s.title, artist: s.artist, cover: s.cover, href: s.url, artistHref: profileHrefOf(s.artistNpub) }));
    }
    if (current.artistPubkey) {
      const events = await fetchRecentByKinds(current.artistPubkey, [31337], limit + 1);
      const out: PlaylistTrack[] = [];
      for (const e of events) {
        if (e.id === current.id) continue;
        const t = parseTrack(e);
        if (!t) continue;
        out.push({ id: t.id, src: t.audio, title: t.title, artist: t.artist ?? current.artist, cover: t.cover, href: eventPath({ id: e.id, pubkey: e.pubkey }), artistHref: profileHrefOf(e.pubkey), artistPubkey: e.pubkey });
        if (out.length >= limit) break;
      }
      return out;
    }
  } catch { /* a source that is down is an empty list */ }
  return [];
}
