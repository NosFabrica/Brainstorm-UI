# Hero scenes (light + dark pairs)

Human-Signal photography from the designer, one **light** and one **dark**
variant per scene. Light = high-key/faded (sits under a light UI); dark = moody
with the lit Nodes constellation baked in. Consumed by the theme-aware hero
rotator on the homepage (`components/HomeHeroBackground.tsx`) and the login left
panel (`pages/LoginPage.tsx`), via the manifest in
`client/src/lib/heroScenes.ts`.

## Naming

`<scene>-light.<ext>` and `<scene>-dark.<ext>` — same base name per pair.
`.webp` preferred (smaller); `.jpg` fine. Target ~1920px wide, <400KB each.

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
