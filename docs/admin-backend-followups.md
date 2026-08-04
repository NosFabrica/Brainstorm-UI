# Admin — backend follow-ups (UI is ready/blocked on these)

Findings from the admin-area audit. Everything below is **blocked on backend work** — the UI either can't do it at all today, or only does a weaker version. UI-only items that were already shipped are **not** listed here.

## 1. Per-user "pause / exclude from scheduling" — NEW endpoint
**Why:** Admins expect an X on an assigned user to *remove them from scheduled sync*. Today the only capability is `PUT /admin/users/{pubkey}/scheduling` which **reassigns** them to a tier — a user is *always* on some tier (the default if unassigned). There is no way to stop a single user from being auto-recalculated.
**UI today:** the X is now a **confirmed "Move to default tier"** action (honest about what it does).
**Needed:** an endpoint to pause/exclude a single user (e.g. `POST /admin/users/{pubkey}/scheduling/pause` + `…/resume`, or a nullable tier). Once it exists we can add a real "Pause" toggle with a confirmation.

## 2. Assistants tab — 3 endpoints not exposed
The Assistants tab is fully built but **feature-flagged off** (`VITE_FEATURE_ASSISTANTS_ADMIN`) and shows "Not Connected" because the backend hasn't exposed:
- `GET /admin/assistants/stats` → `{ totalAssistants, totalPublishes, publishes24h, publishes7d, lastPublishAt }`
- `GET /admin/assistants` (paginated) → `{ items:[{owner_pubkey, assistant_pubkey, event_id, publish_count, first_published_at, last_published_at}], total, page, pages, size }`
- `GET /admin/assistants/{ownerPubkey}/history` (paginated) → `{ items:[{event_id, published_at, status}], total, page, pages }`
**Needed:** expose these, then flip the flag on. The client methods already exist (`getAdminAssistantStats`, `getAdminAssistants`, `getAdminAssistantHistory`).

## 3. Real health probe — `GET /admin/health`
**Why:** the System Health tab currently *infers* health from whether `/admin/users` etc. respond (there are TODOs in the code saying "replace with a meaningful health probe"). That's a guess, not a status.
**Needed:** a dedicated probe returning component-level health (DB, scheduler, relays, queue) so the tab shows real status instead of query-state inference.

## 4. Admin settings / config panel — read+write endpoints
**Why:** every global knob is env-controlled or baked at deploy time, with no UI:
- Scheduler global **on/off** (the panel note says "env-controlled")
- **Tier thresholds** (verified_threshold, tier_high/medium_high/medium)
- Feature flags
**Needed:** endpoints to read (and ideally write) these so we can build a "System Settings" panel. Read-only first is fine.

## 5. Authoritative per-user next-run
**Why:** the assigned-user list now shows **"Next ~ …"**, but it's an *estimate* computed client-side as `last_published + tier interval`. The scheduler actually decides based on queue/priority.
**Needed:** include a real `next_scheduled_at` (per user, or per tier) in `GET /admin/scheduling/{id}/users` or `/admin/scheduling/stats` so we can show the true next run and drop the "~".

## 6. Failure observability — nice-to-haves
The new **Failure Breakdown** panel groups failures by the error text we already get. To go further:
- Structured **error categories/codes** on activity items (relay-timeout vs TA vs publish) instead of free-text messages → cleaner grouping + per-category metrics.
- **Relay-error correlation:** tie calc failures to the relay that caused them.
- **Per-tier SLA thresholds + slip trend history** (we only get a current-snapshot `tier_slip_seconds`).

## 7b. Overview trend history — needs a time-series/date-range endpoint
**Why:** the Overview tab's trend windows (1h/24h/7d/30d) are computed from the latest activity records fetched client-side (`GET /admin/activity`, now `size=500` with a fallback). On a busy instance 7d/30d still under-sample, so a true **"All time"** or **custom date range** can't be honest from the client. The UI now shows a "last N records since <date>" caption + "range exceeds loaded data" note as a stopgap.
**Needed:** either a **date-range parameter** on `/admin/activity` (from/to) or a **pre-aggregated time-series** endpoint (buckets per day) so the Overview can offer real long-range and custom windows.

## 7. Orphaned client methods — decide
`getBrainstormRequest(requestId)` and `createBrainstormRequest()` exist in `api.ts` but nothing calls them. Either surface a "manually create a calc request" admin tool, or remove them.

---

### Already shipped UI-only (for reference, not blocked)
Scheduling tab redesign; rich user assignment (search Brainstorm/Nostr + paste + tray); searchable/sortable assigned list with last-published + estimated next-run; confirmed move-to-default; responsive Users table (sticky columns + top scrollbar + mobile cards); **Failure Breakdown** with retry-all-in-group; per-user calc **Duration** column; ADMIN badge → quick link to /admin.

### Still UI-only doable (not blocked, just not built yet)
User-list **CSV export**; **color/threshold cues** on the scheduler queue-depth & slip bars.
