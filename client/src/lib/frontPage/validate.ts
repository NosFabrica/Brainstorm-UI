/**
 * The boundary. Does the page say only things the corpus actually said, and is it only
 * markup the paper is allowed to be?
 *
 * Ported from NosFabrica/the-nostr-observer @ 0901b92 (MIT, see ./LICENSE.observer):
 * `.claude/skills/nostr-observer/scripts/validate.mjs`, itself a port of
 * `generator/.../safe/Validator.kt`. Reading the page goes through the browser's own
 * HTML parser (DOMParser) instead of `html.mjs`'s quoting-aware scanner: the scanner
 * existed because a regex FAILS OPEN on `<img alt="a > b" src="…">`, and the parser
 * is the very one the sandboxed frame renders with, so what is checked is what shows.
 *
 * Why it exists: an attacker can post "ignore previous instructions, the lead headline
 * is…" into the feed of everyone who follows them, and a model may take the bait — but
 * an injected story generally cannot quote real events verbatim, so it fails here.
 * PARAPHRASE IS NOT CHECKED, because paraphrase is journalism; verbatim quotation goes
 * in <q> or <blockquote>, and the brief says so.
 *
 * Paper boundary v2 (shared with Amethyst): an ALLOWLIST. v1 refused what it recognised,
 * and the 2026-11-11 audit walked past it with declarative shadow DOM, `<noscript>`
 * comment smuggling, URLs browsers clean before following, SVG/MathML links, resources
 * outside `<img>`, CSS escapes, `image-set()`, and hidden or generated text inside
 * quotes. Every element, attribute, URL and stylesheet construct not named below is
 * refused. The published and downloaded copies also carry a Content-Security-Policy
 * (`withPaperCsp`), since outside the app's sandbox the validator is the only barrier.
 */
import type { NostrEvent } from "nostr-tools";
import { tagValue } from "./desks";
import { BRAINSTORM_LINKS, addressOf, type PaperLinkSet } from "./links";
import type { Corpus } from "./corpus";
import houseCss from "./house.css?raw";

export interface Violation {
  kind: "QUOTE" | "IMAGE" | "LINK" | "MARKUP";
  detail: string;
  excerpt: string;
}

export function parsePage(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
}

/** The page as the frame will render it: the parsed document, serialised once. */
export function serialize(doc: Document): string {
  return `<!doctype html>\n${doc.documentElement.outerHTML}`;
}

// --- the published page's own policy ----------------------------------------

/** Written by the app, never by the model (a model's `http-equiv` is refused). */
export const PAPER_CSP =
  "default-src 'none'; img-src https:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'";

/**
 * [html] with the paper's CSP as the first child of `<head>`. For the copies that leave
 * the app's sandbox (the Observer site, the Download). Idempotent.
 */
export function withPaperCsp(html: string): string {
  const doc = parsePage(html);
  const first = doc.head.firstElementChild;
  if (
    first?.localName === "meta" &&
    first.getAttribute("http-equiv")?.toLowerCase() === "content-security-policy" &&
    first.getAttribute("content") === PAPER_CSP
  ) {
    return serialize(doc);
  }
  const meta = doc.createElement("meta");
  meta.setAttribute("http-equiv", "Content-Security-Policy");
  meta.setAttribute("content", PAPER_CSP);
  doc.head.prepend(meta);
  return serialize(doc);
}

// --- normalisation ---------------------------------------------------------

/**
 * One normal form for both sides of the comparison. Lowercased on purpose:
 * capitalising the first word of a quote to start a sentence is standard. Everything
 * that changes MEANING — words, order, negation — survives normalisation intact.
 */
export function normalize(text: string): string {
  return String(text)
    .normalize("NFKC")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/\u00a0/g, " ")
    .replace(/…/g, "...")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Verbatim, allowing for elision and typographic normalisation. A quote may elide its
 * middle with an ellipsis, in which case EVERY fragment must appear IN ORDER in ONE
 * SINGLE event — order and single-event are what stop elision being used to stitch two
 * people into one sentence. No fragment is too short to check: v1 skipped fragments of
 * two characters or fewer, so "I … no … it" smuggled a "no" past it.
 */
