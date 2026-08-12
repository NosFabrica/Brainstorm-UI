# Security Policy

Brainstorm is an open-source Web-of-Trust protocol and search engine built on nostr. This document is
the target of the `Policy` field in the `security.txt` published by every Brainstorm deployment.

## Reporting a vulnerability

**Report privately through GitHub:**
[Report a vulnerability](https://github.com/NosFabrica/Brainstorm-UI/security/advisories/new)

Please do **not** open a public issue for a security report.

Include whatever you have: the affected host or hosts, the version or commit if you know it,
reproduction steps, and what impact you think it has. A partial report is more useful than none.

### What to expect

Brainstorm is a small team. We do not operate a paid bug bounty and cannot promise a fixed response
window. We will acknowledge your report, tell you whether we consider it in scope, and let you know
when a fix ships. If you would like credit in the release notes, say so.

## Official deployments

Brainstorm runs across several hostnames. They share a small number of open-source codebases at
different release stages, which is why they resemble one another — **they are not clones of one
another operated by different parties.** Every host below is operated by the same team.

### Product UI — [`NosFabrica/Brainstorm-UI`](https://github.com/NosFabrica/Brainstorm-UI) (this repository)

| Host | Role |
|---|---|
| `brainstorm.world` | Production |
| `brainstorm.nosfabrica.com` | Production alias |
| `brainstorm-staging.nosfabrica.com` | Staging |

### R&D UI — [`nous-clawds4/tapestry`](https://github.com/nous-clawds4/tapestry)

| Host | Role |
|---|---|
| `tapestry.brainstorm.world` | Reference deployment |
| `staging.brainstorm.world` | Pre-production |
| `tags.brainstorm.world` | Feature sandbox |
| `communities.brainstorm.world` | Feature sandbox |
| `magic-carpet.brainstorm.world` | Feature sandbox |
| `curate.brainstorm.world` | Feature sandbox |

### Backend APIs — [`NosFabrica/brainstorm_server`](https://github.com/NosFabrica/brainstorm_server)

| Host | Role |
|---|---|
| `api.brainstorm.world` | Production API |
| `search.brainstorm.world` | Search API |
| `brainstormserver.nosfabrica.com` | Production API |
| `brainstormserver-staging.nosfabrica.com` | Staging API |

### nostr relays — [strfry](https://github.com/hoytech/strfry)

| Host | Role |
|---|---|
| `scores.brainstorm.world` | Public relay |
| `nip85.brainstorm.world` | NIP-85 Trusted Assertions |
| `dcosl.brainstorm.world` | Decentralized Curation of Simple Lists |
| `nip85.nosfabrica.com` | NIP-85 relay |
| `nip85-staging.nosfabrica.com` | NIP-85 relay (staging) |

**The `brainstorm.world` and `nosfabrica.com` domains are both ours**, so any host under either of
them is operated by us — the tables above are a current inventory, not an exhaustive claim. A site
that resembles Brainstorm on any *other* domain is not affiliated with us; if you find one, that
itself is worth reporting through the link above.

## Scope

In scope: the codebases listed above and the deployments they serve.

Out of scope: third-party nostr relays we do not operate, third-party clients that connect to our
relays, and vulnerabilities in upstream dependencies (report those upstream, though we appreciate a
heads-up).

## A note on the trust model

Brainstorm is built around a personalized Web of Trust. Publishing is permissionless by design:
anyone may publish follows, mutes, reports, tags, and list elements, and the system does not gate
publication. Trust filtering happens at read time, from a specific point of view.

This means **"an untrusted party published a misleading assertion" is expected behavior, not a
vulnerability.** Reports in that shape will be closed as working-as-intended. What *is* in scope is
anything that breaks the per-POV filtering itself — for example, a way to make an assertion count for
a point of view that never trusted its author, to forge or alter another user's signed events, or to
read data a point of view should not be able to see.
