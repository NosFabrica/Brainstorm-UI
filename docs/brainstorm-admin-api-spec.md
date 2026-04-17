# Brainstorm Admin API — Endpoint Specification

> **Version:** 1.0  
> **Date:** April 2026  
> **Base URL:** `https://brainstormserver-staging.nosfabrica.com`  
> **Audience:** Backend developers implementing the Brainstorm DB server admin API  
> **Frontend status:** Pre-wired and ready to consume — endpoints will auto-activate in the admin dashboard when available

---

## Summary

| # | Endpoint | Method | Purpose | Admin Tab(s) |
|---|----------|--------|---------|--------------|
| 1 | `/admin/stats` | GET | Platform-wide aggregate totals | KPI strip, Overview |
| 2 | `/admin/users` | GET | Paginated list of all platform users | Users |
| 3 | `/admin/users/{pubkey}/history` | GET | Per-user calculation & error history | Users (expanded detail) |
| 4 | `/admin/analytics` | GET | Login events, activity feed, error log | Activity |
| 5 | `/admin/health` | GET | Server health & infrastructure metrics | System Health |

---

## Authentication

All `/admin/*` endpoints use the same auth mechanism as existing endpoints (`/user/self`, `/user/graperankResult`):

- **Header:** `access_token: <session_token>`
- Token is obtained via the existing `/authChallenge/{pubkey}` → `/authChallenge/{pubkey}/verify` flow
- 401 responses trigger automatic silent re-authentication on the frontend

**Required:** Admin endpoints must enforce server-side authorization. The server should maintain an admin allowlist of hex pubkeys and return `403 Forbidden` for any authenticated user not on that list. The frontend already gates access via `isAdminPubkey()` in `client/src/config/adminAccess.ts`, but client-side checks alone are insufficient — server-side enforcement is mandatory.

---

## Endpoint 1: `GET /admin/stats`

### Purpose
Returns platform-wide aggregate counts. Powers the 5 KPI cards at the top of every admin tab and enriches the Overview tab with system-level totals.

### What it replaces
Currently, the KPI strip shows data derived only from the logged-in admin's personal graph (~179 users). When this endpoint is available, the cards automatically switch to system-wide numbers with an indigo "System" scope badge.

### Request
```
GET /admin/stats
Headers: access_token: <token>
```

No query parameters required.

### Response
```json
{
  "total_users": 12847,
  "scored_users": 9432,
  "sp_adopters": 3891,
  "total_reports": 567,
  "queue_depth": 23
}
```

| Field | Type | Description |
|-------|------|-------------|
| `total_users` | integer | Total registered users on the Brainstorm platform |
| `scored_users` | integer | Users who have had GrapeRank calculated at least once (`times_calculated_graperank > 0`) |
| `sp_adopters` | integer | Users who have published a Trust Attestation (NIP-85) designating Brainstorm as their service provider (have a `ta_pubkey`) |
| `total_reports` | integer | Total mute + report actions filed across the platform |
| `queue_depth` | integer | Number of users currently waiting in the GrapeRank calculation queue |

### Frontend integration
- **Already wired:** `apiClient.getAdminStats()` in `client/src/services/api.ts` (lines 234-258)
- Accepts both `snake_case` and `camelCase` field names (see normalizer at lines 248-254)
- Returns `null` gracefully if the endpoint is unavailable (404, timeout, or error)
- Called via React Query with key `["/api/admin/stats"]` and 120s stale time
- When response is non-null, KPI cards auto-switch labels (e.g. "Graph Size" → "Total Users") and show "System" badges

---

## Endpoint 2: `GET /admin/users`

### Purpose
Returns a paginated list of all users on the Brainstorm platform with their GrapeRank scores, TA status, calculation history, and error state. Powers the "Users" tab table.

### What it replaces
Currently, the Users tab only shows users from the admin's personal `/user/self` graph. This endpoint would show every user on the platform, with server-side data that the frontend can't access from individual user queries.