export function isQuoted(raw: string, haystack: string[]): boolean {
  const needle = normalize(raw);
  if (!needle) return true;
  const fragments = needle
    .split("...")
    .map((f) => f.trim())
    .filter((f) => f.length >= 1);
  if (fragments.length === 0) return haystack.some((source) => source.includes(needle));
  return haystack.some((source) => {
    let from = 0;
    for (const fragment of fragments) {
      const at = source.indexOf(fragment, from);
      if (at < 0) return false;
      from = at + fragment.length;
    }
    return true;
  });
}

/** Attribution inside a quote, not part of what was said. */
const ATTRIBUTION = new Set(["cite", "footer"]);

/**
 * Text of one quote element, without its attribution (`cite`, `footer`). Text nodes are
 * joined with spaces, as validate.mjs replaced every tag with one: `a<br>b` is "a b".
 */
function quoteText(el: Element): string {
  const parts: string[] = [];
  const walk = (node: Node) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) parts.push(child.nodeValue ?? "");
      else if (child.nodeType === Node.ELEMENT_NODE && !ATTRIBUTION.has((child as Element).localName)) walk(child);
    }
  };
  walk(el);
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

/** Text of every <q> and <blockquote>, in document order. */
export function quotedText(doc: Document): string[] {
  return Array.from(doc.querySelectorAll("q, blockquote")).map(quoteText).filter(Boolean);
}

// --- urls --------------------------------------------------------------------

/** What a browser does to an attribute URL before it parses it. */
export function cleanUrl(raw: string): string {
  return (
    String(raw ?? "")
      // eslint-disable-next-line no-control-regex
      .replace(/^[\x00-\x20]+|[\x00-\x20]+$/g, "")
      .replace(/[\t\n\r]/g, "")
  );
}

const DUMMY_BASE = "https://paper.invalid/";

/** The URL a browser would follow, or null when it would not parse. */
export function parseUrl(raw: string): URL | null {
  try {
    return new URL(cleanUrl(raw), DUMMY_BASE);
  } catch {
    return null;
  }
}

/** A same-document `#fragment`. */
export function isFragment(raw: string): boolean {
  return cleanUrl(raw).startsWith("#");
}

/** The https URL a link leads to, or null when it leads anywhere else (or nowhere). */
export function httpsTarget(raw: string): string | null {
  const url = parseUrl(raw);
  return url && url.protocol === "https:" && url.host !== "paper.invalid" ? url.href : null;
}

// --- links -----------------------------------------------------------------

/** The app's link set a corpus was assembled with; Brainstorm's when it names none. */
export function linksOf(corpus: Corpus): PaperLinkSet {
  return corpus.links ?? BRAINSTORM_LINKS;
}

interface CorpusIndex {
  /** Every desk event by lower-case id. */
  events: Map<string, NostrEvent>;
  /** Every addressable desk event whose address encodes, by `kind:pubkey:d`. */
  byAddress: Map<string, NostrEvent>;
  /** Every author of a desk event, lower-case hex. */
  authors: Set<string>;
}

const INDEX = new WeakMap<Corpus, CorpusIndex>();
const lower = (value: string | null | undefined) => String(value ?? "").toLowerCase();
const addressKey = (kind: number, pubkey: string, identifier: string | null) =>
  `${kind}:${lower(pubkey)}:${identifier}`;

/**
 * The corpus, indexed once per run instead of once per link. The kind is part of the
 * address key, so 31922 and 31923 cannot answer for each other even when a pubkey
 * reuses a d-tag across both. Only events with an address that encodes are cited by it.
 */
export function corpusIndex(corpus: Corpus): CorpusIndex {
  const found = INDEX.get(corpus);
  if (found) return found;
  const events = Object.values(corpus.desks).flat();
  const built: CorpusIndex = {
    events: new Map(events.map((e) => [lower(e.id), e])),
    byAddress: new Map(
      events.filter((e) => addressOf(e) !== null).map((e) => [addressKey(e.kind, e.pubkey, tagValue(e, "d")), e]),
    ),
    authors: new Set(events.map((e) => lower(e.pubkey))),
  };
  INDEX.set(corpus, built);
  return built;
}

