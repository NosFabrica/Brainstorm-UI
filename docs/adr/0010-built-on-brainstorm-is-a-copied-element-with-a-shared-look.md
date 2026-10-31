# "Built on Brainstorm" is a copied element with a shared look

**Status:** accepted, 2026-10-31.

Every app built on Brainstorm and Tapestry carries a "Built on Brainstorm" line that links
to brainstorm.world. Until now the one app that had it wrote its own. The team wants it to
be one item: restyled in one place, with every app picking up the change and no edit or
version bump in any of them. A package each app installs is ruled out by that, since each
app would have to bump it.

What the item does is small: one link, its words and Brainstorm's mark. What it runs inside
is not. Brainstorm-family apps sign events in the page, through a NIP-07 add-on
(`window.nostr`) or a NIP-46 connection whose key the app keeps in the tab, and some hold a
strict Content Security Policy that lets in only their own scripts.

## Options weighed

1. **A script served from brainstorm.world**, defining the element, loaded by each app with
   one script tag. Every part of it would change centrally: look, words and mark. Rejected:
   the script would run with each app's full access, `window.nostr` and the connection key
   included, so a bad or compromised deploy of one file would reach every app at once, for
   a link. Each app's policy would have to let it in as a script, and subresource integrity
   cannot guard it, since a hash pins the very bytes a restyle changes.
2. **A sandboxed iframe served from brainstorm.world.** Isolated and central. Rejected: each
   app fixes its size, it cannot take the app's font, the app's theme has to travel in its
   URL, and a frame that fails to load shows the browser's error box.
3. **An element each app copies, whose look comes from one stylesheet.** Chosen.

## Decision

- **The element is the app's own code.** `<built-on-brainstorm>`, one framework-free file,
  `client/public/built-on/built-on-brainstorm.js`, which each app copies into its source
  once. It owns what the line says and where it goes: the link to `https://brainstorm.world`
  (a new tab, `noopener noreferrer`), the words, the screen reader's "(opens in a new tab)"
  and the mark, drawn as `BrainLogo`'s `mono` mark. It draws them in a shadow root.
- **The look is one stylesheet,** `https://brainstorm.world/built-on/v1.css`, which the
  element loads inside its shadow root, so its rules reach the line and nothing else on the
  page, and it runs no code. A restyle is an edit to that file.
- **The element carries the launch look itself,** in a cascade layer the stylesheet always
  wins over, so a line whose stylesheet cannot load still looks right.
- **Each app fits it to its page** through the colour and font it inherits, three custom
  properties and its own size and margins. The contract, the rules for the stylesheet and
  how to use the element are in [built-on-brainstorm.md](../built-on-brainstorm.md).
- **It is served from Brainstorm's own origin,** by this repo's nginx, so a reader's browser
  asks no one but Brainstorm, with no referrer and no cookies, and the stylesheet asks for
  nothing further.

## Consequences

- A restyle reaches every app within an hour of the production deploy that carries it:
  the stylesheet is cached for an hour. It goes live on the core team's promotion of
  `staging` to `main`, like any change here.
- A change to the words, to what the line holds or to the contract with apps is a new
  version (`v2.css` and a new element file), which each app copies when it moves. `v1.css`
  stays served until no app uses it.
- Each app's Content Security Policy adds `https://brainstorm.world` to `style-src`, and no
  script source.
- Every page view of every app makes one request to brainstorm.world for the stylesheet,
  answered from the browser's cache within the hour. It carries no referrer and no
  cookies, but like any request it tells brainstorm.world the app's origin and the
  reader's IP address.
- The page's load event waits for the stylesheet, so a slow brainstorm.world keeps a
  browser's loading indicator turning on a first visit within the hour. The page itself
  draws and works meanwhile.
- The shadow root bounds what the stylesheet can select, not what it can draw. A bad or
  compromised deploy of `v1.css` cannot run code, read the page or send the person
  anywhere but brainstorm.world, but it can lay the line over the whole of every app at
  once, with words of its own, and ask for images each app's policy allows. That is far
  less than a script could do, and not nothing. An app that wants the line bounded wraps
  it in `contain: paint`, as the contract says.
