# Built on Brainstorm

The line at the foot of every app built on Brainstorm and Tapestry: Brainstorm's mark, then
"Built on Brainstorm", the whole of it one link to brainstorm.world. One element, which
each app copies once, and one stylesheet that gives it its look, so a restyle here reaches
every app with no change in any of them. Why it is built this way, and what was weighed
against it: [ADR 0010](adr/0010-built-on-brainstorm-is-a-copied-element-with-a-shared-look.md).

## The files

All three are in `client/public/built-on/` and served from `https://brainstorm.world/built-on/`.

| File                     | What it is                                                                                                                                                    |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `built-on-brainstorm.js` | The element, `<built-on-brainstorm>`. Apps copy this file; they never load it from here.                                                                      |
| `v1.css`                 | The look, which every copy of the version 1 element loads. A restyle is an edit to this file.                                                                 |
| `index.html`             | A page that shows the line on several grounds, drawn with this deployment's own `v1.css`: open it on staging to check a restyle before it reaches production. |

nginx serves `/built-on/` with `Cache-Control: public, max-age=3600`,
`Access-Control-Allow-Origin: *` and `X-Content-Type-Options: nosniff`, and answers a
missing file there with a 404, never the app's page.

## Using it in an app

1. Copy `built-on-brainstorm.js` into the app's source, as it is. Its first lines name the
   version and where it came from.
2. Load it once, as a module: `import "./built-on-brainstorm.js";` in a bundled app, or
   `<script type="module" src="/built-on-brainstorm.js"></script>` in a page.
3. Put `<built-on-brainstorm></built-on-brainstorm>` where the line goes, at the foot of
   the page.
4. Add `https://brainstorm.world` to the app's Content Security Policy's `style-src`. It
   needs no script source and no `'unsafe-inline'`.
5. Fit it to the page with the hooks below, and nothing else.

## What the element owns

These are the same in every app, and change only with a new version:

- the link: `https://brainstorm.world`, in a new tab, with `rel="noopener noreferrer"`, so
  brainstorm.world is told nothing of the page the person came from;
- the words, "Built on Brainstorm";
- the link's name for a screen reader, "Built on Brainstorm (opens in a new tab)": the
  words, then what every link that leaves an app says;
- the mark, drawn as `BrainLogo`'s `mono` mark (`client/src/components/BrainLogo.tsx`): the
  same path, in one colour, the text's, since the brand's two colours turn to mud at this
  size. A screen reader skips it: the words name it.

It draws them in an open shadow root:

```html
<built-on-brainstorm>
  #shadow-root
  <link
    rel="stylesheet"
    href="https://brainstorm.world/built-on/v1.css"
    crossorigin="anonymous"
    referrerpolicy="no-referrer"
  />
  <a part="link" href="https://brainstorm.world" target="_blank" rel="noopener noreferrer">
    <svg part="mark" viewBox="0 0 71 73" fill="currentColor" aria-hidden="true" focusable="false">…</svg>
    <span part="words">Built on Brainstorm</span>
    <span class="unseen">(opens in a new tab)</span>
  </a>
</built-on-brainstorm>
```

The `stylesheet` attribute points the element at another copy of the stylesheet. It is for
the preview page and for tests; an app leaves it out.

## Fitting it to an app

The line takes the colour and font of the text around it, so on most pages it needs
nothing. An app that wants more sets, on the element:

| Hook                     | What it sets                                                    | When unset                        |
| ------------------------ | --------------------------------------------------------------- | --------------------------------- |
| `--built-on-color`       | The words and the mark.                                         | The colour it inherits.           |
| `--built-on-hover-color` | The words and the mark while the link is pointed at or focused. | `--built-on-color`.               |
| `--built-on-focus-color` | The keyboard focus ring.                                        | The link's colour at that moment. |
| `font-size`              | The words; the mark and the gap between them scale with it.     | The size it inherits.             |
| margins, alignment       | Where the line sits.                                            | The page's layout.                |

For example, a caption-coloured line that turns to the ink colour when pointed at:

```css
built-on-brainstorm {
  font-size: 13px;
  --built-on-color: var(--muted);
  --built-on-hover-color: var(--ink);
}
```

On a dark part of a page, set the same properties to that ground's colours.

The parts `link`, `mark` and `words` can be styled from the page with `::part()`, and such
a rule wins over the shared look. That is a way out for a page the hooks cannot serve,
not a way to restyle the line: a page that restyles it with `::part()` no longer follows
a restyle here.

## The look

`v1.css` owns everything the hooks do not: the layout of the mark and the words, the gap
between them, the mark's size against the text, the underline when the link is pointed at
or focused, the focus ring's shape, and the height a tap needs (44px).

The stylesheet is loaded inside the element's shadow root, so it styles the line and
nothing else on the page. Its rules:

- **It asks for nothing.** No `@import`, no `@font-face` and no `url()` but a `data:` one:
  loading it is the only request the line makes. The fonts are the app's.
- **It honours the contract:** the three properties above, with the defaults the table
  gives, and the parts `link`, `mark` and `words`.
- **It is unlayered,** so it wins over the look the element carries itself.

`client/src/test/builtOnBrainstorm.test.tsx` holds the stylesheet to these rules, and the
element to what it owns.

## When the stylesheet cannot load

The element carries the look as it was when its version was cut, in a cascade layer
(`built-on-baseline`) that `v1.css` always wins over. Offline, behind a policy that does
not allow brainstorm.world, or on a deploy that lost the file, the line keeps that look.
Its own styles are set through the CSS object model (`adoptedStyleSheets`), which a
Content Security Policy does not govern, and through a `<style>` element only where a
browser cannot adopt a stylesheet.

## Changing it

- **A restyle:** edit `v1.css`, keeping to the rules above. Check `/built-on/` on staging
  after the merge into `staging`; every app has it within an hour of the production
  deploy that carries it.
- **A change to the words, the link, the parts or the hooks:** a new version. Copy the
  element to a version 2 file that loads `v2.css`, write `v2.css`, and leave version 1 as
  it is until no app uses it. Each app moves when it copies the new file.
