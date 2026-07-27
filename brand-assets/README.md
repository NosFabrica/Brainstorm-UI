# Brand assets drop folder (Phase 2 of the reskin)

Drop the **entire Figma export pack** into this folder — any structure is fine.
I'll read each file and move it to its correct home in the repo, then wire it up.
This folder is a **staging area only**; it won't be committed (I distribute the
files, then delete it).

## What to drop here (files)
- [ ] **Logo** — SVG(s) incl. a **monochrome** version; any lockups. → will go to `client/src/components/BrainLogo.tsx` (inline SVG) + assets.
- [ ] **Favicons** — `favicon.svg`, `favicon.png`, `favicon-192.png`, `apple-touch-icon.png` (or the source to generate them). → `client/public/`
- [ ] **OG / social image** — 1200×630 (or the art to build it). → `client/public/og-image.png`
- [ ] **Fonts** — WOFF2 files **+ license**, OR just tell me the Google Fonts family names (then no files needed). → `client/public/fonts/` or a Google Fonts `<link>`.
- [ ] **Banner / hero imagery or pattern** (optional) — any default banner art + a sentence on the imagery rules.

## What to PASTE in chat (not files — I can't reliably read these from Figma exports)
- [ ] **Palette values** — hex or HSL, mapped to roles, **including dark-mode ramps**. e.g.:
  - primary = `#xxxxxx` (dark `#xxxxxx`)
  - primary-hover = …
  - accent = … / accent-hover = …
  - deep = … / link = …
  - (and whether the semantic status hues + Verification tier ramp change)
- [ ] **Font names** if using Google Fonts (family + weights).
- [ ] **Figma URL** — reference only.

Once it's here, say the word and I'll start Phase 2.
