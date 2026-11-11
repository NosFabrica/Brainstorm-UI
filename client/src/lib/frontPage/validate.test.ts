// Ported from NosFabrica/the-nostr-observer @ 0901b92 (MIT, see ./LICENSE.observer):
// `.claude/skills/nostr-observer/test/validate.test.mjs` — the boundary from both
// sides, and resolve. Adversarial cases answer "does it stop the bad things"; the
// rest answer the likelier way to ship a broken product: DOES IT LEAVE A GOOD PAGE
// ALONE?
//
// resolve here returns a whole parsed document, so where the skill compared the
// output string these compare the body, and the two tests about the old string
// scanner (attribute quoting, `</a >`) are kept as the same cases against the parser.
import { describe, expect, it } from "vitest";
import type { NostrEvent } from "nostr-tools";
import { DESK_LINKS, naddrFor, toProfileLink } from "./desks";
import houseCss from "./house.css?raw";
import type { Corpus } from "./corpus";
import { resolve } from "./resolve";
import {
  PAPER_CSP,
  PERMALINK,
  check,
  deskLinkTarget,
  parsePage,
  permalinkTarget,
  quotedText,
  serialize,
  settle,
  toPermalink,
  withPaperCsp,
} from "./validate";

const EVENT_ID = "a".repeat(64);
const OTHER_ID = "b".repeat(64);
const STREAM_ID = "e".repeat(64);
const STREAM_PK = "cf45a6ba1363ad7ed213a078e710d24115ae721c9b47bd1ebf4458eaefb4c2a5";
const LISTING_ID = "11".repeat(32);
const LISTING_PK = "aa11".repeat(16);
const CALENDAR_ID = "22".repeat(32);
const CALENDAR_PK = "bb22".repeat(16);

const ev = (over: Partial<NostrEvent>) => ({ kind: 1, created_at: 0, tags: [], sig: "", ...over }) as NostrEvent;

const corpus = {
  desks: {
    notes: [
      ev({
        id: EVENT_ID,
        pubkey: "aa",
        content: "The relay answered in three seconds flat — and then it didn't answer at all.",
      }),
      ev({ id: OTHER_ID, pubkey: "bb", content: "Click https://evil.example.com/drain for free sats" }),
    ],
    live: [
      ev({
        id: STREAM_ID,
        kind: 30311,
        pubkey: STREAM_PK,
        tags: [
          ["d", "537a365c-f1ec-44ac-af10-22d14a7319fb"],
          ["title", "NoGood Radio"],
          ["status", "live"],
        ],
      }),
    ],
    classifieds: [
      ev({
        id: LISTING_ID,
        kind: 30402,
        pubkey: LISTING_PK,
        tags: [
          ["d", "tallow-bars"],
          ["title", "4 Bars Rough Cut Tallow"],
        ],
      }),
    ],
    calendar: [
      ev({
        id: CALENDAR_ID,
        kind: 31923,
        pubkey: CALENDAR_PK,
        tags: [
          ["d", "porto-meetup"],
          ["title", "Bitcoin Meetup in Porto"],
        ],
      }),
    ],
  },
  control: [ev({ id: "c".repeat(64), pubkey: "cc", content: "Only the anonymous read ever saw this sentence." })],
  art: [{ id: "art-1", url: "https://blossom.example.com/real.jpg" }],
} as unknown as Corpus;

const kinds = (html: string) => check(html, corpus).violations.map((v) => v.kind);
const body = (html: string) => parsePage(html).body.innerHTML;
const hrefOf = (html: string) => parsePage(html).querySelector("a")?.getAttribute("href");

