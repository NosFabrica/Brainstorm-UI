# Dark mode — OS-aware theming for the logged-in product

**Status:** proposed — awaiting review (do not build yet)
**Branch:** `njump-profile-share`
**Author context:** grilling session, 2026-07-01

---

## Goal

Let users run the app in **dark mode**, defaulting to their **OS color
preference** and giving them an explicit **System / Light / Dark** choice. Light
mode must stay **byte-for-byte identical** to today's high-end enterprise look;
dark mode must feel equally premium.

---

## The reality (why this is a migration, not a config flip)

The **foundation is already complete** and needs no work:

- `tailwind.config.ts` → `darkMode: ["class"]` (class strategy, ready).
- `client/src/index.css` already defines a **full `.dark` token set** (~45
  semantic tokens: `--background`, `--foreground`, `--card`, `--primary`,
  `--muted-foreground`, `--border`, shadows, etc. — all with dark values).
- shadcn/ui is configured with `cssVariables: true`.
- `<html>` in `index.html` is a clean attachment point for `class="dark"`.

**But adoption is ~10–15%.** The app is painted with **~2,700 hardcoded
light-mode colors** across 166 files:

| Pattern | Count |
| --- | --- |
| `text-slate-*` | ~1,524 |
| `border-slate-*` | ~505 |
| `bg-white` | ~437 |
| `bg-slate-*` | ~406 |
| arbitrary brand hex (`bg-[#…]`, `text-[#…]`) | ~661 |

In dark mode today, every one of those stays light → a naive toggle yields a
**broken half-dark app**. So the work is a **careful, mostly-scripted
tokenization/variant sweep**, not a switch flip.

---

## Locked decisions (from grilling)

1. **Scope = the logged-in product only.** Theme the app shell, Dashboard,
   Network, Settings, Profile, and shared product components. **Marketing
   surfaces stay permanently light** (landing, `/p/{npub}` share pages, `/t/`
   topic pages, OG cards) — still fully polished, just light-only. Halves the
   surface and avoids a dark-hero/aurora redesign for v1.

2. **Mechanism = `dark:` variant sweep (fidelity-first).** Leave every existing
   light class untouched; **add** a dark counterpart via one canonical
   light→dark map (below). Guarantees zero light-mode regression and preserves
   the full slate typographic hierarchy in both modes. Separately, fix the
   **shared shadcn primitives once** (`card.tsx`, `button.tsx`, inputs) so
   everything built on them themes for free.

3. **Preference model = three-state System / Light / Dark.** Default **System**
   (live-tracks the OS via `matchMedia('(prefers-color-scheme: dark)')`).
   Explicit Light/Dark is a persisted lock (`localStorage: brainstorm_theme`).

4. **Controls in two places** (shared `useTheme` hook): a canonical
   **Settings → "Appearance"** segmented control (System/Light/Dark, with a
   "System follows your device" hint) **and** a compact control in the **account
   menu** for one-click access.

5. **No flash of wrong theme.** A tiny **blocking inline script** in
   `index.html <head>` sets `class="dark"` on `<html>` synchronously before
   first paint, reading `localStorage.brainstorm_theme` (fallback `matchMedia`).
   Marketing pages are **light-by-construction** (they use no `dark:` variants),
   so the class simply has no effect there — no route-sniffing needed.

6. **Brand + semantic colors:**
   - **Keep as-is** (read well on dark): bright fills `#6366f1` (primary
     buttons, wordmark), `#7c86ff` (kickers/accent lines); and all **semantic
     status hues** (emerald/amber/red) + the **trust-tier ramp** (they carry
     meaning — same hue both modes).
   - **Add lighter dark variants** for dark-toned accents used as text/borders:
     `#3730a3` and `#333286` → `dark:text-indigo-300` / `indigo-400`.
   - **Fix the tier avatar ring:** its hardcoded inner `#fff`
     (`0 0 0 2px #fff`) must become the themeable card color in dark, or the
     ring looks wrong on a dark surface.

7. **Rollout = gate the toggle until complete.** Build all infra + do the full
   sweep behind the scenes, verify every product surface in dark preview, and
   **expose the Settings/account-menu controls only once the logged-in app
   passes end-to-end dark review.** Users never see a broken dark state.

---

## The canonical light → dark map

One source of truth, applied by the sweep. (Values chosen so dark mirrors the
light hierarchy; tuned during implementation against real screens.)

**Surfaces**
| Light | Dark (`dark:`) | Role |
| --- | --- | --- |
| `bg-white` | `bg-slate-900` | cards / raised surfaces |
| `bg-slate-50` | `bg-slate-900` | subtle fills / page wells |
| `bg-slate-100` | `bg-slate-800` | hover / chips / skeletons |
| `bg-slate-200` | `bg-slate-700` | stronger fills |

**Borders**
| Light | Dark |
| --- | --- |
| `border-slate-100` | `border-slate-800/60` |
| `border-slate-200` | `border-slate-800` |
| `border-slate-300` | `border-slate-700` |

**Text (preserve the ramp)**
| Light | Dark |
| --- | --- |
| `text-slate-900` | `text-slate-100` |
| `text-slate-800` | `text-slate-200` |
| `text-slate-700` | `text-slate-200` |
| `text-slate-600` | `text-slate-300` |
| `text-slate-500` | `text-slate-400` |
| `text-slate-400` | `text-slate-500` |

