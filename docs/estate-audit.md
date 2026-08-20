# Brainstorm domain estate — trust-signal audit

**Surveyed:** 2026-08-11 / 2026-08-12 · **18 live hostnames · 4 fleets · 3 codebases · 2 GitHub orgs**

Every status below reflects a response observed directly, not inferred.

---

## The diagnosis

Reputation scanners began flagging much of the estate as unsafe. The working theory was that the
deployments look like copies of each other. That is true, but it isn't what a scanner keys on.

Every host answered `200 OK` with the same contentless single-page-app shell for **every** path
requested — including paths that should never exist.

What an automated scanner saw:

- `/robots.txt` returned HTML, not a robots file — on all 18 hosts
- `/.well-known/security.txt` returned HTML — no host published a security contact
- `/.env`, `/wp-login.php`, and arbitrary nonsense all returned `200`
- Ten hostnames resolved to a single IP (`74.208.86.220`), several serving byte-identical markup
- The served HTML was ~400 bytes of boilerplate, so crawlers saw no distinguishing text anywhere

Taken together that is close to the textbook fingerprint of a bulk-generated phishing estate. The
backends were the exception — they already returned honest 404s, which is why they are the only part
of the estate that was already clean.

One correction worth recording: the blocklist involved is minor, and being on it is probably not
costing real traffic today. The signals it reacted to are the same ones consumed by the reputation
systems that *do* matter, which is the reason to fix them.

---

## The estate

### Product UI — `NosFabrica/Brainstorm-UI` (nginx)

| Host | IP | Role | Status |
|---|---|---|---|
| `brainstorm.world` | 74.208.86.220 | Production | PR #43 open |
| `brainstorm.nosfabrica.com` | 74.208.86.220 | Production alias | PR #43 open |
| `brainstorm-staging.nosfabrica.com` | 74.208.86.220 | Staging | PR #43 open |

### R&D UI — `nous-clawds4/tapestry` (Express)

| Host | IP | Role | Status |
|---|---|---|---|
| `tapestry.brainstorm.world` | 159.203.150.156 | Reference deploy | ✅ Live |
| `staging.brainstorm.world` | 137.184.219.255 | Pre-production | ✅ Live |
| `tags.brainstorm.world` | 24.199.72.90 | Sandbox | ✅ Live |
| `communities.brainstorm.world` | 174.138.108.124 | Sandbox | ✅ Live |
| `magic-carpet.brainstorm.world` | 68.183.114.219 | Sandbox | ✅ Live |
| `curate.brainstorm.world` | 159.203.159.219 | Sandbox | ✅ Live |

### nostr relays — strfry

| Host | IP | Role | Status |
|---|---|---|---|
| `scores.brainstorm.world` | 74.208.86.220 | Public relay | Patch ready (k8s) |
| `nip85.nosfabrica.com` | 74.208.86.220 | NIP-85 | Patch ready (k8s) |
| `nip85-staging.nosfabrica.com` | 74.208.86.220 | NIP-85 staging | Patch ready (k8s) |
| `nip85.brainstorm.world` | 129.212.133.141 | Trusted Assertions | ⚠️ Standalone — manual |
| `dcosl.brainstorm.world` | 129.212.135.199 | Decentralized lists | ⚠️ Standalone — manual |

### Backend APIs — `NosFabrica/brainstorm_server`

| Host | IP | Role | Status |
|---|---|---|---|
| `api.brainstorm.world` | 74.208.86.220 | Production API | ✅ 404s correctly |
| `search.brainstorm.world` | 74.208.86.220 | Search API | ✅ 404s correctly |
| `brainstormserver.nosfabrica.com` | 74.208.86.220 | Production API | ✅ 404s correctly |
| `brainstormserver-staging.nosfabrica.com` | 74.208.86.220 | Staging API | ✅ 404s correctly |

**Dead DNS.** Five hostnames referenced in source have no A record: `lists.`, `npub.`,
`wot.brainstorm.world`, `nip85-staging.brainstorm.world`, `relay-staging.brainstorm.world`. Harmless
on its own, but evidence the inventory drifts unnoticed — which matters now that the inventory is
published as an ownership attestation.

---

## What changed

