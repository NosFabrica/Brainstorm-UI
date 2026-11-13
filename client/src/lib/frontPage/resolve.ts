/**
 * The "afterwards" the editorial brief promises: art ids become real URLs, citations
 * become permalinks, and every other link to the open web becomes its own text.
 *
 * Ported from NosFabrica/the-nostr-observer @ 0901b92 (MIT, see ./LICENSE.observer):
 * `.claude/skills/nostr-observer/scripts/resolve.mjs`. It edits the parsed document
 * (DOMParser) instead of slicing the source string, so there are no offsets to keep
 * straight and no tag the scanner can misread.
 *
 * THE ID IS THE WHOLE POINT. If the writer picked art by writing URLs, an invented
 * URL would be indistinguishable from a real one. Handing over ids and resolving them
 * here makes a fabricated image reference structurally impossible.
 *
 * IT REPORTS EVERYTHING IT CHANGES. A dropped figure or an unwrapped link is the
 * visible edge of somebody trying to edit a newspaper they do not work for, and a
 * sanitizer that cleans up in silence would hide exactly the event worth seeing.
 */
import type { Corpus } from "./corpus";
import { LEGACY_JUMBLE_LINKS, addressOf } from "./links";
import {
  anyCitedEvent,
  cleanUrl,
  httpsTarget,
  isFragment,
  linksOf,
  parsePage,
  profileTarget,
  serialize,
} from "./validate";

/** `permalink` an nevent citation, `address` an naddr one (a stream, listing, calendar entry, long-form post or recipe). */
export interface ResolveChange {
  kind: "resolved" | "dropped" | "unwrapped" | "permalink" | "address" | "profile";
  detail: string;
}

/** A citation or a byline is a source, not a page the paper should be replaced by. */
function openInNewTab(anchor: Element): void {
  anchor.setAttribute("target", "_blank");
  const rel = new Set((anchor.getAttribute("rel") ?? "").split(/\s+/).filter(Boolean));
  rel.add("noopener");
  rel.add("noreferrer");
  anchor.setAttribute("rel", [...rel].join(" "));
}

export function resolve(html: string, corpus: Corpus): { html: string; doc: Document; changes: ResolveChange[] } {
  const doc = parsePage(html);
  const byId = new Map(corpus.art.map((a) => [a.id, a]));
  const changes: ResolveChange[] = [];

  // --- art ids -------------------------------------------------------------
  for (const img of Array.from(doc.querySelectorAll("img"))) {
    const id = cleanUrl(img.getAttribute("src") ?? "");
    if (!/^art-\d+$/.test(id)) continue;
    const art = byId.get(id);
    if (art) {
      img.setAttribute("src", art.url);
      changes.push({ kind: "resolved", detail: `${id} -> ${art.url}` });
    } else {
      (img.closest("figure") ?? img).remove();
      changes.push({ kind: "dropped", detail: `${id} is not on the shortlist; its figure was removed` });
    }
  }

  // --- links to the open web ----------------------------------------------
  // The paper prints addresses; it does not make them clickable, except citations of the
  // events it read and bylines of their authors, in the app's own link set. The writer's
  // jumble.social forms, which the brief named before it named the app's bases, are read too
  // and rewritten into the app's. Everything else is unwrapped to its own text.
  // Nothing here may throw on corpus content: a link that can't be kept is unwrapped.
  const links = linksOf(corpus);
  for (const anchor of Array.from(doc.querySelectorAll("a[href]"))) {
    const raw = anchor.getAttribute("href") ?? "";
    // A same-document anchor stays; everything else is judged by where a browser would
    // go, so ` javascript:`, `//host` and `java&#9;script:` are unwrapped like any other.
    if (isFragment(raw)) continue;
    const unwrap = () => {
      anchor.replaceWith(...Array.from(anchor.childNodes));
      changes.push({ kind: "unwrapped", detail: raw.slice(0, 120) });
    };
    const url = httpsTarget(raw);
    if (!url) {
      unwrap();
      continue;
    }
    // Kept links point at their canonical address and open in a new tab: the paper
    // stays put, and a writer who forgets target=_blank still gets it.
    const keep = (canonical: string, kind: ResolveChange["kind"]) => {
      if (raw !== canonical) {
        anchor.setAttribute("href", canonical);
        changes.push({ kind, detail: `${raw.slice(0, 120)} -> ${canonical}` });
      }
      openInNewTab(anchor);
    };
    try {
      const author = profileTarget(url, corpus, links) ?? profileTarget(url, corpus, LEGACY_JUMBLE_LINKS);
      if (author) {
        keep(links.profile(author), "profile");
        continue;
      }
      const event = anyCitedEvent(url, corpus, links) ?? anyCitedEvent(url, corpus, LEGACY_JUMBLE_LINKS);
      if (event) {
        keep(links.citation(event), addressOf(event) ? "address" : "permalink");
        continue;
      }
    } catch {
      // A pubkey or id that won't encode: nothing to point the link at.
    }
    unwrap();
  }

  return { html: serialize(doc), doc, changes };
}

/** The changes worth a reader's attention: the page trying to do something the paper does not. */
export function noteworthy(changes: ResolveChange[]): ResolveChange[] {
  return changes.filter((c) => c.kind === "dropped" || c.kind === "unwrapped");
}