/**
 * The event an ENCODED citation in `links` names, if this edition read it: an nevent (or
 * note) for an event that has no address, an naddr matching the kind, pubkey and `d` of one
 * that has. DECODED, not captured: a regex once allowed `nevent1…` in a branch that captured
 * nothing. An nevent for an addressable event would freeze one revision of it: not accepted.
 * The writer's hex forms are not accepted here: resolve encodes them, and refusing them
 * afterwards makes a regression there fail closed.
 */
export function citedTarget(href: string, corpus: Corpus, links: PaperLinkSet = linksOf(corpus)): NostrEvent | null {
  const entity = links.cited(href);
  if (!entity) return null;
  const { events, byAddress } = corpusIndex(corpus);
  if (entity.type === "naddr") {
    return byAddress.get(addressKey(entity.kind, entity.pubkey, entity.identifier)) ?? null;
  }
  const event = events.get(entity.id);
  return event && addressOf(event) === null ? event : null;
}

/** The event a writer's or an encoded citation names, any revision form, for resolve to re-encode. */
export function anyCitedEvent(href: string, corpus: Corpus, links: PaperLinkSet = linksOf(corpus)): NostrEvent | null {
  const writer = links.writerCited(href);
  const entity = writer ? null : links.cited(href);
  if (!writer && !entity) return null;
  const { events, byAddress } = corpusIndex(corpus);
  if (writer) return events.get(writer) ?? null;
  if (entity!.type === "naddr") {
    return byAddress.get(addressKey(entity!.kind, entity!.pubkey, entity!.identifier)) ?? null;
  }
  return events.get(entity!.id) ?? null;
}

/**
 * The author a byline link names, if they wrote a post this edition read: the writer's
 * form names them by one of their event ids (or, leniently, by their pubkey hex), the
 * encoded form by npub. Anyone else is not the paper's to link, however they were named.
 */
export function profileTarget(href: string, corpus: Corpus, links: PaperLinkSet = linksOf(corpus)): string | null {
  const encoded = links.profiled(href);
  const hex = encoded ? null : links.writerProfile(href);
  if (!encoded && !hex) return null;
  const { authors, events } = corpusIndex(corpus);
  if (encoded) return authors.has(encoded) ? encoded : null;
  const byPost = events.get(hex!);
  if (byPost) return byPost.pubkey.toLowerCase();
  return authors.has(hex!) ? hex : null;
}

// --- markup: the allowlist ---------------------------------------------------

const XHTML = "http://www.w3.org/1999/xhtml";

/** Every element a paper may be made of. Anything else is refused. */
export const ALLOWED_ELEMENTS = new Set(
  (
    "html head body title meta style header footer main section article aside nav div span " +
    "h1 h2 h3 h4 h5 h6 p br hr pre a img figure figcaption blockquote q cite em strong b i u s " +
    "small sub sup mark time abbr ul ol li dl dt dd table thead tbody tfoot tr th td caption " +
    "colgroup col details summary"
  ).split(" "),
);

/** Named so the refusal says what it is (the allowlist refuses them regardless). */
const REFUSED_ELEMENTS: Record<string, string> = {
  template: "a <template>, which can carry a shadow root the check never sees",
  noscript: "a <noscript>, which parses one way here and another way in a browser",
  svg: "inline <svg>, which carries its own links and animations",
  math: "inline <math>, which carries its own links",
  link: "a <link>, which loads from outside the page",
  base: "a <base> tag, which rewrites every relative URL on the page",
  script: "a <script> tag",
  iframe: "an <iframe>",
  frame: "a <frame>",
  frameset: "a <frameset>",
  object: "an embedded object",
  embed: "an embedded object",
  applet: "an embedded object",
  form: "a form - the paper collects nothing",
  input: "a form control",
  button: "a form control",
  select: "a form control",
  textarea: "a form control",
  video: "a video - art is only ever <img>",
  audio: "audio",
  source: "a media <source>",
  track: "a media <track>",
  picture: "a <picture> - art is only ever <img>",
  canvas: "a <canvas>",
  portal: "a <portal>",
  slot: "a <slot>",
  dialog: "a <dialog>",
  marquee: "a <marquee>",
};