**Brand accents**
| Light | Dark |
| --- | --- |
| `bg-[#6366f1]` / `hover:bg-[#4f46e5]` | *(unchanged — pops on dark)* |
| `text-[#7c86ff]` / `bg-[#7c86ff]/*` | *(unchanged, or `dark:text-indigo-300` for cohesion)* |
| `text-[#3730a3]` (links, secondary text/border) | `dark:text-indigo-300` |
| `text-[#333286]` (deep accent) | `dark:text-indigo-300` |
| tier ring inner `#fff` | card color (`hsl(var(--card))`) |

Semantic (`emerald/amber/red/*`) and trust-tier hues: **no change** — same in
both modes; only verify contrast against the dark card.

The sweep is a **scripted codemod per rule**, but **reviewed file-by-file** — not
a blind global replace (some `bg-white` are on already-dark surfaces, some slate
usages are semantic). Every product file gets eyes + a dark-preview check.

---

## Implementation sequence (gated; toggle exposed last)

### Phase 1 — Theme infrastructure (no visible change yet)
- **`client/src/lib/theme.ts`** (or `ThemeProvider.tsx`): a small provider +
  `useTheme()` hook. State = `"system" | "light" | "dark"`, persisted to
  `localStorage.brainstorm_theme`. Applies/removes `class="dark"` on
  `document.documentElement`. In **system** mode, subscribes to
  `matchMedia('(prefers-color-scheme: dark)')` and updates live; unsubscribes
  when an explicit choice is set.
- **No-flash inline script** in `index.html <head>` (before CSS): read the
  stored pref (or `matchMedia`) and set the class synchronously.
- Wrap the app once (in `App.tsx` / `main.tsx`) with the provider.
- **Fix shared primitives** to token/`dark:` so descendants theme free:
  `components/ui/card.tsx` (`bg-white border-gray-200` → `bg-card
  border-border` / `dark:` pair), `components/ui/button.tsx` (add `dark:`
  variants where needed; keep `#6366f1` primary), inputs/select/dialog surfaces.

### Phase 2 — Dark product background
- Give **`GlossBackground.tsx`** a dark treatment gated by the `dark` class
  (dark base ~`slate-950`/`#0b0b12`, toned-down dark aurora washes, no white
  fade-to-bottom). Product pages use `PageBackground → GlossBackground`, so this
  is the *one* dark background needed. Marketing renders it on light-only pages,
  unaffected. `PageHeader.tsx` gets dark text/accent variants.

### Phase 3 — Sweep the product surfaces (verify each in dark preview)
App shell first, then page by page:
- `components/AppHeader.tsx`, account menu, `Footer.tsx`, `AppsLauncher.tsx`
- `pages/DashboardPage.tsx` (incl. the WoT card), `pages/NetworkPage.tsx`,
  `pages/SettingsPage.tsx`, `pages/ProfilePage.tsx`
- shared product components: `ShareNoteCard`, `NoteContent`, trust
  badges/rings, `PresetBadge`, hovercards, modals (`ProfileEditModal`,
  `BackupReminder`, `CreateAccountModal`), `FollowPicker`, etc.
- Convert the component-level `variant="light|dark"` ternaries
  (`AppHeader`, `ComputingBackground`, `AppsLauncher`) to the real theme class.

### Phase 4 — Expose the controls
- Add the **Settings → Appearance** segmented control and the **account-menu**
  control (both drive `useTheme`). This is the step that makes dark mode
  reachable — done only after Phases 1–3 pass dark review.

---

## Verification

- `npx tsc --noEmit` + `npx vite build` green throughout.
- **Dark-preview each product surface** (preview server, `class="dark"` on
  `<html>`): Dashboard, Network, Settings, Profile, app shell, modals, note
  cards, trust rings/hovercards. Screenshot light vs dark side by side.
- **Light-mode regression check:** diff key screens against current light —
  must be identical (the `dark:` approach guarantees this; verify anyway).
- **No-flash check:** hard-reload in dark → no white flash before paint.
- **System tracking:** in System mode, flip OS appearance → app follows live.
- **Marketing immunity:** landing/share/topic pages stay light even with
  `class="dark"` present.
- Contrast audit on dark: body text, muted text, accent links, tier rings, and
  semantic status colors all meet legibility.

## Edge cases / guards
- Explicit choice must survive reload and win over OS until reset to System.
- SSR/no-`window` guards in the provider (matches existing `typeof window`
  patterns).
- Images/media unaffected; only chrome themes.
- Charts (`ui/chart.tsx`) already have a `.dark` hook — verify.

## Out of scope (fast-follows)
- **Dark marketing surfaces** (landing hero/aurora, share pages, OG cards) —
  extend once the product is solid.
- A richer set of semantic text tokens (if we later want token-based text vs the
  `dark:` ramp).
- Per-org / branded themes.

## Effort note
Much of the ~2,700 refs are mechanical (the map above), but every product file
still needs review + a dark-preview pass. Realistically a **multi-session
effort**, sequenced so nothing ships broken. Marketing exclusion (decision 1)
and the scripted map (mechanism) are the two biggest cost reducers.
