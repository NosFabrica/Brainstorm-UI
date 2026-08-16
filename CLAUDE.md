# Brainstorm-UI

## Agent skills

### Issue tracker

Issues and PRDs are tracked in this repo's GitHub Issues (`NosFabrica/Brainstorm-UI`) via the `gh` CLI. External PRs are **not** a triage surface. See `docs/agents/issue-tracker.md`.

### Triage labels

Five canonical triage roles, each mapped to its default label string (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout — one `CONTEXT.md` + `docs/adr/` at the repo root (created lazily by `/domain-modeling`). See `docs/agents/domain.md`.

## Design system (use the primitives)

New UI **must** use the shared primitives instead of hand-rolling styles — this is what keeps theming/spacing consistent and stops dark-mode drift. Do **not** write `bg-<color>-50 dark:bg-<color>-500/10 …` tinted pills or `rounded-2xl border bg-white dark:bg-slate-900 shadow-sm` cards by hand.

- Tinted pill/badge → `<Chip tone=…>` (`components/ui/chip.tsx`)
- Metric tile → `<StatTile …>` (`components/ui/stat-tile.tsx`)
- Card surface → `<Card>` (`components/ui/card.tsx`; `interactive` for clickable)
- Section kicker → `<SectionHeader kicker=… />` (`components/ui/section-header.tsx`)
- Tones (light+dark, one source of truth) → `lib/tones.ts`
- Alerts → `ui/alert.tsx`; tabs → `ui/tabs.tsx`; buttons → `ui/button.tsx`

Anchored to the designer's brand-guidelines p17 "UI Foundations" sheet. Full guide + what stays bespoke: `docs/design-system.md`. Interface icons are lucide today (guidelines spec Phosphor — migration deferred, not a bug).

## Deploying to staging

CI builds an image per branch of this repo; staging pins one of those tags
(`ui.image.tag` in brainstorm-k8s). The branch/PR/pin workflow — including
whether to join the current staging branch or start a new cycle — is
documented in
[brainstorm-k8s `docs/staging-workflow.md`](https://github.com/NosFabrica/brainstorm-k8s/blob/master/docs/staging-workflow.md).