const GLOBAL_ATTRS = new Set(["class", "id", "lang", "dir", "title", "role", "style", "hidden"]);

const ELEMENT_ATTRS: Record<string, Set<string>> = {
  a: new Set(["href", "target", "rel"]),
  img: new Set(["src", "alt", "width", "height", "loading", "decoding"]),
  meta: new Set(["charset", "name", "content"]),
  td: new Set(["colspan", "rowspan", "scope"]),
  th: new Set(["colspan", "rowspan", "scope"]),
  time: new Set(["datetime"]),
  ol: new Set(["start", "reversed"]),
  col: new Set(["span"]),
  colgroup: new Set(["span"]),
  // Beyond the shared spec: `open` only says whether a <details> starts expanded.
  details: new Set(["open"]),
};

/** Refused everywhere, named so the refusal says why. */
const REFUSED_ATTRS = /^(srcset|sizes|poster|background|xlink:.*|on.*|formaction|http-equiv|srcdoc|ping|shadowroot.*)$/;

const META_NAMES = new Set(["viewport", "description"]);

/** A `data-*` attribute the page may carry for its own styling: lowercase letters, digits and dashes. */
const DATA_ATTR = /^data-[a-z0-9-]+$/;
// eslint-disable-next-line no-control-regex
const NOT_TEXT = /[<>\u0000-\u001f\u007f-\u009f]/;

/** Inside a quote: the only elements, and inside its attribution the only extra ones. */
const QUOTE_INSIDE = new Set(["p", "br", "em", "strong", "b", "i", "cite", "footer"]);
// Beyond the shared spec: a byline link (and its emphasis) inside the attribution. The
// attribution is not quote text, and its link still goes through the LINK check.
const ATTRIBUTION_INSIDE = new Set(["a", "em", "strong", "b", "i", "br", "time", "small", "abbr"]);
/** Attributes that can hide, restyle or reorder text, refused on a quote and inside it. */
const QUOTE_REFUSED_ATTRS = new Set(["style", "class", "hidden", "aria-hidden", "dir"]);

function excerptOf(el: Element): string {
  return el.outerHTML.slice(0, 80);
}

function attributeViolations(el: Element, inQuote: boolean, out: Violation[]): void {
  const name = el.localName;
  for (const attr of Array.from(el.attributes)) {
    const attrName = attr.name.toLowerCase();
    const flag = (detail: string) => out.push({ kind: "MARKUP", detail, excerpt: excerptOf(el) });
    if (inQuote && QUOTE_REFUSED_ATTRS.has(attrName)) {
      flag(`${attrName}= on quoted text, which could hide or change what it shows`);
      continue;
    }
    if (REFUSED_ATTRS.test(attrName)) {
      flag(
        attrName.startsWith("on")
          ? `the page contains an inline event handler (${attrName}=)`
          : `${attrName}= is not allowed on a paper`,
      );
      continue;
    }
    if (GLOBAL_ATTRS.has(attrName) || attrName.startsWith("aria-")) continue;
    // Text only, and never on quoted text (a stylesheet could print it inside the quote).
    if (attrName.startsWith("data-")) {
      if (inQuote) flag(`${attrName}= on quoted text, which could hide or change what it shows`);
      else if (!DATA_ATTR.test(attr.name))
        flag(`${attrName}= is not a data attribute a paper may use (letters, digits and dashes)`);
      else if (NOT_TEXT.test(attr.value)) flag(`${attrName}= may hold text only`);
      continue;
    }
    if (!ELEMENT_ATTRS[name]?.has(attrName)) {
      flag(`${attrName}= is not allowed on <${name}>`);
      continue;
    }
    if (name === "a" && attrName === "target" && attr.value !== "_blank") {
      flag(`target="${attr.value.slice(0, 20)}" - a link may only open in a new tab`);
    }
  }
  if (name === "meta") {
    const metaName = el.getAttribute("name");
    const ok = el.hasAttribute("charset")
      ? !el.hasAttribute("name") && !el.hasAttribute("content")
      : metaName !== null && META_NAMES.has(metaName.toLowerCase()) && el.hasAttribute("content");
    if (!ok)
      out.push({
        kind: "MARKUP",
        detail: "a <meta> other than charset, viewport or description",
        excerpt: excerptOf(el),
      });
  }
}

