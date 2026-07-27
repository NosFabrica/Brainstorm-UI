# Rebrand / reskin — new visual identity (look-only) + dark mode

**Status:** proposed — awaiting assets + review (do not build the visible reskin until the asset pack lands)
**Scope decided (with Benjamin):** **Look-only** (keep the "Brainstorm" name/wordmark text; new colors, fonts, logo art, OG/imagery) **+ ship dark mode** in the same effort.
**Related plan:** `docs/plans/dark-mode.md` — the dark-mode half is executed per that doc; this plan sequences it against the new palette.

---

## Context

The team wants to reskin the app to a new visual identity. There was **no existing
rebrand plan and no Figma reference in the repo** — this doc creates it. Two facts
shape the whole approach:

1. **The reskin and dark mode share one root cause.** The app is painted with
   **~2,700 hardcoded colors across 166 files**, of which **~860 are arbitrary
   brand-hex** (`#7c86ff`, `#333286`, `#6366f1`, `#3730a3`, `#5b63d9`). The reskin
   changes those *values*; dark mode adds their *dark counterparts*. Tokenizing
   them **once** unblocks both — otherwise we pay the codemod cost twice.
2. **There is no central brand module.** Brand values live in `client/src/index.css`
   + `tailwind.config.ts` (the token layer) **and** in the inline hex sprawl above.
   Step one is to make the token layer the single source of truth.

Because scope is **look-only**, the literal "Brainstorm" wordmark **text** stays —
no product-name/copy sweep. (If a name change is ever wanted, that's a separate
pass over the wordmark strings in `index.html`, `AppHeader`, `MobileMenu`,
`ShareOgCard`, etc.)

---

## Inputs required from the brand/Figma pack

Execution of the *visible* phases (2+) is gated on receiving these. Phase 1
(tokenization) is asset-agnostic and can start now.

| Asset (you provide) | Maps to (we change) |
| --- | --- |
| **Figma link + UI-guidelines page** (view access) | source of truth for all below |
| **Token/palette sheet** — roles + ramps + **dark-mode ramps** | `index.css` `:root` + `.dark` CSS vars; new brand tokens |
| **Logo pack** — SVG (incl. monochrome), PNGs, lockups, favicon sizes | `BrainLogo.tsx`, `brainstormAppIcons.tsx`; `client/public/` favicons + touch icons |
| **Font families/weights + source** (Google Fonts names or WOFF2 + license) | Google Fonts `<link>` in `index.html`; `--font-*` vars in `index.css` |
| **OG image / art + imagery-pattern rules** (banners & heroes) | `client/public/og-image.png`; `profileDefaults.ts` banner gradient; default hero/banner backgrounds |
| **Brand guidelines PDF** (voice/copy) | reference only for look-only; wordmark strings only if a name/tagline shift is later approved |

---

## The reskin surface (from codebase inventory)

- **HTML metadata / social** — `client/index.html`: `<title>`, description, keywords,
  author, `theme-color` (`#0f0d2e`), canonical, full OpenGraph + Twitter block,
  Google Fonts `<link>`. Also `LegalDocLayout.tsx:83` (`document.title` suffix).
- **Logo components** — `client/src/components/BrainLogo.tsx` (3-concept inline SVG,
  imported in ~34 files) and `client/src/components/brainstormAppIcons.tsx`
  (app-launcher glyphs).
- **Static brand assets** — `client/public/`: `favicon.svg`, `favicon.png`,
  `favicon-192.png`, `apple-touch-icon.png`, `og-image.png`, `nosfabrica-logo.png`,
  `megistus-icon-white.png`, `assistant-default.*`, `assistant-banner.*`; plus the
  PovBadge avatar under `attached_assets/` and partner logos in
  `client/src/assets/*-logo.*` (ecosystem marks — likely unchanged).
- **Design tokens** — `client/src/index.css` (`:root` + `.dark` vars, `--font-*`,
  `.font-brand` utility) and `tailwind.config.ts` (color/font token mappings, already
  fully `hsl(var(--…))`-driven, `darkMode: ["class"]`).
- **Hardcoded brand-hex sprawl** (the big one) — `#7c86ff` (~399 / ~62 files),
  `#333286` (~301 / ~57), `#6366f1` (~94 / ~42), `#3730a3` (~62 / ~33), `#5b63d9`
  (7). Clusters across `client/src/pages/` and `client/src/components/` (esp.
  `share/`, `admin/scheduling/`, `whatiswot/`). **Keep `#F7931A`** (bitcoin orange,
  semantic — `FlashIcon.tsx`, `SharePage.tsx`).
- **Brand-content defaults** — `client/src/lib/profileDefaults.ts`:
  `DEFAULT_BANNER_CLASS` = `from-[#7c86ff] via-[#333286] to-[#7c86ff]`.

---

## Strategy: tokenize once, then reskin, then dark

Add a **named brand-token layer** so brand color lives in exactly one place, then
codemod the sprawl onto it. After that, reskinning is changing values and dark mode
is adding `.dark` values for the same tokens.

Proposed tokens (in `index.css`, exposed as Tailwind colors in `tailwind.config.ts`):

