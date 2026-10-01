# Private messages: a live tail, per-relay history, and trust-sorted requests

Brainstorm gained NIP-17 private messages: chat (kind 14), files (kind 15) and
reactions (kind 7), each sealed (kind 13) and gift-wrapped (kind 1059) per
recipient, delivered only to the relays a person names in their kind-10050
list. This records the decisions that are not in the NIPs.

## Loading: two subscriptions, as Amethyst does

A gift wrap names only its recipient, so every chat's history is one stream:
kind 1059 to the reader, on the reader's own inbox relays. It is loaded in two
disjoint halves (`services/dm/engine.ts`), following Amethyst's DM pager
(`amethyst/plans/archive/2026-06-01-dm-live-tail-and-history-slices.md`):

- **Live** — one REQ per inbox relay, `since: floor − 2 days`, no `until`,
  opened when the account signs in so the badge and the newest chats are ready
  before Messages is. It never widens.
- **History** — everything below the floor, paged backward per relay by
  `until`+`limit` (`lib/dm/pager.ts`, a port of Amethyst's
  `RelayLoadingCursors` and `BackwardRelayPager`). Only a relay something asked
  for carries a REQ; a relay that finishes its page parks. An empty page is that
  relay's bottom; fifteen seconds of silence is a stall, retried by hand.

The **floor** is the last time this device had every inbox relay caught up
(`lastSeen`), never more than a week back. Amethyst always uses a week because
its database dedupes; we catch up from the last visit because the browser cache
does the same job (below). Saved history cursors are only resumed when no band
fell between the last visit and the floor — otherwise paging would skip it.

**The two-day buffer.** NIP-59 back-dates seals and wraps by up to two days.
A relay that has delivered wraps back to D is only guaranteed complete for
messages written after D + 2 days. That is where its marker sits
(`RelayCursors.completeTo`), and why the live REQ starts two days below the floor.

## What asks for the next page

Visibility, not scroll position. Each relay has a marker at its complete-to
date, in the conversation list and inside a chat (`RelayMarker`). In the list, a
marker on screen keeps its relay paging. In a chat, markers in view load **one**
page from every relay; if that page brought nothing for this chat — likely, since
pages are account-wide — the chat offers **Keep looking**, which pages every
relay until a message appears or all are done (`useChatHistory`).

## Opening messages

Two NIP-44 decrypts per wrap, by the account's signer. A local key that can
unlock silently opens everything as it arrives. An extension or a remote signer
opens nothing until the reader opens Messages, so signing in never sets off a
burst of approval prompts; until then the badge shows a dot. A signer that
refuses holds the queue — it is never recorded as "unreadable".

Opened messages are kept in IndexedDB (`lib/dm/cache.ts`), each sealed with the
device's non-extractable AES-GCM key bound to the account (the Unlock cache's
envelope), and dropped on sign-out with the event cache. Without the vault only
wrap ids and paging state are kept.

## Requests are sorted by trust

Relays cannot filter spam they cannot see the sender of. We sort after opening
(`lib/dm/inbox.ts`): people the reader follows, or has written to, are chats;
others are requests ordered by Verification Score; low scorers are collapsed
with previews hidden; senders flagged by the reader's web of trust are never
shown; muted senders are dropped. Who reaches Chats directly is a setting.

## Sending

One wrap per recipient to at most three of their inbox relays, plus one to the
sender's own, so their other devices see it. A recipient with no kind-10050 is
not sent to — NIP-17 says not to guess. Seals carry no tags, so `signAs` leaves
the client tag off kind 13; remote signers are asked for kinds 13 and 10050 at
pairing.