function elementViolations(doc: Document, out: Violation[]): void {
  for (const el of Array.from(doc.querySelectorAll("*"))) {
    const name = el.localName;
    if (el.namespaceURI !== XHTML || !ALLOWED_ELEMENTS.has(name)) {
      out.push({
        kind: "MARKUP",
        detail: `the page contains ${REFUSED_ELEMENTS[name] ?? `a <${name}>, which a paper may not use`}`,
        excerpt: excerptOf(el),
      });
      continue;
    }
    const quote = el.closest("q, blockquote");
    if (quote && quote !== el) {
      const inAttribution = el.parentElement?.closest("cite, footer");
      const allowed =
        QUOTE_INSIDE.has(name) || (inAttribution && quote.contains(inAttribution) && ATTRIBUTION_INSIDE.has(name));
      if (!allowed) {
        out.push({
          kind: "MARKUP",
          detail: `a <${name}> inside a quote - quotes hold only p, br, em, strong, b, i, cite and footer`,
          excerpt: excerptOf(el),
        });
      }
    }
    attributeViolations(el, !!quote, out);
  }
}

// --- markup: urls --------------------------------------------------------------

function urlViolations(doc: Document, corpus: Corpus, allowedImages: Set<string>, out: Violation[]): void {
  for (const img of Array.from(doc.querySelectorAll("img"))) {
    const src = img.getAttribute("src");
    if (src === null) continue;
    if (!allowedImages.has(cleanUrl(src))) {
      out.push({ kind: "IMAGE", detail: "image source is not from the shortlist", excerpt: src.slice(0, 120) });
    }
  }

  const links = linksOf(corpus);
  const { authors } = corpusIndex(corpus);
  for (const anchor of Array.from(doc.querySelectorAll("a[href]"))) {
    const raw = anchor.getAttribute("href") ?? "";
    if (isFragment(raw)) continue;
    const href = httpsTarget(raw);
    if (href) {
      // Exactly the app's encoded forms: a citation of an event this edition read, a byline
      // of its author. The writer's hex forms are resolve's to encode; a regression there
      // fails closed here.
      if (citedTarget(href, corpus, links)) continue;
      const author = links.profiled(href);
      if (author && authors.has(author)) continue;
    }
    // Presence in the corpus is evidence of NOTHING. An earlier version allowlisted
    // every URL that appeared in the corpus; the corpus is written by the attacker too,
    // so posting "click https://evil.example/x" was enough to get it allowlisted. And
    // every href is judged by where a browser would go: `//host`, ` javascript:` and
    // `java&#9;script:` are links too.
    out.push({
      kind: "LINK",
      detail: "only citations of the posts this edition read and bylines of their authors may be links",
      excerpt: raw.slice(0, 120),
    });
  }
}

// --- markup: css ----------------------------------------------------------------

