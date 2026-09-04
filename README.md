# Brainstorm

The production web UI for **Brainstorm** — a personalized web-of-trust engine for [nostr](https://nostr.com). Live at [brainstorm.world](https://brainstorm.world).

Brainstorm computes contextual trust scores ([GrapeRank](https://github.com/NosFabrica/protocols/blob/main/specs/graperank.md)) from each observer's point of view and publishes them back to nostr as signed [Trusted Assertions](https://github.com/NosFabrica/protocols/blob/main/specs/trusted-assertions.md). This UI presents them: a search-first home that works logged-out under the NosFabrica ("house") trust perspective, full public profile pages with rank and verified follower/muter/reporter counts, and an optional NIP-07 sign-in that unlocks the personalized "My WoT" perspective, account pages, and NIP-85 service-provider activation (kind 10040). The trust model is explained for users at [/what-is-wot](https://brainstorm.world/what-is-wot).

**Stack:** React + TypeScript + Vite (app root in `client/`), Tailwind with a shared primitives layer (see [docs/design-system.md](docs/design-system.md)), served by nginx in the production container. The backend is [`NosFabrica/brainstorm_server`](https://github.com/NosFabrica/brainstorm_server), reached via `VITE_API_URL`.

## Prerequisites

- **Node 24** — the pin lives in `.nvmrc`, so `nvm use` picks it up. `package.json`
  declares `engines.node: ">=24"`.

## Develop

```bash
nvm use            # reads .nvmrc -> Node 24
npm ci             # install from the lockfile
npm run dev        # Vite dev server
npm run check      # TypeScript
npm test           # vitest
npm run build      # production build → dist/
```

## Run with Docker

```bash
docker build -t brnstui --build-arg VITE_API_URL=https://api.example123.com --build-arg VITE_NIP85_RELAY_URL=wss://nip85.example.com .
```

```bash
docker run -d -p 3000:3000 --name brainstorm-ui brnstui
```

## Configuration

Six variables configure a deployment. Vite bakes them in at build time; the production
container additionally substitutes them into `config.js` at container start
(`docker-entrypoint.sh`), so one image can serve several environments. Both paths are
read through [`client/src/lib/runtimeEnv.ts`](client/src/lib/runtimeEnv.ts), which
prefers the runtime value and falls back to the build-time one.

| Variable | Meaning |
|---|---|
| `VITE_API_URL` | Base URL of the brainstorm_server API |
| `VITE_NIP85_RELAY_URL` | Relay where the deployment's Trusted Assertions live |
| `VITE_WOT_SEARCH_RELAY` | NIP-50 relay backing nostr profile search — unset disables search |
| `VITE_TAG_RELAY_URLS` | Comma-separated tag relays; unset falls back to the hub in `client/src/config/tagging.config.json` |
| `VITE_FEATURE_AGENT_SUITE` | Feature flag — agent suite (default off) |
| `VITE_FEATURE_ASSISTANTS_ADMIN` | Feature flag — assistants admin (default off) |

## Deploying to staging

Staging runs images built by CI from branches of this repo
(`ghcr.io/nosfabrica/brainstorm-ui`), pinned and rolled out via the
[brainstorm-k8s](https://github.com/NosFabrica/brainstorm-k8s) charts
(`ui.image.tag` + `./deploy_staging.sh --ui`). The full branch/PR/pin
workflow — including how to decide whether to join the current staging branch
or start a new cycle — is documented in
[brainstorm-k8s `docs/staging-workflow.md`](https://github.com/NosFabrica/brainstorm-k8s/blob/master/docs/staging-workflow.md).

## Documentation

| Doc | What it covers |
|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | The architecture overview: routing model, anonymous vs. authenticated data paths, the staging/production API switcher, known backend gaps |
| [CONTEXT.md](CONTEXT.md), [docs/adr/](docs/adr/) | The domain vocabulary, and the decisions behind it |
| [CLAUDE.md](CLAUDE.md) | Conventions for AI agents working in this repo: issue triage, domain docs, and the design-system rules |
| [docs/design-system.md](docs/design-system.md) | The shared UI primitives (Chip, StatTile, Card, SectionHeader, tones) and what stays bespoke |
| [docs/brainstorm-admin-api-spec.md](docs/brainstorm-admin-api-spec.md), [docs/brainstorm-assistant-profile-spec.md](docs/brainstorm-assistant-profile-spec.md) | API contracts this UI is wired for, written for the backend |
| [docs/nips/](docs/nips/) | Protocol drafting (Profile Presentation pre-NIP) |
| [docs/decentralized-tagging/](docs/decentralized-tagging/), [docs/trust-tiers/](docs/trust-tiers/), [docs/score-display/](docs/score-display/) | Decision records for shipped feature areas |
| [docs/plans/](docs/plans/) | Proposed feature plans awaiting review |

## The wider estate

This repository is the production UI of a two-organization estate operated by one team. Protocols and features are piloted in the R&D counterpart, [`nous-clawds4/tapestry`](https://github.com/nous-clawds4/tapestry), then adopted here. The canonical map of the estate — every repository, deployment, and role — is [ECOSYSTEM.md](https://github.com/NosFabrica/protocols/blob/main/ECOSYSTEM.md) in [`NosFabrica/protocols`](https://github.com/NosFabrica/protocols), which also houses the wire-format specifications this UI consumes.

## License

[AGPL-3.0](LICENSE)
