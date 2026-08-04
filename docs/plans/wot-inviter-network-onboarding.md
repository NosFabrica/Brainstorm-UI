# Onboard new users into the inviter's Web of Trust

**Status:** proposed — awaiting review (do not build yet)
**Branch:** `njump-profile-share`
**Author context:** grilling session, 2026-07-01

---

## Problem

When a logged-out visitor views a public profile (`/p/{npub}`) and clicks
**"See in your Web of Trust,"** they're routed to
`/login?invite={npub}&next=/profile/{npub}?pov=mywot`. If they create an
account from there, the viewed profile (the "inviter") is already preselected
as a follow in the onboarding picker.

**What's missing:** we do nothing with that inviter's *network*. A new user who
arrived through a specific person very likely knows other people in that
person's circle — but today we show them 8 hardcoded celebrities (jack, Lyn
Alden, Derek Ross, …) that have nothing to do with why they signed up. We're
sitting on a high-signal WoT graph and ignoring it.

**Goal:** turn the invite path into a guided entry into the inviter's web of
trust — surface the people the inviter follows, ranked by trust, so the new user
lands on a network they can actually recognize and build from.

---

## What already exists (no rebuild needed)

| Capability | Location |
| --- | --- |
| Inviter pubkey survives redirect (`?invite=` + sessionStorage fallback) | `SharePage.tsx:652`, `LoginPage.tsx:31` |
| Inviter auto-threaded into signup | `CreateAccountModal.tsx` (`inviterPubkey` prop) → `createAccount(name, {inviterPubkey})` |
| Inviter preselected in onboarding picker | `FollowPicker.tsx:44` (`readInviterHex`), `:62` (preselect) |
| Fetch a pubkey's contact list (kind 3) | `socialActions.ts:98` `fetchContactList(pubkey)` |
| Parse followed pubkeys | `socialActions.ts:106` `getFollowedPubkeys(list)` |
| Batch profile fetch | `nostr.ts` `fetchProfileMap(pubkeys)` |
| Per-author trust score (house POV) | `api.ts` `getHouseInfluence(pubkey)` |
| Trust tier ramp + avatar ring | `tierForScore` (TrustScoreBadge), ShareNoteCard ring pattern |
| Multi-follow publish + score trigger | `socialActions.ts:214` `followPubkeys`, `nostr.ts:1449` `triggerScoringAndAnchor` |
| Static fallback list | `lib/suggestedAccounts.ts` `SUGGESTED_ACCOUNTS` (8 accounts) |

The only new thing is: **fetch the inviter's follows, rank them by trust, and
render them in the picker.**

---

## Locked design decisions (from grilling)

1. **Source = the inviter's follow list** (who *they* follow — kind-3 contact
   list). Not their followers (expensive, low-signal, relay-unreliable). These
   are the inviter's outbound trust edges.

2. **Ranking = WoT house-POV trust, bounded.** Batch-fetch profiles, drop
   accounts with no name/avatar, score up to ~40 candidates via
   `getHouseInfluence`, drop below the spam threshold, **show the top ~12**
   ranked by trust. House POV is the only option for a brand-new user (no
   personal graph yet) — noted honestly in code; swappable for observer-POV when
   a batch/observer endpoint lands.

3. **Placement = replace the celebrities on the invite path.** When an inviter
   is present, "People @X follows" replaces the 8 static accounts. Organic
   signups (no inviter) keep the celebrity list unchanged.

4. **Defaults = opt-in (WoT integrity).** Pre-check **only** the inviter +
   NosFabrica. The ~12 network rows are unchecked, with a nudge. Every published
   follow stays an authentic human choice — we don't manufacture trust edges.

5. **Framing:**
   - Section header **"People @{name} follows"** + subhead
     *"Start here — accounts in @{name}'s network you may already know."*
   - Relabel the inviter row from **"Who invited you"** → **"You came from
     here"** on the WoT-button path (the label was misleading — nobody invited
     them). Keep "invited you" only for genuine invite links.
   - Per-row **trust ring / tier badge** (reuse `tierForScore` + ShareNoteCard
     avatar-ring) so onboarding visibly *is* the WoT product.

6. **Loading = progressive / non-blocking.** Picker mounts instantly with
   inviter + NosFabrica usable; the network section skeleton-loads and fades in
   ranked. Prefetch the contact list at signup (we already hold the pubkey in
   `CreateAccountModal`) so react-query has it warm.

7. **Scope = any inviter-present signup** — both the "See in your WoT" button
   and genuine share-invite links (same `inviterPubkey`). Organic signups
   unaffected.

8. **Backfill guard:** if the inviter's network returns thin (< 5 usable
   accounts after filtering), backfill from the celebrity list so the picker is
   never sparse.

---

## Implementation

### New file — `client/src/lib/networkSuggestions.ts`