/** Constructs that fetch, script or escape the check, refused in every stylesheet. */
const CSS_REFUSED: [RegExp, Violation["kind"], string][] = [
  [/\\/, "MARKUP", "a backslash in CSS - escapes hide what a rule says"],
  [/@import/i, "MARKUP", "the stylesheet imports another"],
  [/@font-face/i, "MARKUP", "a web font - the paper loads nothing but its art"],
  [/(?:^|[^-\w])(?:-webkit-)?image-set\s*\(/i, "IMAGE", "a CSS image-set() - art is only ever <img>"],
  [/(?:^|[^-\w])(?:url|src|image|cross-fade|element)\s*\(/i, "IMAGE", "a CSS url() - art is only ever <img>"],
  [/expression\s*\(/i, "MARKUP", "a CSS expression()"],
  [/(?:^|[^-\w])behavior\s*:/i, "MARKUP", "a CSS behavior"],
  [/-moz-binding/i, "MARKUP", "a CSS -moz-binding"],
];

const AT_RULES = new Set(["media", "supports", "keyframes", "-webkit-keyframes", "layer", "container"]);

interface CssRule {
  selector: string;
  body: string;
}

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?(\*\/|$)/g, " ");
}

/** End of the quoted string starting at [at] (no backslashes: those are refused). */
function skipString(css: string, at: number): number {
  const end = css.indexOf(css[at], at + 1);
  return end < 0 ? css.length : end + 1;
}

/** Top-level blocks: `prelude { body }`. Strings may hold braces. */
function blocks(css: string): { prelude: string; body: string }[] {
  const out: { prelude: string; body: string }[] = [];
  let start = 0;
  for (let i = 0; i < css.length;) {
    const ch = css[i];
    if (ch === '"' || ch === "'") {
      i = skipString(css, i);
    } else if (ch === "{") {
      let depth = 1;
      let j = i + 1;
      while (j < css.length && depth > 0) {
        const c = css[j];
        if (c === '"' || c === "'") {
          j = skipString(css, j);
          continue;
        }
        if (c === "{") depth++;
        else if (c === "}") depth--;
        j++;
      }
      out.push({ prelude: css.slice(start, i).trim(), body: css.slice(i + 1, depth === 0 ? j - 1 : j) });
      i = j;
      start = j;
    } else {
      if (ch === ";" || ch === "}") start = i + 1;
      i++;
    }
  }
  return out;
}

/** Every style rule, at any depth of @media / @supports / @layer / @container. */
function styleRules(css: string, refusedAt: (name: string) => void): CssRule[] {
  const out: CssRule[] = [];
  const visit = (text: string) => {
    for (const { prelude, body } of blocks(text)) {
      if (prelude.startsWith("@")) {
        const name = (/^@([-\w]+)/.exec(prelude)?.[1] ?? "").toLowerCase();
        if (!AT_RULES.has(name)) refusedAt(name);
        else if (!name.endsWith("keyframes")) visit(body);
      } else {
        out.push({ selector: prelude, body });
      }
    }
  };
  visit(stripComments(css));
  return out;
}

/** `prop: value` pairs of a declaration block. */
function declarations(body: string): { prop: string; value: string }[] {
  const out: { prop: string; value: string }[] = [];
  let start = 0;
  const push = (end: number) => {
    const part = body.slice(start, end);
    const colon = part.indexOf(":");
    if (colon > 0) {
      out.push({
        prop: part.slice(0, colon).trim().toLowerCase(),
        value: part
          .slice(colon + 1)
          .replace(/!important\s*$/i, "")
          .trim(),
      });
    }
  };
  for (let i = 0; i < body.length;) {
    const ch = body[i];
    if (ch === '"' || ch === "'") i = skipString(body, i);
    else {
      if (ch === ";") {
        push(i);
        start = i + 1;
      }
      i++;
    }
  }
  push(body.length);
  return out;
}

const squash = (s: string) => s.replace(/\s+/g, " ").trim();
const ruleKey = (rule: CssRule) =>
  `${squash(rule.selector)}{${declarations(rule.body)
    .map((d) => `${d.prop}:${squash(d.value)}`)
    .join(";")}}`;

/** The house stylesheet's own rules: trusted as given, wherever the page repeats them. */
let houseRules: Set<string> | null = null;
function isHouseRule(rule: CssRule): boolean {
  houseRules ??= new Set(styleRules(houseCss, () => {}).map(ruleKey));
  return houseRules.has(ruleKey(rule));
}

/** Quote marks only: a `quotes:` string that is words would print them around a quote. */
const QUOTE_MARKS = /^[\s"'“”‘’«»‹›„‚‛‟「」『』〝〞]*$/;
const CSS_STRING = /"([^"]*)"|'([^']*)'/g;

function declarationViolations(prop: string, value: string): string | null {
  if (prop === "content" && !/^(none|normal|""|'')$/i.test(value.trim())) {
    return "CSS generated content - every word on the page is in its markup";
  }
  if (prop === "quotes") {
    for (const match of value.matchAll(CSS_STRING)) {
      if (!QUOTE_MARKS.test(match[1] ?? match[2] ?? "")) return "CSS quotes: that are words, not quote marks";
    }
  }
  return null;
}

