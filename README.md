# Brainstorm

The production web UI for **Brainstorm** — a personalized web-of-trust engine for [nostr](https://nostr.com). Live at [brainstorm.world](https://brainstorm.world).

Brainstorm computes contextual trust scores ([GrapeRank](https://github.com/NosFabrica/protocols/blob/main/specs/graperank.md)) from each observer's point of view and publishes them back to nostr as signed [Trusted Assertions](https://github.com/NosFabrica/protocols/blob/main/specs/trusted-assertions.md). This UI presents them: a search-first home that works logged-out under the NosFabrica ("house") trust perspective, full public profile pages with rank and verified follower/muter/reporter counts, and an optional NIP-07 sign-in that unlocks the personalized "My WoT" perspective, account pages, and NIP-85 service-provider activation (kind 10040). The trust model is explained for users at [/what-is-wot](https://brainstorm.world/what-is-wot).

**Stack:** React + TypeScript + Vite (app root in `client/`), Tailwind with a shared primitives layer (see [docs/design-system.md](docs/design-system.md)), served by nginx in the production container. The backend is [`NosFabrica/brainstorm_server`](https://github.com/NosFabrica/brainstorm_server), reached via `VITE_API_URL`.

## Run with Docker

```bash
docker build -t brnstui --build-arg VITE_API_URL=https://api.example123.com --build-arg VITE_NIP85_RELAY_URL=wss://nip85.example.com .
```

```bash
docker run -d -p 3000:3000 --name brainstorm-ui brnstui
```

## Develop

```bash
npm install
npm run dev        # Vite dev server
npm run check      # TypeScript
npm test           # vitest
npm run build      # production build → dist/
```

Two build-time variables configure the deployment targets, both resolved through `client/src/lib/runtimeEnv.ts`:

| Variable | Meaning |
|---|---|
| `VITE_API_URL` | Base URL of the brainstorm_server API |
| `VITE_NIP85_RELAY_URL` | Relay where the deployment's Trusted Assertions live |

## Documentation

| Doc | What it covers |
|---|---|
| [replit.md](replit.md) | The architecture overview: routing model, anonymous vs. authenticated data paths, the staging/production API switcher, known backend gaps |
| [CLAUDE.md](CLAUDE.md) | Conventions for AI agents working in this repo: issue triage, domain docs, and the design-system rules |
| [docs/design-system.md](docs/design-system.md) | The shared UI primitives (Chip, StatTile, Card, SectionHeader, tones) and what stays bespoke |
| [docs/brainstorm-admin-api-spec.md](docs/brainstorm-admin-api-spec.md), [docs/brainstorm-assistant-profile-spec.md](docs/brainstorm-assistant-profile-spec.md) | API contracts this UI is wired for, written for the backend |
| [docs/nips/](docs/nips/) | Protocol drafting (Profile Presentation pre-NIP) |
| [docs/plans/](docs/plans/) | Proposed feature plans awaiting review |

## The wider estate

This repository is the production UI of a two-organization estate operated by one team. Protocols and features are piloted in the R&D counterpart, [`nous-clawds4/tapestry`](https://github.com/nous-clawds4/tapestry), then adopted here. The canonical map of the estate — every repository, deployment, and role — is [ECOSYSTEM.md](https://github.com/NosFabrica/protocols/blob/main/ECOSYSTEM.md) in [`NosFabrica/protocols`](https://github.com/NosFabrica/protocols), which also houses the wire-format specifications this UI consumes.

## License

[AGPL-3.0](LICENSE)