### Request
```
GET /admin/users?page=0&limit=25&search=npub1abc...&sort=last_calculated&order=desc
Headers: access_token: <token>
```

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `page` | integer | No | 0 | Zero-based page index |
| `limit` | integer | No | 25 | Results per page (25, 50, or 100) |
| `search` | string | No | — | Filter by pubkey, npub, or display name (partial match) |
| `sort` | string | No | `influence` | Sort field: `pubkey`, `influence`, `followers`, `following`, `times_calculated`, `last_calculated` |
| `order` | string | No | `desc` | Sort direction: `asc` or `desc` |

### Response
```json
{
  "data": [
    {
      "pubkey": "a1b2c3d4e5f6...",
      "ta_pubkey": "f6e5d4c3b2a1...",
      "influence": 0.847,
      "follower_count": 342,
      "following_count": 128,
      "muted_by_count": 2,
      "reported_by_count": 0,
      "first_seen": "2026-01-15T08:00:00Z",
      "times_calculated": 14,
      "ta_publish_count": 3,
      "last_calculated": "2026-04-07T18:32:00Z",
      "last_triggered": "2026-04-07T18:30:00Z",
      "calc_status": "success",
      "ta_status": "success",
      "last_error": null,
      "calc_runtime_ms": 4200
    }
  ],
  "total": 12847,
  "page": 0,
  "limit": 25
}
```

| Field | Type | Description |
|-------|------|-------------|
| `pubkey` | string | Hex public key |
| `ta_pubkey` | string \| null | Trust Attestation publisher key (NIP-85), null if not published |
| `influence` | number | GrapeRank influence score (0.0–1.0) |
| `follower_count` | integer | Total followers of this user |
| `following_count` | integer | Total accounts this user follows |
| `muted_by_count` | integer | Number of users who have muted this user |
| `reported_by_count` | integer | Number of reports filed against this user |
| `first_seen` | string \| null | ISO 8601 timestamp of when this user was first seen on the platform |
| `times_calculated` | integer | Number of times GrapeRank has been calculated for this user |
| `ta_publish_count` | integer | Number of times this user has published a Trust Attestation (NIP-85) |
| `last_calculated` | string \| null | ISO 8601 timestamp of last completed GrapeRank calculation |
| `last_triggered` | string \| null | ISO 8601 timestamp of last GrapeRank trigger |
| `calc_status` | string \| null | Latest calculation status: `"success"`, `"failure"`, `"in_progress"`, or null |
| `ta_status` | string \| null | TA publication status: `"success"`, `"failure"`, or null |
| `last_error` | string \| null | Most recent error message, or null if no errors |
| `calc_runtime_ms` | integer \| null | Duration of last calculation in milliseconds |
| `total` | integer | Total matching users (for pagination) |
| `page` | integer | Current page index |
| `limit` | integer | Results per page |

### Frontend field mapping

| API Response Field | Admin UI Column/Label | Notes |
|---|---|---|
| `ta_publish_count` | "TA Count" (table column) | Number of TA publications, not GrapeRank calc count |
| `calc_status` | "Calc Status" (table column) | Shows as badge: success/failure/in_progress |
| `calc_runtime_ms` | "Runtime" (table column) | Displayed formatted (e.g. "4.2s") |
| `last_error` | "Last Error" (table column) | Shown in red ErrorBadge if non-null |
| `ta_pubkey` | "TA Last Pub" (table column) | Combined with `last_calculated` for display |
| `first_seen` | "First Seen Date" (expanded detail) | Listed in "Awaiting Backend API" section |
| `influence` | "Influence" (table + detail) | Tiered as High (≥0.5), Medium (≥0.1), Low (<0.1) |

### Frontend integration
- **Partially wired:** The Users tab currently builds its user list from `/user/self` graph data via the `allUsers` memo (lines 402-442 in `AdminPage.tsx`)
- 4 table columns currently show "Awaiting API" badges (amber background group): TA Count, Calc Status, Runtime, Last Error — these map to `ta_publish_count`, `calc_status`, `calc_runtime_ms`, and `last_error` respectively
- The `BrainstormUserData` interface (lines 132-145) already defines the shape for per-user enrichment data
- When this endpoint is available, it should replace the current client-side enrichment loop that calls `/user/{pubkey}` individually for each visible user

