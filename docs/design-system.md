# Brainstorm Design System — primitives

Source of truth: the designer's **UI Foundations** sheet (brand guidelines v1, p17),
which specifies Card / Buttons / Tags & Badges / Alerts / Tabs / Segmented control /
Dropdown / Modal / StatTile in light **and** dark. Principle (p17): *"Use colour to
communicate, not decorate."*

These primitives exist so theming/radius/shadow/spacing are defined **once**. New
UI must use them instead of hand-rolling `bg-<color>-50 …` chips or `rounded-2xl
border bg-white dark:bg-slate-900` cards.

## Colour system — `client/src/index.css` tokens

Canonical palette (brand guidelines v1, **p5 — Colour System**). *"Neutral tones
create clarity; purple and cyan are reserved for moments of trust, interaction and
focus."* The **only** brand gradient is Aurora Purple → Aurora Cyan (never reversed).

| Token | Hex | Role |
|---|---|---|
| `--background` (dark) | `#0A0E18` | Brainstorm Ink — dark ground |
| `--background` (light) | `#F2F3F0` | Balanced White — light ground |
| `--brand-primary` / `--brand-link` | `#7237FF` | Aurora Purple — the accent |
| `--brand-accent` | `#13D2E5` | Aurora Cyan — the accent |
| Aurora Gradient | `#7237FF → #13D2E5` | always Purple → Cyan |

**Sanctioned supporting shades** (designer-approved, reviewed against v1). These are
**not** additional brand colours — they are derived depth/interaction steps of the two
accents, used only where the palette needs a darker value. Do not treat them as a 5th/6th
brand colour, and never add other off-palette hues (no navy/indigo/teal-green) beside them.

| Token | Hex (light) | Purpose | Rule |
|---|---|---|---|
| `--brand-deep` | `#2B174F` | dark tint of Aurora Purple — depth on emphasis surfaces + deep accent text | In **dark** mode this token flips to a light violet, so on dark grounds don't use `bg-brand-deep`; use `dark:bg-brand-primary/[0.15]` + `dark:border-brand-accent/25` instead. |
| `--brand-primary-hover` | `#612FD9` | Aurora Purple hover/active state | Hover/active only. |
| `--brand-accent-hover` | `#287E89` | Aurora Cyan hover/active state | Hover/active only. |

Guardrails (p5): purple/cyan mark **trust · interaction · focus** — reserve them for those
moments. Chrome (UI icons, section labels, body) leans on the **neutrals** (Ink / Balanced
White / slate) so the accents keep their meaning. A large colour surface behind body copy
uses the neutrals or an **Aurora Purple → Ink** fade — not a saturated Purple→Cyan
(legibility) and never an off-palette hue.

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

### KindPill — `components/ui/kind-pill.tsx`
The Chip that says what a content item *is* — Spec, Article, Listing, App, Event, Stream, Track… —
fed by the one registry in `lib/kindLabel.ts`. **By default only a spec is named**, where it sits among
other kinds (the Articles tab, Everything's Articles section, the reader page): a spec from Nostr Hub has
no NIP number, and the word is what says what it is. Every other kind stays unlabelled until a signed-in
reader turns on *Kind labels on every card* (Settings › Advanced, per device, `lib/kindLabelsPref.ts`) —
the team's and technical readers' view, where every card, row and tile says its kind. Always slate: a kind
is a label, not a status, and colour is kept for trust and interaction. Never a link, never on a person.
A NIP number is never derived or invented.
```tsx
<KindPill event={hit.event} />
<KindPill label="News" />   // where the content's shape is the label
```

## StatTile — `components/ui/stat-tile.tsx`
Metric tile (p15: icon + value + label).
```tsx
<StatTile icon={Users} value="1.2K" label="People" tone="brand" aside={<Chip .../>} />
<StatTile compact value={4} label="Faults" tone="warning" />   // one line: dot · value · label, for a strip of counts above a list
```

## SectionHeader — `components/ui/section-header.tsx`
Aurora-cyan mono kicker + hairline (the "TRUST OVER NOISE" style labels).
```tsx
<SectionHeader kicker="Identity" icon={UserRound} />
```
`variant="title"` renders a sentence-case heading in the display face instead
— for surfaces that stack many sections (the search results page), where a
column of coloured kickers reads as decoration. Colour stays with the content.
```tsx
<SectionHeader variant="title" kicker="Latest" />
```

## Card — `components/ui/card.tsx`
Canonical surface (semantic tokens → theme-aware). Default is quiet; pass
`interactive` for the hover-lift (clickable cards only), or `accent` for the
Aurora wash + glow when one card in a set genuinely has to be noticed (the
backup nag, the plan you are on). Reach for `accent` rather than spelling out a
`border-brand-accent/… ring-…` yourself — the prop carries the dark values too.
```tsx
<Card>…</Card>
<Card interactive onClick={…}>…</Card>
<Card accent={isMine}>…</Card>
```

## ReadingText — `components/share/ReadingText.tsx`
Any body of network prose shown in full on an event page — a note, a listing's
description, a calendar event's About, a video summary. Owns the reading type
(`post` for the event itself, `body` for a description under a hero title),
paragraphs, light markdown, HTML-to-text, and the prose pass that finds
headlines, captions and section heads in unmarked text (`lib/noteBlocks.ts`).
Don't hand-roll `whitespace-pre-line text-sm leading-relaxed` for these.
```tsx
<ReadingText text={listing.description} className="mt-4" />
<ReadingText tokens={tokens} size="post" renderToken={rich} />   // NoteContent
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