/** On text inside a quote, only what changes how it looks, never whether it shows. */
const INSIDE_SAFE = new Set([
  "font-weight",
  "font-style",
  "font-family",
  "font-variant",
  "font-feature-settings",
  "font-kerning",
  "font-size",
  "text-decoration",
  "text-decoration-line",
  "text-decoration-style",
  "text-decoration-color",
  "text-decoration-thickness",
  "text-underline-offset",
  "text-transform",
  "line-height",
  "margin",
  "margin-top",
  "margin-bottom",
  "margin-left",
  "margin-right",
  "padding",
  "padding-top",
  "padding-bottom",
  "padding-left",
  "padding-right",
  "border",
  "border-top",
  "border-bottom",
  "border-left",
  "border-right",
  "border-color",
  "border-style",
  "border-width",
  "text-align",
  "hyphens",
  "quotes",
  "display",
]);

/** On the quote itself, what could show part of it and hide the rest. */
const QUOTE_UNSAFE =
  /^(content|overflow(-[xy])?|text-overflow|(-webkit-)?line-clamp|clip|clip-path|(-webkit-)?mask(-.*)?|height|max-height|block-size|max-block-size|text-indent|animation(-.*)?|-webkit-text-fill-color|-webkit-text-stroke(-.*)?)$/;

function tooSmall(value: string): boolean {
  const v = value.trim().toLowerCase();
  if (/^[a-z-]+$/.test(v)) return false; // small, x-small, larger…
  const m = /^(\d*\.?\d+)(px|pt|em|rem|ch|ex|%)$/.exec(v);
  if (!m) return true; // calc(), var(), vw: can't be read, so not allowed
  const n = Number(m[1]);
  if (m[2] === "px" || m[2] === "pt") return n < 8;
  if (m[2] === "%") return n < 50;
  return n < 0.5;
}