The same three things everywhere: publish a security contact, tell crawlers the truth, and stop
answering `200` to paths that don't exist. The implementation differs because the serving layer does.

| Codebase | Approach | State |
|---|---|---|
| `nous-clawds4/tapestry` | Express — pure module renders both documents; shape-based rule ahead of the SPA catch-all | ✅ Live on all six hosts |
| `NosFabrica/Brainstorm-UI` | nginx — exact-match locations, deny rule, per-deployment values at container start | PR #43 |
| `NosFabrica/brainstorm-k8s` | Ingress — relays have no app layer, so both documents are served at the edge | Patch, no PR (see below) |

---

## Two defects the acceptance criteria would have missed

Both were found by probing past what was specified, and neither violated a written criterion.

**The config that never arrived.** The indexing flag was read correctly by the application and set
correctly in the deployment — but was absent from the container's environment list, so it never
crossed the boundary between them. Production would have silently kept telling search engines not to
crawl it, with no symptom reproducible locally.

**The rule that was one escape away.** Express does not percent-decode request paths. Every literal
probe path returned 404 as designed, while `/%2Eenv` sailed through and returned `200` — defeating
the whole feature for any scanner that encodes its probes.

A third issue was caught before it could bite: the rule blocking unknown `/.well-known/` paths also
matched `/.well-known/acme-challenge/`, used to issue and renew TLS certificates. Challenges resolve
above the application layer today, so nothing was broken — but had that changed, certificate
**renewal** would have failed silently for weeks and then expired TLS on every host at once. It is
now explicitly exempt in both codebases. `virtualserver.yaml` already carried a comment warning about
exactly this, which is where it was spotted.

---

## What NosFabrica needs to do

`brainstorm-k8s` is private with forking disabled and read-only access, so its change could not be
submitted as a pull request. It is supplied as a two-commit patch. These steps are ordered because
the later ones depend on the earlier.

1. **Enable private vulnerability reporting** on `Brainstorm-UI` and `brainstorm_server`
   (Settings → Code security). Both are currently off, which means the security contact published by
   these changes points at a channel that does not accept reports.

2. **Apply the k8s patch and merge PR #43 together.** The PR reads two values — `ALLOW_INDEXING` and
   `CANONICAL_HOSTS` — that only the chart supplies. Merging the PR alone leaves both unset: safe,
   but production will not be indexable.

   ```bash
   git am < brainstorm-k8s-site-trust.patch
   ```

3. **Fix the two standalone relays by hand.** `nip85.brainstorm.world` and `dcosl.brainstorm.world`
   run on their own droplets and are not in the chart, so nothing above reaches them. Each needs both
   documents served from its host nginx, ahead of the strfry pass-through.

4. **Verify per host.**

   ```bash
   curl -sI https://HOST/.well-known/security.txt | grep -i content-type   # text/plain
   curl -s -o /dev/null -w '%{http_code}\n' https://HOST/.env              # 404
   ```

---

## Decisions left open

**The relay operator pubkey.** Three relays advertise no operator identity in their NIP-11 document.
For a nostr relay that is a stronger ownership signal than a security contact. The two standalone
relays already publish `e5272de914bd301755c439b88e6959a43c9d2664831f093c51e9c799a16a102f`. It was
deliberately left blank in the chart rather than copied across — it is an identity assertion, and a
wrong value is worse than an absent one.

**An unrecognized deployment.** The chart's arrowhead values file points at
`brainstorm-staging.relay.tools` — a third domain outside both `brainstorm.world` and
`nosfabrica.com`. It is not named in the ownership attestation these changes publish. If it is an
official deployment, the attestation should list it.

---

## Renewal obligation

The published documents carry `Expires: 2027-08-11`. RFC 9116 treats an expired `security.txt` as
**invalid** — a scanner that fetches a stale one gets a negative signal from a file published to earn
a positive one. All three copies (tapestry, Brainstorm-UI, the k8s chart helper) need refreshing
before that date, along with a re-check that the hostname inventory above is still accurate.

In `nous-clawds4/tapestry` the alarm is already wired: test `U1` asserts `Expires` is in the future,
so its suite goes red on the day and stays red until someone acts. The other two copies have no such
alarm.