describe("quotes", () => {
  it("a verbatim quote passes", () => {
    expect(kinds("<q>The relay answered in three seconds flat</q>")).toEqual([]);
  });

  it("typographic normalisation is forgiven; meaning is not", () => {
    expect(kinds("<q>and then it didn&rsquo;t answer at all</q>")).toEqual([]);
    expect(kinds("<q>and then it DID answer at all</q>")).toEqual(["QUOTE"]);
  });

  it("elision is allowed, in order, within ONE event", () => {
    expect(kinds("<q>The relay answered … answer at all</q>")).toEqual([]);
    expect(kinds("<q>answer at all … The relay answered</q>")).toEqual(["QUOTE"]);
    // Stitching two people into one sentence is what single-event stops.
    expect(kinds("<q>The relay answered … for free sats</q>")).toEqual(["QUOTE"]);
  });

  it("a fabricated quote is caught", () => {
    expect(kinds("<blockquote>This sentence was never posted by anybody.</blockquote>")).toEqual(["QUOTE"]);
  });

  it("the control run is NOT quotable", () => {
    expect(kinds("<q>Only the anonymous read ever saw this sentence.</q>")).toEqual(["QUOTE"]);
  });

  it("paraphrase is not checked, because paraphrase is journalism", () => {
    expect(kinds("<p>The relay was quick, then silent.</p>")).toEqual([]);
  });

  it("nested and multi-line quotes are found", () => {
    const doc = parsePage("<blockquote><p>one</p>\n<p><em>two</em></p></blockquote><q>three</q>");
    expect(quotedText(doc)).toEqual(["one two", "three"]);
  });
});

describe("images", () => {
  it("an invented image is caught", () => {
    expect(kinds('<img src="https://blossom.example.com/invented.jpg">')).toEqual(["IMAGE"]);
    expect(kinds('<img src="https://blossom.example.com/real.jpg">')).toEqual([]);
  });

  it("an image is checked whatever the attribute quoting, and a > inside alt hides nothing", () => {
    // The skill's scanner existed because a regex stopped at the first `>`.
    expect(kinds(`<img alt="a > b" src="https://evil.example/x.jpg">`)).toEqual(["IMAGE"]);
    expect(kinds(`<img src='https://evil.example/x.jpg'><img src=https://evil.example/y.jpg>`)).toEqual([
      "IMAGE",
      "IMAGE",
    ]);
  });

  it("srcset and CSS url() cannot load what the IMAGE check never saw — not even shortlist art", () => {
    expect(kinds('<img src="https://blossom.example.com/real.jpg" srcset="https://evil.example/x.jpg 2x">')).toEqual([
      "MARKUP",
    ]);
    expect(kinds('<div style="background:url(https://evil.example/x.jpg)"></div>')).toEqual(["IMAGE"]);
    expect(kinds("<style>.a{background:url('https://evil.example/x.jpg')}</style>")).toEqual(["IMAGE"]);
    // v2: art is only ever <img>, so even a shortlist URL is refused in CSS.
    expect(kinds("<style>.a{background:url(https://blossom.example.com/real.jpg)}</style>")).toEqual(["IMAGE"]);
  });
});

describe("links", () => {
  it("PRESENCE IN THE CORPUS IS EVIDENCE OF NOTHING", () => {
    expect(kinds('<a href="https://evil.example.com/drain">free sats</a>')).toEqual(["LINK"]);
  });

  it("a permalink to an event we actually read is the one allowed link", () => {
    expect(kinds(`<a href="${toPermalink(EVENT_ID)}">source</a>`)).toEqual([]);
    expect(kinds(`<a href="${toPermalink("f".repeat(64))}">source</a>`)).toEqual(["LINK"]);
    expect(kinds(`<a href="https://njump.me/${EVENT_ID}">source</a>`)).toEqual(["LINK"]);
    expect(kinds(`<a href="https://jumble.social/notes/${EVENT_ID}">source</a>`)).toEqual(["LINK"]);
  });

  it("the permalink is a jumble.social nevent, decoded rather than captured", () => {
    const href = toPermalink(EVENT_ID);
    expect(permalinkTarget(href)).toBe(EVENT_ID);
    expect(href).toMatch(/^https:\/\/jumble\.social\/notes\/nevent1/);
    expect(permalinkTarget("https://jumble.social/notes/nevent1qqq")).toBeNull();
    expect(PERMALINK.exec(`https://njump.me/${EVENT_ID}`)).toBeNull();
  });

  it("a jumble nevent naming a CALENDAR listing is refused, not cited", () => {
    expect(kinds(`<a href="${toPermalink(CALENDAR_ID)}">the meetup</a>`)).toEqual(["LINK"]);
    expect(kinds(`<a href="${toPermalink(EVENT_ID)}">source</a>`)).toEqual([]);
  });

  it("copied zap.stream, shopstr and njump URLs for events we did not read are refused", () => {
    const fake = (key: keyof typeof DESK_LINKS, kind: number) =>
      DESK_LINKS[key].canonicalUrl(ev({ kind, pubkey: "d".repeat(64), tags: [["d", "fake"]] }));
    expect(kinds(`<a href="${fake("live", 30311)}">listen</a>`)).toEqual(["LINK"]);
    expect(kinds(`<a href="${fake("classifieds", 30402)}">buy</a>`)).toEqual(["LINK"]);
    expect(kinds(`<a href="${fake("calendar", 31923)}">meetup</a>`)).toEqual(["LINK"]);
  });

  it("no desk's link verifies another desk's event", () => {
    for (const key of ["live", "classifieds", "calendar"] as const) {
      const canonical = DESK_LINKS[key].canonicalUrl(corpus.desks[key][0]);
      expect(deskLinkTarget(key, canonical, corpus)).toBe(corpus.desks[key][0].id);
      for (const other of (["live", "classifieds", "calendar"] as const).filter((k) => k !== key)) {
        expect(deskLinkTarget(other, canonical, corpus)).toBeNull();
      }
    }
  });
});