| New token | Replaces (light) | Role |
| --- | --- | --- |
| `--brand-primary` → `brand-primary` | `#6366f1` | primary buttons, wordmark |
| `--brand-primary-hover` | `#5b63d9` / `#4f46e5` | button hover |
| `--brand-accent` → `brand-accent` | `#7c86ff` | kickers, accent lines, chips |
| `--brand-deep` → `brand-deep` | `#333286` | deep accent text |
| `--brand-link` → `brand-link` | `#3730a3` | links, secondary text/border |

Codemod is **scripted per color, reviewed file-by-file** (some usages are opacity
variants like `#7c86ff/30` → `brand-accent/30`; a few are semantic). `#F7931A`
stays literal.

---

## Phased execution (gated; nothing ships broken)

### Phase 0 — Asset intake + token contract
Collect the six buckets from Figma; finalize the token names/roles above against the
palette sheet (including which light hex maps to which token, and the dark ramp for
each). No code change beyond agreeing the contract.

### Phase 1 — Tokenize the brand sprawl (asset-agnostic, no visible change)
- Add the `--brand-*` vars to `index.css` `:root` **set to today's exact hex** (so
  the app looks identical), and expose them as Tailwind `brand-*` colors in
  `tailwind.config.ts`.
- Codemod `#7c86ff → brand-accent`, `#333286 → brand-deep`, `#6366f1 → brand-primary`,
  `#3730a3 → brand-link`, `#5b63d9 → brand-primary-hover` across `client/src`
  (preserving `/opacity` suffixes). Point `DEFAULT_BANNER_CLASS` at the tokens.
- **Gate:** `tsc` + `vite build` green; light UI **pixel-identical** to before.

### Phase 2 — Apply the new brand (light) — needs assets
- **Colors:** change the `--brand-*` (and any `:root` semantic) values to the new
  palette. One file, whole-app effect.
- **Fonts:** swap the Google Fonts `<link>` (or add WOFF2 `@font-face`) + update
  `--font-sans/display/brand/mono`. Verify license.
- **Logo:** replace the SVGs in `BrainLogo.tsx` (drop the 3-concept cycler unless
  still wanted) and `brainstormAppIcons.tsx`.
- **Favicons / touch icon / theme-color:** replace `client/public/favicon.*`,
  `apple-touch-icon.png`, `favicon-192.png`; update `index.html theme-color`.
- **OG / social:** replace `og-image.png` + the `og:`/`twitter:` tags; refresh
  banner/hero imagery per the pattern rules.
- **Gate:** dark-preview not yet; light reskin reviewed on every surface.

### Phase 3 — Dark mode (per `docs/plans/dark-mode.md`, against the new palette)
- **Infra:** `client/src/lib/theme.ts` + `ThemeProvider` + `useTheme()` (System /
  Light / Dark, `localStorage.brainstorm_theme`); no-flash inline script in
  `index.html <head>`; fix shared primitives (`components/ui/card.tsx`,
  `button.tsx`, inputs).
- **Dark brand values:** add `.dark` values for the `--brand-*` tokens from the
  palette sheet's dark ramps (this is where "ship dark mode too" plugs into the new
  identity).
- **Slate `dark:` sweep:** apply the canonical light→dark map from `dark-mode.md`
  across product surfaces (surfaces/borders/text), reviewed file-by-file.
- **Dark background:** `GlossBackground.tsx` dark treatment.
- **Expose toggle last:** Settings → Appearance + account-menu control, only after
  Phases 1–3 pass dark review.
- **Marketing stays light v1** (landing, `/p` share pages, `/t`, OG) per
  `dark-mode.md` decision 1.

---

## Verification

- `npx tsc --noEmit` + `npx vite build` green at every phase.
- **Phase 1 regression:** diff key screens vs. current light — must be identical.
- **Phase 2:** review each surface in light against the Figma UI-guidelines page;
  check favicon/OG render (share-link preview, browser tab).
- **Phase 3:** dark-preview each product surface (`class="dark"` on `<html>`):
  Dashboard, Network, Settings, Profile, app shell, modals, note cards, trust
  rings/coins; no-flash hard-reload check; System-tracking (flip OS appearance);
  marketing-immunity (stays light with `class="dark"`); contrast audit.
- Deploy to **staging** via the `deploy-staging` skill for team review (as done for
  the aesthetic pass).

---

## Effort & risks

- **Multi-session.** Phase 1 codemod (~860 refs) and Phase 3 slate sweep (~2,700
  refs) are the bulk; both are mostly mechanical but need file-by-file eyes.
- **Prerequisite:** Phases 2–3 need the asset pack + palette (incl. dark ramps).
  Phase 1 can proceed immediately and de-risks everything after.
- **Verification-score coin ramp** (`trustThreshold.ts` tier colors) and semantic
  status hues (emerald/amber/red) carry meaning — confirm whether the rebrand
  restyles them or leaves them as-is.
- **Tier avatar ring** hardcodes inner `#fff` — must become the themeable card color
  in dark (noted in `dark-mode.md`).
