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

In the list the markers are invisible (2026-10-05): each still pages its relay
as it scrolls into view, but the list says the history once, under the rows —
"N servers aren't responding · Retry", else "Loading older messages…", else
nothing. A reader shouldn't need to know what a relay is to read their messages.
Only a relay waiting on a sign-in shows its own marker, because that needs them.
The inbox reads as empty ("No chats yet.") once any relay has answered: the live
subscription settling, or any relay delivering a page — one silent relay can
hold "settled" off indefinitely. Inside a chat the per-relay markers stay.

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

The send answers once every recipient has a relay that took their wrap; slower
relays keep going in the background and fill in the delivery details, so a
dead inbox relay doesn't hold the composer for its timeout.

Many inbox relays (auth.nostr1.com among the suggested ones) hand over an
inbox, or take a wrap, only from a signed-in reader (NIP-42). services/relayAuth
signs in, without asking, to any relay that refuses a read or a write — the
reader's own inbox relays and a recipient's alike. A refused publish
(`auth-required`) waits briefly for that login and is retried once, then held;
the message goes out by itself when that relay signs the reader in. The
trade-off is NIP-42's: signing in to a recipient's inbox relay tells it who is
sending to its users. The signer keeps the last word — it may prompt, and the
reader may say no there — and no login ever raises the Unlock modal for a login
nobody asked for: a locked key signs in once the reader is in Messages.

A login that doesn't happen is recorded per account and relay, saying why: the
reader's signer saying no shows "Rejected - Ask again", which asks for a fresh
approval; the relay answering the login with a refusal shows its reason and
"Try again"; a login that simply didn't go through (no signer, no answer in
time) shows "Try again" and is also tried again when the reader next opens
Messages. While a record stands the relay is not asked again — not on its next
refused read, and not after a reconnect.

## Everything else stays on the device

NIP-17 carries messages, not settings, so the reader's own choices about their
chats — pinned, muted, archived, read up to, link previews, notifications — are
kept per account on this device (lib/dm/prefs), not published. Syncing them
across devices would mean encrypted app data (NIP-78) — not done yet.

- **Search** runs over the messages this device has opened (lib/dm/search).
  Relays hold only ciphertext, so there is nothing to search remotely; the
  results say how many messages were searched. The same box also asks the
  search relay for people (kind 0, the SearchBox's people search through the
  reader's Perspective) and lists those not yet in a chat, one tap from a new
  one; the New message "To" field uses the same search. Network results show
  their trust coin and a NIP-05 only once it verifies.
- **Notifications** are the browser's, while a tab is open: a chime and a
  Notification for new messages in Chats and Requests, never for muted chats,
  low-trust or flagged senders, or the chat on screen. Requests never show their
  text. Push for a closed tab needs a server that knows when a message arrives
  — the Brainstorm inbox relay, when there is one.
- **The outbox** keeps undelivered messages sealed (the same device key as the
  message cache) with their signed wraps, so a retry after a reload needs no
  signer. Offline, a message is `queued` and goes out when the connection
  returns; automatic retries stop after about ten minutes.
- **Link previews** never let the linked site see the reader: metadata from our
  own `/link-preview` (which doesn't log URLs), the picture only through our
  image proxy, no favicon, nothing for Requests. Off in Settings.
- **Voice notes** are ordinary kind-15 files (audio), encrypted before upload.
- **Renaming a chat** is NIP-17's (and Amethyst's): a message with a new
  `subject` tag, sent to every member; the newest subject is the name. Its
  text says "Renamed the chat to …" for clients that don't show subjects, and
  the thread marks each change.

## Hardening (audit)

- Seals we send carry no tags; seals we receive may. Amethyst puts its
  `["client", …]` tag on the seal, and rejecting that dropped every message
  from it. A seal's tags are ignored. Wraps judged unreadable under older,
  stricter rules are opened again (`FAILED_RULES` in `lib/dm/cache`).
- A wrap's payloads are checked for NIP-44 shape before any signer sees them,
  and a wrap the signer turns down twice — while it opens others — is set
  aside as unreadable: one stranger's malformed message can't pause the inbox.
- A message that doesn't name the reader is dropped; requests are judged by
  who wrote, not by who was tagged.
- `lastSeen` never passes a wrap that arrived but isn't opened yet, nor a time
  when a relay's socket was down; history pages with an inclusive `until`, and
  starts below where a capped live REQ stopped.
- Paging waits for opening: a relay's next page is fetched only once fewer
  than 50 of the wraps it delivered are still sealed, and its marker reads
  "opening N messages…" until they are — a marker on screen used to fetch
  page after page (no rows arrived to push it away) and say "all history
  loaded" with thousands still unread.
- Nothing is forgotten for the signer's sake: only a payload that can never
  open is cached as unreadable. A wrap the signer keeps declining is set aside
  for the visit (retryable in Settings › Private messages › Sync), a timeout
  resumes by itself with backoff, and "failed" rows from before failures had
  a reason are opened once more. A stalled history page is asked again by
  itself, smaller each time; history waits for each relay's live answer so it
  starts below a capped live window; saved cursors from older versions are
  dropped once and history fetched again (opened wraps aren't reopened).
- The store rebuilds only the rooms that changed (~30× less work per incoming
  message at 10k messages), so open chats and lists skip unchanged rooms.
- Attachments in requests never load on their own (the host is the sender's);
  elsewhere only small, declared-size ones near the screen do, read with a cap.

## Tested against production relays

Two throwaway accounts, the production build, real relays: setup, request,
accept, reply arriving live, reactions, reload from the device cache, and
interop with nostr-tools' NIP-17/NIP-59 in both directions. A read-only soak
paged a real inbox of ~1,600 wraps in five pages, and matched an independent
12-hour-window scan wrap for wrap.