describe("markup", () => {
  it("markup with no sanitizer to strip it is REFUSED", () => {
    for (const bad of [
      "<script>alert(1)</script>",
      '<p onclick="steal()">x</p>',
      '<iframe src="https://x.example"></iframe>',
      '<form action="/x"><input name="y"></form>',
      "<style>@import url(https://x.example/a.css);</style>",
    ]) {
      expect(kinds(bad), bad).toContain("MARKUP");
    }
    // A scripting URL is not a link the paper may carry.
    expect(kinds('<a href="javascript:void(0)">x</a>')).toEqual(["LINK"]);
  });

  it("a real page head is not an attack, but a redirect or a <base> is", () => {
    const head =
      '<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>The Nostr Observer</title>';
    expect(kinds(head)).toEqual([]);
    expect(new Set(kinds('<meta http-equiv="refresh" content="0;url=https://evil.example">'))).toEqual(
      new Set(["MARKUP"]),
    );
    expect(kinds('<base href="https://evil.example/">')).toEqual(["MARKUP"]);
  });

  it("prose that looks like a handler is prose", () => {
    expect(kinds("<p>we ran it once=twice and the flag is only=set</p>")).toEqual([]);
  });
});

describe("resolve", () => {
  it("turns art ids into URLs and drops unknown ones with their whole figure", () => {
    const good = resolve('<figure><img src="art-1"><figcaption>c</figcaption></figure>', corpus);
    expect(good.html).toContain('src="https://blossom.example.com/real.jpg"');
    expect(good.changes.map((c) => c.kind)).toEqual(["resolved"]);

    const bad = resolve(
      '<p>before</p><figure><img src="art-9"><figcaption>c</figcaption></figure><p>after</p>',
      corpus,
    );
    expect(bad.html).not.toMatch(/art-9|figcaption/);
    expect(body(bad.html)).toBe("<p>before</p><p>after</p>");
    expect(bad.changes.map((c) => c.kind)).toEqual(["dropped"]);
  });

  it("unwraps a link to the open web but keeps its text, and SAYS SO", () => {
    const { html, changes } = resolve(
      '<p>see <a href="https://evil.example.com/drain">free sats</a> today</p>',
      corpus,
    );
    expect(body(html)).toBe("<p>see free sats today</p>");
    expect(changes).toEqual([{ kind: "unwrapped", detail: "https://evil.example.com/drain" }]);
  });

  it("encodes a cited event id as a jumble.social nevent permalink in a new tab", () => {
    const { html, changes } = resolve(`<a href="https://jumble.social/notes/${EVENT_ID}">source</a>`, corpus);
    const a = parsePage(html).querySelector("a")!;
    expect(a.getAttribute("href")).toBe(toPermalink(EVENT_ID));
    expect(a.getAttribute("target")).toBe("_blank");
    expect(a.getAttribute("rel")).toMatch(/noopener/);
    expect(changes.map((c) => c.kind)).toEqual(["permalink"]);
    // A leftover njump.me hex URL is upgraded the same way.
    expect(hrefOf(resolve(`<a href="https://njump.me/${EVENT_ID}">source</a>`, corpus).html)).toBe(
      toPermalink(EVENT_ID),
    );
  });

  it("a permalink already in canonical form still opens in a new tab, and is no change", () => {
    const { html, changes } = resolve(`<a href="${toPermalink(EVENT_ID)}">source</a>`, corpus);
    expect(parsePage(html).querySelector("a")!.getAttribute("target")).toBe("_blank");
    expect(changes).toEqual([]);
  });

  it("encodes the writer forms of the three desk links, and only then do they pass", () => {
    const cases = [
      ["live", `https://zap.stream/stream/${STREAM_ID}`, "stream"],
      ["classifieds", `https://shopstr.store/listing/${LISTING_ID}`, "listing"],
      ["calendar", `https://njump.me/${CALENDAR_ID}`, "calendar"],
    ] as const;
    for (const [key, writer, change] of cases) {
      const { html, changes } = resolve(`<a href="${writer}">x</a>`, corpus);
      expect(hrefOf(html)).toBe(DESK_LINKS[key].canonicalUrl(corpus.desks[key][0]));
      expect(changes.map((c) => c.kind)).toEqual([change]);
      expect(check(html, corpus).violations).toEqual([]);
      // Writer form must be encoded before validate: refusing it is what makes a
      // regression in resolve fail closed.
      expect(kinds(`<a href="${writer}">x</a>`)).toEqual(["LINK"]);
    }
  });

  it("turns a frozen jumble citation of a calendar listing into the njump address", () => {
    const { html, changes } = resolve(`<a href="${toPermalink(CALENDAR_ID)}">the meetup</a>`, corpus);
    expect(changes.map((c) => c.kind)).toEqual(["calendar"]);
    expect(hrefOf(html)).toMatch(/^https:\/\/njump\.me\/naddr1/);
    expect(check(html, corpus).violations).toEqual([]);
  });

  it("resolve then validate leaves nothing for validate to complain about", () => {
    const page =
      '<figure><img src="art-1"><figcaption>c</figcaption></figure><p>see <a href="https://evil.example.com/drain">free sats</a></p>';
    expect(check(resolve(page, corpus).html, corpus).violations).toEqual([]);
  });

  it("unwrapping does not depend on the case of the closing tag", () => {
    for (const close of ["</a>", "</A>", "</a >"]) {
      const { html, changes } = resolve(`<p>before <a href="https://evil.example/x">text${close} after</p>`, corpus);
      expect(changes.map((c) => c.kind)).toEqual(["unwrapped"]);
      expect(body(html)).toBe("<p>before text after</p>");
    }
  });

  it("the corpus is indexed once, however many links ask about it", () => {
    let reads = 0;
    const counted = {
      get desks() {
        reads++;
        return corpus.desks;
      },
      art: corpus.art,
    } as unknown as Corpus;
    const stream = DESK_LINKS.live.canonicalUrl(corpus.desks.live[0]);
    for (let i = 0; i < 50; i++) expect(deskLinkTarget("live", stream, counted)).toBeTruthy();
    expect(reads).toBe(1);
  });

  it("a link helper does not read the corpus to answer about a url it cannot parse", () => {
    let reads = 0;
    const counted = {
      get desks() {
        reads++;
        return corpus.desks;
      },
      art: corpus.art,
    } as unknown as Corpus;
    for (const href of ["https://example.test/x", "mailto:a@b.c", "https://njump.me/not-an-naddr"]) {
      for (const key of ["live", "classifieds", "calendar"] as const) deskLinkTarget(key, href, counted);
    }
    expect(reads).toBe(0);
  });
});