function insideUnsafe(prop: string, value: string): boolean {
  if (prop.startsWith("--")) return false;
  if (!INSIDE_SAFE.has(prop)) return true;
  if (/var\(/i.test(value)) return true;
  if (prop === "display" && /\bnone\b/i.test(value)) return true;
  if (prop === "font-size" && tooSmall(value)) return true;
  if (/^(margin|padding)/.test(prop) && /-\s*\d|calc\(/i.test(value)) return true;
  return false;
}

/** Pseudo-elements and dynamic states don't change WHICH element a rule reaches. */
const PSEUDO_ELEMENT = /::?(before|after|first-line|first-letter|marker|selection|placeholder|backdrop)\b/gi;
const DYNAMIC = /:(hover|focus|focus-within|focus-visible|active|visited|link|target)\b/gi;

function splitSelectors(selector: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < selector.length; i++) {
    const ch = selector[i];
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    else if (ch === "," && depth === 0) {
      out.push(selector.slice(start, i));
      start = i + 1;
    }
  }
  out.push(selector.slice(start));
  return out.map((s) => s.trim()).filter(Boolean);
}

/**
 * A rule the house didn't write that reaches quoted text and could hide part of it
 * (`blockquote em { display: none }`), or show part of a quote and not the rest.
 * Beyond the shared spec, which closes the same hole for attributes only.
 */
function quoteRuleViolation(doc: Document, rule: CssRule, quotes: Element[]): string | null {
  if (quotes.length === 0 || isHouseRule(rule)) return null;
  const decls = declarations(rule.body);
  for (const selector of splitSelectors(rule.selector)) {
    const pseudo = new RegExp(PSEUDO_ELEMENT.source, "i").test(selector);
    const plain = selector.replace(PSEUDO_ELEMENT, "").replace(DYNAMIC, "").trim() || "*";
    let reachesQuote = false;
    let reachesInside = false;
    try {
      for (const el of Array.from(doc.querySelectorAll(plain))) {
        const quote = el.closest("q, blockquote");
        if (!quote) continue;
        if (quote === el) reachesQuote = true;
        else reachesInside = true;
      }
    } catch {
      // A selector this parser can't read may still match in a browser: assume it does.
      reachesQuote = reachesInside = true;
    }
    if (reachesInside || (reachesQuote && pseudo)) {
      const bad = decls.find((d) => insideUnsafe(d.prop, d.value));
      if (bad) return `${squash(selector)} { ${bad.prop}: … } reaches quoted text and could hide part of it`;
    } else if (reachesQuote) {
      const bad = decls.find((d) => QUOTE_UNSAFE.test(d.prop));
      if (bad) return `${squash(selector)} { ${bad.prop}: … } could show part of a quote and hide the rest`;
    }
  }
  return null;
}

function cssViolations(doc: Document, out: Violation[]): void {
  const quotes = Array.from(doc.querySelectorAll("q, blockquote"));
  const refuseConstructs = (css: string, excerpt: string) => {
    for (const [pattern, kind, detail] of CSS_REFUSED) {
      if (pattern.test(css)) out.push({ kind, detail, excerpt });
    }
  };
  for (const block of Array.from(doc.querySelectorAll("style"))) {
    const css = block.textContent ?? "";
    refuseConstructs(css, css.slice(0, 80));
    const rules = styleRules(css, (name) =>
      out.push({ kind: "MARKUP", detail: `a CSS @${name} rule`, excerpt: `@${name}` }),
    );
    for (const rule of rules) {
      for (const { prop, value } of declarations(rule.body)) {
        const detail = declarationViolations(prop, value);
        if (detail)
          out.push({ kind: "MARKUP", detail, excerpt: `${squash(rule.selector)} { ${prop}: ${value} }`.slice(0, 120) });
      }
      const reach = quoteRuleViolation(doc, rule, quotes);
      if (reach) out.push({ kind: "MARKUP", detail: reach, excerpt: squash(rule.selector).slice(0, 80) });
    }
  }
  for (const el of Array.from(doc.querySelectorAll("[style]"))) {
    const css = el.getAttribute("style") ?? "";
    refuseConstructs(css, css.slice(0, 80));
    for (const { prop, value } of declarations(stripComments(css))) {
      const detail = declarationViolations(prop, value);
      if (detail) out.push({ kind: "MARKUP", detail, excerpt: excerptOf(el) });
    }
  }
}

/** Every markup, URL and stylesheet refusal for one parsed page. */
export function markupViolations(doc: Document, corpus: Corpus): Violation[] {
  const out: Violation[] = [];
  elementViolations(doc, out);
  cssViolations(doc, out);
  urlViolations(doc, corpus, new Set(corpus.art.map((a) => a.url)), out);
  return out;
}

// --- fixpoint ---------------------------------------------------------------------

/**
 * The page as every later reader will parse it. Markup that changes when it is written
 * out and read back (mutation XSS) is checked in the form it settles into; one that
 * never settles is refused.
 */
export function settle(doc: Document, rounds = 3): { doc: Document; stable: boolean } {
  let current = doc;
  let text = serialize(current);
  for (let round = 0; round < rounds; round++) {
    const next = parsePage(text);
    const nextText = serialize(next);
    current = next;
    if (nextText === text) return { doc: current, stable: true };
    text = nextText;
  }
  return { doc: current, stable: false };
}

export interface CheckResult {
  violations: Violation[];
  quotes: string[];
  events: number;
  images: number;
  /** The document that was checked: the page as it settles after a round trip. */
  doc: Document;
}

/**
 * Everything the boundary has to say about one page. Pure: a test can put an
 * adversarial page through it directly.
 */
export function check(page: string | Document, corpus: Corpus): CheckResult {
  const { doc, stable } = settle(typeof page === "string" ? parsePage(page) : page);
  // The DESKS only, never the control run: it is a measurement of the network rather
  // than part of the paper, and it is not in the digest the writer reads. Widening the
  // haystack would let a quote verify against something the edition never had.
  const events = Object.values(corpus.desks).flat();
  const haystack = events.map((e) => normalize(e.content || ""));

  const violations: Violation[] = [];
  if (!stable) {
    violations.push({
      kind: "MARKUP",
      detail: "the markup changes every time it is read back",
      excerpt: serialize(doc).slice(0, 80),
    });
  }
  violations.push(...markupViolations(doc, corpus));

  const quotes = quotedText(doc);
  for (const quote of quotes) {
    if (!isQuoted(quote, haystack)) {
      violations.push({
        kind: "QUOTE",
        detail: "not found verbatim in any source event",
        excerpt: quote.slice(0, 160),
      });
    }
  }

  return { violations, quotes, events: events.length, images: corpus.art.length, doc };
}
