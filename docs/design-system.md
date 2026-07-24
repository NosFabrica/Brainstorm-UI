# Brainstorm Design System — primitives

Source of truth: the designer's **UI Foundations** sheet (brand guidelines v1, p17),
which specifies Card / Buttons / Tags & Badges / Alerts / Tabs / Segmented control /
Dropdown / Modal / StatTile in light **and** dark. Principle (p17): *"Use colour to
communicate, not decorate."*

These primitives exist so theming/radius/shadow/spacing are defined **once**. New
UI must use them instead of hand-rolling `bg-<color>-50 …` chips or `rounded-2xl
border bg-white dark:bg-slate-900` cards.

## Tones — `client/src/lib/tones.ts`
One map, light + dark per tone. `tone(t)` → `{ bg, text, border, icon, dot }`.
- Named: `emerald amber orange red rose sky blue indigo violet fuchsia teal slate brand accent`
- Semantic aliases: `success`→emerald · `warning`→amber · `danger`→red · `info`→sky · `neutral`→slate
- `brand` = Aurora Purple, `accent` = Aurora Cyan.

## Chip — `components/ui/chip.tsx`
Tinted pill for tags, status badges, counts (p17 "Tags & Badges").
```tsx
<Chip tone="emerald" icon={Check}>Verified</Chip>
<Chip tone="slate" dot>Member</Chip>
<Chip tone="success" size="sm">Saved</Chip>
```

## StatTile — `components/ui/stat-tile.tsx`
Metric tile (p15: icon + value + label).
```tsx
<StatTile icon={Users} value="1.2K" label="People" tone="brand" aside={<Chip .../>} />
```

## SectionHeader — `components/ui/section-header.tsx`
Aurora-cyan mono kicker + hairline (the "TRUST OVER NOISE" style labels).
```tsx
<SectionHeader kicker="Identity" icon={UserRound} />
```

## Card — `components/ui/card.tsx`
Canonical surface (semantic tokens → theme-aware). Default is quiet; pass
`interactive` for the hover-lift (clickable cards only).
```tsx
<Card>…</Card>
<Card interactive onClick={…}>…</Card>
```

## Also use the existing themed primitives
- `ui/badge.tsx` — brand/success/warning variants (rounded-full).
- `ui/alert.tsx` — info / success / warning / destructive (matches p17 Alerts).
- `ui/tabs.tsx` (rounded-full pill), `ui/button.tsx` (Primary/Secondary/ghost/destructive).

## Not migrated (intentionally bespoke)
Hero/photo panels (Login, Onboarding, HomeHero, marketing heroes) · OG/share
preview cards (fixed-light by design) · data-viz/domain visuals (VerificationCoin,
tier rings, network donut, sparklines) · the AccountMenu panel + AppsLauncher tiles.

## Deferred
Interface icons should be Phosphor per guidelines p16; the app uses `lucide-react`.
Migration deferred — do not treat lucide as a bug. Primitives are icon-agnostic.
