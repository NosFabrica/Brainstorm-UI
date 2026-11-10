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
import type { NostrEvent } from "nostr-tools";
import { DESK_LINKS, DESK_LINK_KEYS, fromNevent, toProfileLink, type DeskLink } from "./desks";
import type { Corpus } from "./corpus";
import {
  corpusIndex,
  deskLinkTarget,
  deskWriterTarget,
  parsePage,
  permalinkTarget,
  profileTarget,
  serialize,
  toPermalink,
} from "./validate";

export interface ResolveChange {
  kind: "resolved" | "dropped" | "unwrapped" | "permalink" | "stream" | "listing" | "calendar" | "profile";
  detail: string;
}

function citedEventId(href: string): string | null {
  const jumble = permalinkTarget(href);
  if (jumble) return jumble;
  const hex = /^https:\/\/jumble\.social\/notes\/([0-9a-f]{64})(?:[/?#].*)?$/i.exec(href);
  if (hex) return hex[1].toLowerCase();
  const njump = /^https:\/\/njump\.me\/([0-9a-f]{64})(?:[/?#].*)?$/i.exec(href);
  if (njump) return njump[1].toLowerCase();
  const nevent = /^https:\/\/(?:jumble\.social\/notes\/|njump\.me\/)(nevent1[0-9a-z]+)/i.exec(href);
  return nevent ? fromNevent(nevent[1]) : null;
}

/** Jumble is a source citation, not a page the paper should be replaced by. */
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
  const eventIds = new Set(
    Object.values(corpus.desks)
      .flat()
      .map((e) => e.id),
  );
  const changes: ResolveChange[] = [];

  // --- art ids -------------------------------------------------------------
  for (const img of Array.from(doc.querySelectorAll("img"))) {
    const id = img.getAttribute("src") ?? "";
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
  // The paper prints addresses; it does not make them clickable — except source
  // citations and the verified zap.stream / Shopstr / njump-calendar links. A calendar
  // listing cited the ordinary way is re-encoded to njump rather than kept as a frozen
  // nevent. Everything else is unwrapped to its own text.
  const index = corpusIndex(corpus);
  const deskTarget = (url: string, id: string | null): { link: DeskLink; event: NostrEvent } | null => {
    for (const key of DESK_LINK_KEYS) {
      const eventId = deskWriterTarget(key, url, corpus) || deskLinkTarget(key, url, corpus);
      const event = eventId ? index[key].byId.get(eventId.toLowerCase()) : undefined;
      if (event) return { link: DESK_LINKS[key], event };
    }
    const listing = id ? index.calendar.byId.get(id) : undefined;
    return listing ? { link: DESK_LINKS.calendar, event: listing } : null;
  };

  for (const anchor of Array.from(doc.querySelectorAll("a[href]"))) {
    const url = anchor.getAttribute("href") ?? "";
    if (!/^https?:/i.test(url)) continue;
    const id = citedEventId(url);
    // Kept links point at their canonical address and open in a new tab: the paper
    // stays put, and a writer who forgets target=_blank still gets it.
    const keep = (canonical: string, kind: ResolveChange["kind"]) => {
      if (url !== canonical) {
        anchor.setAttribute("href", canonical);
        changes.push({ kind, detail: `${url} -> ${canonical}` });
      }
      openInNewTab(anchor);
    };
    const desk = deskTarget(url, id);
    if (desk) {
      keep(desk.link.canonicalUrl(desk.event), desk.link.change as ResolveChange["kind"]);
      continue;
    }
    const author = profileTarget(url, corpus);
    if (author) {
      keep(toProfileLink(author), "profile");
      continue;
    }
    if (id && eventIds.has(id)) {
      keep(toPermalink(id), "permalink");
      continue;
    }
    anchor.replaceWith(...Array.from(anchor.childNodes));
    changes.push({ kind: "unwrapped", detail: url.slice(0, 120) });
  }

  return { html: serialize(doc), doc, changes };
}

/** The changes worth a reader's attention: the page trying to do something the paper does not. */
export function noteworthy(changes: ResolveChange[]): ResolveChange[] {
  return changes.filter((c) => c.kind === "dropped" || c.kind === "unwrapped");
}