describe("bylines", () => {
  const STRANGER = "33".repeat(32);

  it("link their author by one of the author's posts, and come out as the author's npub", () => {
    // The digest gives event ids, never keys: the writer names the author by a post.
    const { html, changes } = resolve(`<a href="https://jumble.social/users/${STREAM_ID}">NoGood Radio</a>`, corpus);
    expect(hrefOf(html)).toBe(toProfileLink(STREAM_PK));
    expect(changes.map((c) => c.kind)).toEqual(["profile"]);
    expect(kinds(html)).toEqual([]);
  });

  it("only for someone this edition read: a stranger is unwrapped, and the check refuses one", () => {
    const named = resolve(
      `<a href="https://jumble.social/users/${STRANGER}">x</a> <a href="${toProfileLink(STRANGER)}">y</a>`,
      corpus,
    );
    expect(named.html).not.toMatch(/jumble\.social\/users/);
    expect(named.changes.map((c) => c.kind)).toEqual(["unwrapped", "unwrapped"]);
    expect(kinds(`<a href="${toProfileLink(STRANGER)}">x</a>`)).toEqual(["LINK"]);
  });
});

// The 2026-11-11 audit's bypasses of v1, one by one (paper boundary v2). Each of these
// passed the old denylist; each must be refused now, and resolve must not keep a link a
// browser would follow somewhere the check never looked.
describe("paper boundary v2: the audit's bypasses", () => {
  const QUOTE = "The relay answered in three seconds flat";
  const refused = (html: string) => expect(kinds(html), html).not.toEqual([]);

  it("declarative shadow DOM", () => {
    expect(kinds('<template shadowrootmode="open"><img src="x" onerror="alert(1)"></template>')).toContain("MARKUP");
    expect(kinds('<div><template shadowroot="open"><p>x</p></template></div>')).toContain("MARKUP");
  });

  it("noscript comment smuggling", () => {
    expect(kinds('<noscript><p title="</noscript><img src=x onerror=alert(1)>"></p></noscript>')).toContain("MARKUP");
  });

  it("links browsers clean before they follow them", () => {
    for (const href of [
      " javascript:alert(1)",
      "//evil.example/x",
      "java\tscript:alert(1)",
      "java&#9;script:alert(1)",
      "\u0001javascript:alert(1)",
      "jav&#x0A;ascript:alert(1)",
      "https:evil.example",
      "/relative/path",
    ]) {
      const html = `<a href="${href}">x</a>`;
      expect(kinds(html), href).toEqual(["LINK"]);
      const out = resolve(html, corpus);
      expect(
        out.changes.map((c) => c.kind),
        href,
      ).toEqual(["unwrapped"]);
      expect(kinds(out.html), href).toEqual([]);
    }
  });

  it("a cleaned URL still resolves to the citation it names", () => {
    const out = resolve(`<a href="  https://jumble.social/notes/${EVENT_ID}\n">source</a>`, corpus);
    expect(hrefOf(out.html)).toBe(toPermalink(EVENT_ID));
    expect(kinds(out.html)).toEqual([]);
  });

  it("a same-document #fragment is not a link out", () => {
    expect(kinds('<a href="#lead">the lead</a><h2 id="lead">x</h2>')).toEqual([]);
    expect(resolve('<a href="#lead">x</a>', corpus).changes).toEqual([]);
  });

  it("SVG links, SVG animation and MathML links", () => {
    refused('<svg><a xlink:href="javascript:alert(1)"><text>x</text></a></svg>');
    refused('<svg><a href="https://evil.example"><set attributeName="href" to="javascript:alert(1)"/></a></svg>');
    refused('<math href="javascript:alert(1)"><mi>x</mi></math>');
    expect(kinds("<svg></svg>")).toEqual(["MARKUP"]);
  });

  it("outside resources outside <img>", () => {
    refused('<link rel="stylesheet" href="https://evil.example/a.css">');
    refused('<video poster="https://evil.example/x.jpg"></video>');
    refused('<img src="https://blossom.example.com/real.jpg" poster="https://evil.example/x.jpg">');
    refused('<table background="https://evil.example/x.jpg"><tr><td>x</td></tr></table>');
    refused('<svg><image href="https://evil.example/x.jpg"/></svg>');
    refused('<picture><source srcset="https://evil.example/x.jpg"></picture>');
  });

  it("an image is judged by the URL a browser would fetch", () => {
    expect(kinds('<img src=" https://blossom.example.com/real.jpg ">')).toEqual([]);
    expect(kinds('<img src="//evil.example/x.jpg">')).toEqual(["IMAGE"]);
  });

  it("CSS escapes, image-set() and the other ways CSS fetches", () => {
    expect(kinds('<style>@\\69mport "https://evil.example/a.css";</style>')).toContain("MARKUP");
    expect(kinds('<div style="background:\\75rl(https://evil.example/x.jpg)"></div>')).toContain("MARKUP");
    expect(kinds("<div style=\"background-image:image-set('https://evil.example/x.jpg' 1x)\"></div>")).toContain(
      "IMAGE",
    );
    expect(kinds("<style>.a{background:-webkit-image-set('https://evil.example/x.jpg' 1x)}</style>")).toContain(
      "IMAGE",
    );
    expect(kinds("<style>@font-face{font-family:x;src:local(x)}</style>")).toContain("MARKUP");
    expect(kinds("<style>@namespace svg 'x';</style>")).toEqual([]);
    expect(kinds("<style>@document url-prefix(){a{color:red}}</style>")).toContain("MARKUP");
    expect(kinds("<style>.a{behavior:url(x.htc)}</style>")).toContain("MARKUP");
    // Ordinary words are not refused for looking like those.
    expect(kinds("<style>html{scroll-behavior:smooth}.a{image-rendering:auto}</style>")).toEqual([]);
  });

  it("hidden text inside a quote, by attribute", () => {
    // Every word is in the event; what the reader sees drops the "didn't".
    const hide = (attrs: string) => `<q>and then it <em ${attrs}>didn't</em> answer at all</q>`;
    expect(kinds(hide(""))).toEqual([]);
    for (const attrs of ['style="display:none"', 'class="x"', "hidden", 'aria-hidden="true"', 'dir="rtl"']) {
      expect(kinds(hide(attrs)), attrs).toContain("MARKUP");
    }
    expect(kinds(`<q style="font-size:0">${QUOTE}</q>`)).toContain("MARKUP");
    expect(kinds(`<q>${QUOTE} <span>x</span></q>`)).toContain("MARKUP");
  });

  it("hidden text inside a quote, by stylesheet", () => {
    const quote = "<blockquote><p>and then it <em>didn't</em> answer at all</p></blockquote>";
    expect(kinds(`<style>blockquote em{display:none}</style>${quote}`)).toContain("MARKUP");
    expect(kinds(`<style>p em{font-size:0}</style>${quote}`)).toContain("MARKUP");
    expect(kinds(`<style>em{visibility:hidden}</style>${quote}`)).toContain("MARKUP");
    expect(kinds(`<style>blockquote p::first-letter{font-size:0}</style>${quote}`)).toContain("MARKUP");
    expect(kinds(`<style>blockquote{max-height:1em;overflow:hidden}</style>${quote}`)).toContain("MARKUP");
    // Styling a quote, or text in it, without hiding any of it is fine.
    expect(
      kinds(`<style>.lead blockquote{margin:0 auto;max-width:30ch}blockquote em{font-style:normal}</style>${quote}`),
    ).toEqual([]);
    // A rule that can't reach a quote isn't asked.
    expect(kinds(`<style>.kicker{display:none}</style>${quote}`)).toEqual([]);
  });

  it("generated text: ::after content and quotes: that are words", () => {
    expect(kinds(`<style>q::after{content:" - never"}</style><q>${QUOTE}</q>`)).toContain("MARKUP");
    expect(kinds(`<style>.x::before{content:attr(title)}</style><p class="x" title="y">z</p>`)).toContain("MARKUP");
    expect(kinds(`<style>q{quotes:"Never: " ""}</style><q>${QUOTE}</q>`)).toContain("MARKUP");
    expect(kinds(`<p style="quotes:'I never said ' ''"><q>${QUOTE}</q></p>`)).toContain("MARKUP");
    expect(kinds(`<style>.rule::after{content:""}</style><p class="rule">x</p>`)).toEqual([]);
  });

  it("every elision fragment is checked, however short", () => {
    expect(kinds("<q>The relay answered … no … at all</q>")).toEqual(["QUOTE"]);
    expect(kinds("<q>The relay answered … it … at all</q>")).toEqual([]);
  });

  it("attribution is not quote text, and may carry a byline link", () => {
    const attributed = `<blockquote><p>${QUOTE}</p><footer>— <cite><a href="${toProfileLink("aa".repeat(32))}">x</a>Alice</cite></footer></blockquote>`;
    expect(quotedText(parsePage(attributed))).toEqual([QUOTE]);
    expect(kinds(`<blockquote><p>${QUOTE}</p><footer>— <cite>Alice</cite></footer></blockquote>`)).toEqual([]);
    // A link in the attribution is still a link.
    expect(kinds(attributed)).toEqual(["LINK"]);
  });

  it("only the attributes a paper needs", () => {
    expect(kinds('<a href="#x" target="_top">x</a>')).toEqual(["MARKUP"]);
    expect(kinds('<a href="#x" target="_blank" rel="noopener">x</a>')).toEqual([]);
    expect(kinds('<p data-x="1">x</p>')).toEqual(["MARKUP"]);
    expect(kinds('<meta property="og:title" content="x">')).toContain("MARKUP");
    expect(kinds('<meta name="description" content="x">')).toEqual([]);
    expect(kinds("<details open><summary>more</summary><p>x</p></details>")).toEqual([]);
    expect(kinds('<td colspan="2">x</td>')).toEqual([]);
  });

  it("the house page passes as given", () => {
    const page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>The Nostr Observer</title><style>${houseCss}</style></head><body><main><blockquote><p>${QUOTE}</p><footer><cite>Alice</cite></footer></blockquote><p>and <q>then it didn't answer at all</q></p></main></body></html>`;
    expect(check(page, corpus).violations).toEqual([]);
  });

  it("checks the page in the form it settles into after a round trip", () => {
    // Built in the DOM, a <blockquote> can sit inside a <p>; written out and read back, it can't.
    const doc = parsePage("<p>lead</p>");
    const quote = doc.createElement("blockquote");
    quote.textContent = "This sentence was never posted by anybody.";
    doc.querySelector("p")!.append(quote);
    const settled = settle(doc);
    expect(settled.stable).toBe(true);
    expect(serialize(settled.doc)).not.toBe(serialize(doc));
    expect(check(doc, corpus).violations.map((v) => v.kind)).toEqual(["QUOTE"]);
  });

  it("the app's CSP leads the head of every page that leaves the sandbox, and the model may not write one", () => {
    const html = withPaperCsp("<!doctype html><html><head><title>t</title></head><body><p>x</p></body></html>");
    const first = parsePage(html).head.firstElementChild!;
    expect(first.getAttribute("http-equiv")).toBe("Content-Security-Policy");
    expect(first.getAttribute("content")).toBe(PAPER_CSP);
    expect(withPaperCsp(html)).toBe(html);
    expect(kinds(`<meta http-equiv="Content-Security-Policy" content="${PAPER_CSP}">`)).toContain("MARKUP");
  });
});

describe("desk links whose address can't be encoded", () => {
  const LONG_ID = "44".repeat(32);
  const long = ev({
    id: LONG_ID,
    kind: 30311,
    pubkey: STREAM_PK,
    tags: [
      ["d", "x".repeat(300)],
      ["status", "live"],
    ],
  });
  const withLong = { ...corpus, desks: { ...corpus.desks, live: [...corpus.desks.live, long] } } as Corpus;

  it("have no naddr", () => {
    expect(naddrFor(long)).toBeNull();
    expect(DESK_LINKS.live.canonicalUrlOrNull(long)).toBeNull();
    expect(() => DESK_LINKS.live.canonicalUrl(long)).toThrow();
  });

  it("are unwrapped by resolve, which never throws on corpus content", () => {
    const out = resolve(`<a href="https://zap.stream/stream/${LONG_ID}">x</a>`, withLong);
    expect(out.changes.map((c) => c.kind)).toEqual(["unwrapped"]);
    expect(check(out.html, withLong).violations).toEqual([]);
  });
});
