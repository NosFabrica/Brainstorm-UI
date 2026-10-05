# Brainstorm Design System — primitives

Source of truth: the designer's **UI Foundations** sheet (brand guidelines v1, p17),
which specifies Card / Buttons / Tags & Badges / Alerts / Tabs / Segmented control /
Dropdown / Modal / StatTile in light **and** dark. Principle (p17): _"Use colour to
communicate, not decorate."_

These primitives exist so theming/radius/shadow/spacing are defined **once**. New
UI must use them instead of hand-rolling `bg-<color>-50 …` chips or `rounded-2xl
border bg-white dark:bg-slate-900` cards.

## Colour system — `client/src/index.css` tokens

Canonical palette (brand guidelines v1, **p5 — Colour System**). _"Neutral tones
create clarity; purple and cyan are reserved for moments of trust, interaction and
focus."_ The **only** brand gradient is Aurora Purple → Aurora Cyan (never reversed).

| Token                              | Hex                 | Role                          |
| ---------------------------------- | ------------------- | ----------------------------- |
| `--background` (dark)              | `#0A0E18`           | Brainstorm Ink — dark ground  |
| `--background` (light)             | `#F2F3F0`           | Balanced White — light ground |
| `--brand-primary` / `--brand-link` | `#7237FF`           | Aurora Purple — the accent    |
| `--brand-accent`                   | `#13D2E5`           | Aurora Cyan — the accent      |
| Aurora Gradient                    | `#7237FF → #13D2E5` | always Purple → Cyan          |

**Sanctioned supporting shades** (designer-approved, reviewed against v1). These are
**not** additional brand colours — they are derived depth/interaction steps of the two
accents, used only where the palette needs a darker value. Do not treat them as a 5th/6th
brand colour, and never add other off-palette hues (no navy/indigo/teal-green) beside them.

| Token                   | Hex (light) | Purpose                                                                    | Rule                                                                                                                                                                           |
| ----------------------- | ----------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `--brand-deep`          | `#2B174F`   | dark tint of Aurora Purple — depth on emphasis surfaces + deep accent text | In **dark** mode this token flips to a light violet, so on dark grounds don't use `bg-brand-deep`; use `dark:bg-brand-primary/[0.15]` + `dark:border-brand-accent/25` instead. |
| `--brand-primary-hover` | `#612FD9`   | Aurora Purple hover/active state                                           | Hover/active only.                                                                                                                                                             |
| `--brand-accent-hover`  | `#287E89`   | Aurora Cyan hover/active state                                             | Hover/active only.                                                                                                                                                             |

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

Tag chips on people rows in search (`components/search/PersonTagChips.tsx`): every person wears their own tags quietly in `slate`; the tag the words matched is the one loud chip in `brand` (an unknown-creator tag stays `slate` with the plain-words tooltip). Right-aligned so a list scans, at most two in the typeahead and three on a card, one on a phone; always a link to the tag page, never a filter.

```tsx
<Chip tone="emerald" icon={Check}>Verified</Chip>
<Chip tone="slate" dot>Member</Chip>
<Chip tone="success" size="sm">Saved</Chip>
```

## Result rows — `components/search/SerpRow.tsx`, `sections.tsx`

The rows on the Everything page and the home feed follow Google's result proportions (the team, 2026-09-29: "do I need glasses?"). Reading text on a result row is never below 14px, meta never below 12px; pills are the exception.

| Element                                        | Size                                                                                |
| ---------------------------------------------- | ----------------------------------------------------------------------------------- |
| Author name (the source line)                  | 14px `text-sm`, avatar 24px                                                         |
| Time, feed, type meta, engagement              | 12px `text-xs`                                                                      |
| Title (articles, linked pages, news headlines) | 20px `text-xl` at `sm:`, 18px on phones, `leading-[1.3]`                            |
| Snippet body                                   | 14px `text-sm leading-[1.58]`, three lines, two under a title                       |
| Thumbnail                                      | 92px square, `rounded-xl`, 16px gap                                                 |
| Row                                            | `py-3.5`, lists are `space-y-1` — whitespace before dividers, no rules between rows |
| Section title                                  | 16px (`SectionHeader variant="title"`); "See all" 13px; "+N more from" 12px         |

### The search popup — `components/search/SearchBox.tsx`

The popup offers **destinations**; the results page explains and previews. We cannot know
whether "developer" means the tag or a person, so each reading is one row of its own kind and
the reader picks (the team, 2026-10-01, after Google's "Poodle · Dog breed").

- Fixed order: completion or `#topic` → shop (the page, when the words ask to shop) → tags (2)
  → people (6) → "See all results".
- The grey line's first word is the kind: `Tag · 5 people`, `Topic · …`, `Shop · 4+ listings`.
  People keep their handle.
- A people row is someone whose **name or handle** matched. A tag's people are behind the tag
  row, which opens the tag page; nobody is pulled into the list for carrying a tag.
- A listed person who carries the matched tag wears it quietly: grey text with a small tag
  icon (`PersonTagLabel`), one tag per person, a label and not a link, clipped before the name
  is, icon only on a phone. The coloured pill is for the results page.
- Shop only when the words ask to shop — shop, store, buy, price, "for sale" — and name
  something of at least three letters (`shopWords` in `lib/personContent.ts`). The Shop
  **page** for the words comes first (`honey` / `Shop · 4+ listings` → `/?q=honey&t=shop`):
  shopping is a place to land, as Google's is a tab. The count is a floor — listings named by
  the words; the page also finds mentions. No single product gets a row.
- What a person publishes (Articles, Media, …) shows on hover or the arrowed row, desktop only.

### Listing cards and product options — `ListingCard`, `lib/listingVariants.ts`

One product is one card, wherever things for sale are listed (the Shop tab, the Everything
row, a seller's shelf and page, "More for sale", the popup's count).

- **Which listings are one product** is the seller's to say: the Open Markets `type` tag
  (`variable` parent, `variation`s pointing at it with an `a` tag, the option in `spec`).
  Only listings that carry no `type` are folded by the older title guess.
- The card is the parent's (its title, its page). It says `10 options` when every option is
  in hand, `Options available` when a search found some without their parent, and
  `From $46.20` only when the options' prices differ. With an options badge, the photo count
  is not shown.
- The parent is never one of its own options. On a product page the options are chips named
  by their spec value under the option's name (`Size  XS S M …`), sizes small to large, the
  one being read marked; each chip is that option's own listing, with its own buy link.
- The options row sits where a shopper chooses: inside the product card, under the title and
  above the buy buttons (`ListingOptions`), not below the description.
- The seller's categories are how a listing is found, not what a buyer reads first: under the
  description, five at first with `+N more`, each once (no plural or case repeats) and never
  the seller's own name (`categoriesToShow`).
- Hidden means not shown: a hidden option is not offered, and a hidden parent hides its options.

### KindPill — `components/ui/kind-pill.tsx`

The Chip that says what a content item _is_ — Spec, Article, Listing, App, Event, Stream, Track… —
fed by the one registry in `lib/kindLabel.ts`. **By default only a spec is named**, where it sits among
other kinds (the Articles tab, Everything's Articles section, the reader page): a spec from Nostr Hub has
no NIP number, and the word is what says what it is. Every other kind stays unlabelled until a signed-in
reader turns on _Kind labels on every card_ (Settings › Advanced, per device, `lib/technicalView.ts`) —
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