The swappable facade (relays + single-score calls now; batch/observer endpoint
later, no UI change).

```ts
export type RankedFollow = {
  pubkey: string;
  score: number;        // house-POV influence 0..1
  name: string;         // resolved display name (for the row + fallbackName)
};

/**
 * Fetch the accounts an inviter follows, filter to real profiles, score by
 * house-POV WoT influence, and return the top N above the spam threshold.
 * House POV is used because a brand-new user has no personal graph yet; this
 * facade can later point at an observer-POV batch endpoint with no UI change.
 */
export async function fetchInviterNetwork(
  inviterHex: string,
  opts?: { scoreCap?: number; take?: number; threshold?: number },
): Promise<RankedFollow[]>;
```

Steps inside:
1. `fetchContactList(inviterHex)` → `getFollowedPubkeys()` → candidate pubkeys
   (excluding the inviter, NosFabrica seed, and the new user).
2. `fetchProfileMap(candidates)` → drop anyone with no `name`/`display_name`
   *and* no `picture` (ghost/spam filter).
3. Cap to `scoreCap ≈ 40` survivors, `Promise.all(getHouseInfluence)`.
4. Filter `score > 0 && score >= threshold` (reuse `PRESET_THRESHOLDS` default).
5. Sort by score desc; return top `take ≈ 12` as `RankedFollow[]`.

Wrapped in react-query where consumed so it caches per inviter and can be
prefetched.

### `client/src/components/FollowPicker.tsx`

- Read `inviterHex` (already done via `readInviterHex`).
- `useQuery(["inviter-network", inviterHex], () => fetchInviterNetwork(inviterHex), { enabled: !!inviterHex })`.
- Build the curated list:
  - `NosFabrica` — preselect (unchanged).
  - inviter — preselect, **relabel** to "You came from here" on this path.
  - **network rows** (from the query) — **not** preselected; render with the
    trust ring + tier badge; skeleton rows while `isLoading`.
  - if `!inviterHex` **or** network resolves to `< 5` usable → append
    `SUGGESTED_ACCOUNTS` (celebrity backfill).
- Section header + subhead copy per decision 5. Nudge line under the network
  section.
- Keep the existing "Follow & calculate my scores" button behavior
  (`followPubkeys(selected)` → `triggerScoringAndAnchor`) — no change to the
  publish/score path; we only change *what's offered* and *what's pre-checked*.

### `client/src/components/CreateAccountModal.tsx`

- On mount / when `inviterPubkey` is present, `queryClient.prefetchQuery` the
  inviter network so it's warm by the time the picker renders. Fire-and-forget;
  never blocks signup.

### Reused as-is (no change)

`socialActions.fetchContactList` / `getFollowedPubkeys` / `followPubkeys`,
`nostr.fetchProfileMap` / `triggerScoringAndAnchor`, `api.getHouseInfluence`,
`tierForScore`, `PRESET_THRESHOLDS`, `SUGGESTED_ACCOUNTS`.

---

## Edge cases & guards

- **Inviter follows nobody / contact list unreachable** → network empty →
  celebrity backfill (decision 8). No error state shown.
- **All follows filtered out** (no profiles / all below threshold) → same
  backfill.
- **Inviter is NosFabrica** → dedupe (already handled by the `seen` set in
  `FollowPicker`).
- **Score calls slow/failing** → progressive load means the picker is already
  usable; failed scores just drop that row (treated as below threshold).
- **New user's own pubkey** appears in the inviter's follows → excluded.
- **Scoring cost** bounded to ~40 `getHouseInfluence` calls max, only on the
  invite path, only once (react-query cached).

## Honest limitations (stated in code comments)

- Ranking is **house-POV**, not the new user's own WoT (they have none yet). The
  facade is built to swap to observer-POV when a backend batch endpoint exists.
- "People @X follows" ≠ "people who will trust you back" — it's a discovery aid,
  not a guarantee of mutual connection.

---

## Verification plan

- `npx tsc --noEmit` + `npx vite build` green.
- Preview: simulate the invite path with a real, well-connected inviter pubkey
  (one that follows recognizable accounts) so the network section actually
  populates. Confirm:
  - inviter + NosFabrica pre-checked; network rows unchecked.
  - "People @X follows" renders top ~12 with trust rings, ranked by score.
  - thin/empty inviter → celebrity backfill appears.
  - organic signup (no inviter) → unchanged celebrity list.
  - progressive load: picker is interactive before the network resolves.
- Confirm no change to the publish/score path (kind-3 + GrapeRank trigger fire
  exactly as before).

## Out of scope (fast-follows)

- Observer-POV ranking (needs backend batch/observer endpoint).
- Second-degree expansion (follows-of-follows).
- The inviter's *followers* (vs follows) as a source.
- Any change to organic-signup onboarding.