---

## Endpoint 3: `GET /admin/users/{pubkey}/history`

### Purpose
Returns the full calculation timeline, error history, and TA publication log for a specific user. Powers the expanded detail row when an admin clicks a user in the Users tab.

### What it replaces
Currently, the expanded detail row shows limited data from the per-user `/user/{pubkey}` call (influence score, TA pubkey, follower/following preview). This endpoint would provide the full history.

### Request
```
GET /admin/users/a1b2c3d4e5f6.../history
Headers: access_token: <token>
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `pubkey` | string (path) | Yes | Hex public key of the user |

### Response
```json
{
  "pubkey": "a1b2c3d4e5f6...",
  "first_seen": "2026-01-15T08:00:00Z",
  "ta_pubkey": "f6e5d4c3b2a1...",
  "ta_last_published": "2026-04-06T12:00:00Z",
  "ta_publish_count": 3,
  "influence": 0.847,
  "influence_tier": "high",
  "calc_status": "success",
  "calculations": [
    {
      "timestamp": "2026-04-07T18:32:00Z",
      "status": "success",
      "runtime_ms": 4200,
      "triggered_at": "2026-04-07T18:30:00Z",
      "error": null
    },
    {
      "timestamp": "2026-04-05T14:12:00Z",
      "status": "failure",
      "runtime_ms": 12000,
      "triggered_at": "2026-04-05T14:10:00Z",
      "error": "Timeout: graph traversal exceeded 10s limit"
    }
  ],
  "follower_pubkeys": ["abc123...", "def456...", "ghi789..."],
  "following_pubkeys": ["jkl012...", "mno345..."],
  "follower_count_history": [
    { "date": "2026-04-01", "count": 320 },
    { "date": "2026-04-07", "count": 342 }
  ],
  "following_count_history": [
    { "date": "2026-04-01", "count": 125 },
    { "date": "2026-04-07", "count": 128 }
  ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `pubkey` | string | Hex public key |
| `first_seen` | string \| null | ISO 8601 timestamp of when this user was first seen on the platform |
| `ta_pubkey` | string \| null | Trust Attestation publisher key |
| `ta_last_published` | string \| null | ISO 8601 timestamp of last TA publication |
| `ta_publish_count` | integer | Number of times TA has been published |
| `influence` | number | GrapeRank influence score (0.0–1.0) |
| `influence_tier` | string | `"high"` (≥0.5), `"medium"` (≥0.1), or `"low"` (<0.1) |
| `calc_status` | string \| null | Current calculation status: `"success"`, `"failure"`, `"in_progress"`, or null |
| `calculations` | array | Ordered list of past calculations (newest first) — serves as error history timeline |
| `calculations[].timestamp` | string | When the calculation completed |
| `calculations[].status` | string | `"success"` or `"failure"` |
| `calculations[].runtime_ms` | integer | Duration in milliseconds |
| `calculations[].triggered_at` | string | When the calculation was triggered |
| `calculations[].error` | string \| null | Error message if failed |
| `follower_pubkeys` | array | List of hex pubkeys who follow this user |
| `following_pubkeys` | array | List of hex pubkeys this user follows |
| `follower_count_history` | array | Historical follower counts over time (for follower/following history) |
| `following_count_history` | array | Historical following counts over time |

### Frontend field mapping

The expanded detail row (lines 1298-1326 in `AdminPage.tsx`) explicitly lists these as "Awaiting Backend API":

| API Response Field | Detail Row Label | Notes |
|---|---|---|
| `first_seen` | "First Seen Date" | When user first appeared on Brainstorm |
| `ta_publish_count` | "TA Publish Count" | How many TAs this user has published |
| `calc_status` | "Calculation Status (live)" | Current live status |
| `calculations[].runtime_ms` | "Runtime Duration" | From most recent calculation entry |
| `calculations[]` (filtered by error) | "Error History Timeline" | All calculations with non-null `error` field |
| `follower_count_history` + `following_count_history` | "Follower/Following History" | Trend data over time |

### Frontend integration
- **Partially wired:** The expanded detail row (toggled via `expandedRows` Set) currently shows a top-5 following preview with copy buttons, influence tier label, and TA pubkey
- The `brainstormData` Map (line 446) stores per-user enrichment data fetched one-by-one; this endpoint would replace those individual calls for the detail view
- The `calculations` array doubles as the error history timeline — filter for entries where `error` is non-null

---

## Endpoint 4: `GET /admin/analytics`

### Purpose
Returns platform-wide activity feed including login events, GrapeRank calculation events, and error logs. Powers the "Activity" tab.

### What it replaces
Currently, the Activity tab only shows events from the current admin session (hardcoded from query states). This endpoint would show activity across all users and sessions.

### Request
```
GET /admin/analytics?type=all&limit=50&since=2026-04-01T00:00:00Z
Headers: access_token: <token>
```

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `type` | string | No | `all` | Filter by event type: `all`, `login`, `calculation`, `error`, `trigger` |
| `limit` | integer | No | 50 | Maximum number of events to return |
| `since` | string | No | — | ISO 8601 timestamp; only return events after this time |
| `before` | string | No | — | ISO 8601 timestamp; only return events before this time |

### Response
```json
{
  "events": [
    {
      "id": "evt_001",
      "type": "login",
      "pubkey": "a1b2c3d4e5f6...",
      "timestamp": "2026-04-08T14:30:00Z",
      "detail": "Admin login via NIP-07",
      "metadata": {
        "ip_country": "US",
        "user_agent": "Mozilla/5.0..."
      }
    },
    {
      "id": "evt_002",
      "type": "calculation",
      "pubkey": "d4e5f6a1b2c3...",
      "timestamp": "2026-04-08T14:28:00Z",
      "detail": "GrapeRank calculation completed",
      "metadata": {
        "status": "success",
        "runtime_ms": 3200,
        "queue_position": 0
      }
    },
    {
      "id": "evt_003",
      "type": "error",
      "pubkey": "b2c3d4e5f6a1...",
      "timestamp": "2026-04-08T14:25:00Z",
      "detail": "Pipeline failure — graph traversal timeout",
      "metadata": {
        "source": "GrapeRank Pipeline",
        "calc_status": "failure",
        "ta_status": "success"
      }
    }
  ],
  "total": 1247,
  "has_more": true
}
```

| Field | Type | Description |
|-------|------|-------------|
| `events` | array | List of activity events, newest first |
| `events[].id` | string | Unique event identifier |
| `events[].type` | string | Event type: `login`, `calculation`, `error`, `trigger` |
| `events[].pubkey` | string | Hex pubkey of the user involved |
| `events[].timestamp` | string | ISO 8601 timestamp |
| `events[].detail` | string | Human-readable event description |
| `events[].metadata` | object | Type-specific metadata (varies by event type) |
| `total` | integer | Total events matching the filter |
| `has_more` | boolean | Whether more events exist beyond the current page |

### Frontend integration
- **Not yet wired:** The Activity tab currently hardcodes session events from React Query states (lines 1625-1631 in `AdminPage.tsx`)
- The "Session Activity" card, "Error Log" table, and "Login Timeline" section would all consume this endpoint
- Error events (type `error`) would populate the Error Log table which currently only catches local query failures
- Login events (type `login`) would populate the Login Timeline which currently only shows the current session

---

## Endpoint 5: `GET /admin/health`

### Purpose
Returns server-side health metrics for the Brainstorm infrastructure. Powers the "System Health" tab's infrastructure status cards.

### What it replaces
Currently, the System Health tab shows hardcoded "Operational" status for infrastructure components (Event Store, GrapeRank Engine, NIP-85 Publisher). This endpoint would provide real health data.

### Request
```
GET /admin/health
Headers: access_token: <token>
```

No query parameters required.

### Response
```json
{
  "server": {
    "status": "operational",
    "uptime_seconds": 864000,
    "version": "1.4.2"
  },
  "graperank_engine": {
    "status": "operational",
    "active_calculations": 3,
    "queue_depth": 23,
    "avg_calc_time_ms": 4500
  },
  "event_store": {
    "status": "operational",
    "total_events": 2847561,
    "memory_usage_mb": 512
  },
  "nip85_publisher": {
    "status": "operational",
    "last_publish": "2026-04-08T14:30:00Z",
    "total_published": 3891
  },
  "relay_connection": {
    "url": "wss://dcosl.brainstorm.world",
    "status": "connected",
    "last_ping_ms": 45
  },
  "endpoints": [
    {
      "path": "/authChallenge/*",
      "status": "ok",
      "avg_response_ms": 120
    },
    {
      "path": "/user/self",
      "status": "ok",
      "avg_response_ms": 850
    },
    {
      "path": "/user/graperank",
      "status": "ok",
      "avg_response_ms": 200
    },
    {
      "path": "/user/graperankResult",
      "status": "ok",
      "avg_response_ms": 450
    }
  ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `server.status` | string | `"operational"`, `"degraded"`, or `"down"` |
| `server.uptime_seconds` | integer | Server uptime in seconds |
| `server.version` | string | Server version string |
| `graperank_engine.status` | string | Engine status |
| `graperank_engine.active_calculations` | integer | Currently running calculations |
| `graperank_engine.queue_depth` | integer | Pending calculations |
| `graperank_engine.avg_calc_time_ms` | integer | Average calculation duration |
| `event_store.status` | string | Store status |
| `event_store.total_events` | integer | Total indexed events |
| `event_store.memory_usage_mb` | integer | Memory consumption |
| `nip85_publisher.status` | string | Publisher status |
| `nip85_publisher.last_publish` | string | Last TA publication timestamp |
| `nip85_publisher.total_published` | integer | Total TAs published |
| `relay_connection.status` | string | Server-side relay connection status |
| `relay_connection.last_ping_ms` | integer | Server-side relay latency |
| `endpoints[]` | array | Per-endpoint health and response times |

### Frontend integration
- **Not yet wired:** The System Health tab currently shows hardcoded infrastructure status (lines 1497-1508 in `AdminPage.tsx`)
- The "API Health" card (lines 1460-1488) hardcodes endpoint statuses based on local query results — this endpoint would provide real server-side response times and statuses
- The "Infrastructure" card could replace hardcoded "Operational" labels with real component statuses
- Relay connectivity is already checked client-side via WebSocket probes; server-side relay status from this endpoint would complement that

---

## Implementation Priority

| Priority | Endpoint | Reason |
|----------|----------|--------|
| 1 (High) | `GET /admin/stats` | Frontend already calls it on every page load; instant value when available |
| 2 (High) | `GET /admin/users` | Unlocks the full user database view — the main admin workflow |
| 3 (Medium) | `GET /admin/users/{pubkey}/history` | Enriches user detail rows; depends on #2 being useful first |
| 4 (Medium) | `GET /admin/analytics` | Fills in the Activity tab which currently only shows local session data |
| 5 (Low) | `GET /admin/health` | Nice to have — client-side probes already cover basic health checks |

---

## Error Response Format

All endpoints should return errors in this format (consistent with existing Brainstorm API):

```json
{
  "detail": "Human-readable error message",
  "status": 403
}
```

| Status Code | Meaning |
|-------------|---------|
| 401 | Session expired or invalid token (triggers auto-reauth on frontend) |
| 403 | Authenticated but not authorized for admin access |
| 404 | Endpoint not implemented yet (frontend handles gracefully) |
| 429 | Rate limited |
| 500 | Server error |
