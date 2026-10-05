# Brainstorm-UI

Production web UI of the Brainstorm/Tapestry estate. The map of the estate's
repos and deployments is
[ECOSYSTEM.md](https://github.com/NosFabrica/protocols/blob/main/ECOSYSTEM.md)
in `NosFabrica/protocols`.

## Orientation

- **Architecture overview** — [ARCHITECTURE.md](ARCHITECTURE.md): the routing model (anonymous search-first vs. authenticated), `RequireAuth`/`optionalAuthFetch` data paths, the staging/production API switcher, known backend gaps. Read it before structural work.
- **Domain model** — [CONTEXT.md](CONTEXT.md) for the vocabulary, [docs/adr/](docs/adr/) for recorded decisions.
- **Wire formats this UI consumes** — kind-30382 Trusted Assertions and kind-10040 designation are specified in [NosFabrica/protocols](https://github.com/NosFabrica/protocols) ([trusted-assertions.md](https://github.com/NosFabrica/protocols/blob/main/specs/trusted-assertions.md); GrapeRank semantics in [graperank.md](https://github.com/NosFabrica/protocols/blob/main/specs/graperank.md)).
- **Reading Nostr data** — from the EventStore; react-query is for the HTTP API: [ADR 0005](docs/adr/0005-nostr-reads-from-the-event-store.md). Review rules: [CODING_STANDARDS.md](CODING_STANDARDS.md).
- **R&D counterpart** — [nous-clawds4/tapestry](https://github.com/nous-clawds4/tapestry), where protocols are piloted before adoption here.

## Agent skills

### Issue tracker

Issues and PRDs are tracked in this repo's GitHub Issues (`NosFabrica/Brainstorm-UI`) via the `gh` CLI. External PRs are **not** a triage surface. See `docs/agents/issue-tracker.md`.

### Triage labels

Five canonical triage roles, each mapped to its default label string (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout — [`CONTEXT.md`](CONTEXT.md) + [`docs/adr/`](docs/adr/) at the repo root. Both exist; extend them rather than starting a parallel glossary. See `docs/agents/domain.md`.

### Running the UI

Locally against staging, for a browser check: `docs/agents/run-ui.md`.

### Shipping to staging

PR → merge into `staging` → deploy staging from brainstorm-k8s. By default create the PR and walk the user through the rest. See `docs/agents/staging-deploy.md`.

## Probing Nostr data

When you need real events (what a kind looks like in practice, who publishes it, how many), fetch them from **`wss://search.brainstorm.world`**, our production relay, before trying public relays. It holds far more than they do (kind 38000: ~16.8k events vs ~750 across ~25 public relays).

- Reads without sign-in are refused as `auth-required`. Put a NIP-50 `search` token in the filter: `"include:spam"` for the whole corpus unranked (what a census wants), or `"observer:<64-hex pubkey>"` for one person's web-of-trust ranking.
- Page back with `until` (oldest `created_at` − 1) until a page comes back empty.
- Use public relays only to cross-check, or for data the production relay doesn't index.

## Signing events

Sign through `signAs()` (`client/src/accounts/signing.ts`), never `account.signEvent`/`finalizeEvent` directly — it picks the Active Account and stamps the `["client", "Brainstorm"]` tag.

## Design system

New UI uses the shared primitives (`Chip`, `StatTile`, `Card`, `SectionHeader`, tones, `SearchBox`, …) — the list and what stays bespoke: `docs/design-system.md`.

## E2E smoke (`e2e/`)

Playwright happy-path checks against **live staging**, not local — CI runs them on PRs into `main` and manual dispatch (`.github/workflows/e2e.yml`).

- Run: `E2E_TEST_NSEC=nsec1… npm run e2e` (`-- --ui` to watch). Signed-in specs skip without the key.
- Locally, any staging account with follows and calculated scores works — the shared CI key isn't handed out. Use a throwaway, never your real nsec.
- Specs select by `data-testid`; renaming one used under `e2e/` means updating the spec in the same change.
- Scope is happy paths only: no onboarding, payments, admin, or flows that publish to relays.
- The test account is an ordinary non-admin user; its nsec lives only in the `staging-e2e` GitHub environment — never in files or logs.
- A failure can be staging (mid-deploy, relay/backend down) rather than the UI — check the trace before changing code.

## Deploying to staging

- `staging` is the default branch and what the staging env runs; `main` is prod.
- Branch off `staging`, PR into `staging`.
- Asked to ship a change: follow `docs/agents/staging-deploy.md` (PR → merge into `staging` → deploy via brainstorm-k8s). Default is to create the PR, then walk the user through merge and deploy, confirming before each.
- Prod: `staging` → `main` as a merge commit, never squash. Core team's call.
- Hotfix: branch off `main`, PR into `main`, then merge `main` back into `staging`.
- Never create temp/join branches for staging or ask for `ui.image.tag` to be repinned; it stays `staging`.

Deploy mechanics:
[brainstorm-k8s `docs/staging-workflow.md`](https://github.com/NosFabrica/brainstorm-k8s/blob/master/docs/staging-workflow.md).
