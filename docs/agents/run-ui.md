# Run the UI locally against staging

For checking a change in a real browser — the "manual check" a ticket asks for —
without deploying. Values are staging's, from brainstorm-k8s
`charts/brainstorm/staging-values.yaml`.

## Start

```sh
VITE_API_URL=https://brainstormserver-staging.nosfabrica.com \
VITE_NIP85_RELAY_URL=wss://nip85-staging.nosfabrica.com \
VITE_SEARCH_RELAY_URL=wss://search.brainstorm.world/ \
npm run dev
```

Open `http://localhost:5000` (`vite.config.ts` pins the port). Ready when the page
renders the search home; the staging API answers CORS for any origin.

- **API**: only `VITE_API_URL` decides it (`services/api/core.ts`).
- **Search relay** is shared with production: a load test against it hits prod.
- **Link previews** proxy to `OG_UPSTREAM` (default `127.0.0.1:8080`); without
  that service they answer 503 and cards fall back to plain links.

## Signing in

Use a throwaway key on a staging account with follows and calculated scores —
never your real nsec. What the browser saves (accounts, the device profile cache,
IndexedDB) lives on `localhost:5000`, separate from staging.

## Checking a change

- **Network tab, filter `WS`**: relay sockets and their frames — the place to count
  REQs before and after a change.
- **A store-backed read updating live**: change the thing from a second device or
  account, return within the ask window, and watch it re-render without a reload.
