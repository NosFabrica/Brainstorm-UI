# Hero scenes (light + dark pairs)

Human-Signal photography from the designer, one **light** and one **dark**
variant per scene. Light = high-key/faded (sits under a light UI); dark = moody
with the lit Nodes constellation baked in. Consumed by the theme-aware hero
rotator on the homepage (`components/HomeHeroBackground.tsx`) and the login left
panel (`pages/LoginPage.tsx`), via the manifest in
`client/src/lib/heroScenes.ts`.

## Naming

`<scene>-light.webp` and `<scene>-dark.webp` — same base name per pair. Stored
as 1920w WebP (~25–130KB each; the 4K originals from the designer are overkill
for a scrimmed hero). Per-scene crop framing is tuned via `objectPosition` in
the manifest. To add a scene, drop a `-light`/`-dark` pair and add a row to
`heroScenes.ts`. Regenerate from a 4K source with:
`cwebp -q 80 -resize 1920 0 src.jpg -o scene-NN-dark.webp`.

Scenes seen in the drop (rename to these, or drop as-is and tell me the names):

| base       | scene                                   |
|------------|-----------------------------------------|
| `festival` | forest festival / string-lit tents      |
| `jam`      | home jam session (guitar + keys)        |
| `podcast`  | two-mic podcast at a table              |
| `library`  | students studying at a long table       |
| `party`    | backyard party, friends with drinks     |
| `mixer`    | outdoor networking / beer-garden        |

So: `festival-light.webp`, `festival-dark.webp`, `jam-light.webp`, … etc.

Add or drop scenes freely — the manifest drives what rotates and in what order.
