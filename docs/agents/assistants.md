# Assistants and the Treasure Map

For any change that signs a kind 10040, touches the setup or Activate flow, the
Treasure Map editor, or how an Assistant is named to people. The terms —
Deployment, this deployment's Assistant, Duty, Duty category — are defined in
[CONTEXT.md](../../CONTEXT.md) § Assistants and the Treasure Map.

## The four events

| Event                            | Kind                 | Signed by                         | Code                                                                                                                                           |
| -------------------------------- | -------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| The User's Treasure Map          | 10040                | the User                          | `lib/nip85Declaration`, `lib/treasureMapCards`; written by `services/nostr` `signNip85` and the editor's `services/treasureMap`                |
| The Assistant's own Treasure Map | 10040                | the Assistant, through the server | `lib/assistantTreasureMap`, `hooks/useAssistantTreasureMap`; server ask: [TREASURE-MAP-ASK.md](../assistant/TREASURE-MAP-ASK.md)               |
| The Assistant's Duty Menu        | 39999, `d=duty-menu` | the Assistant, through the server | `lib/dutyMenu`, `hooks/useAssistantDutyMenu`; server ask: [DUTY-MENU-ASK.md](../assistant/DUTY-MENU-ASK.md)                                    |
| The Assistant's profile          | 0                    | the Assistant, through the server | `services/api/admin.ts` `publishDefaultAssistantProfile` (a default; editing waits on [PROFILE-EDIT-ASK.md](../assistant/PROFILE-EDIT-ASK.md)) |

Only the server holds an Assistant's key, so the UI asks the server for the
three Assistant-signed events and signs the User's Treasure Map itself, through
`signAs()`.

## This deployment's Assistant

One per Deployment, per User — a different key on staging and on production.
`ta_pubkey` from `/user/history` is its only source (the kind-30078 pointer is
retired). Read it with `useHasMywot()`, which waits for a real Session: a 401 on
`/user/history` wipes storage and redirects to `/`, so an identity without a
Session must never ask. Never hardcode it.

Another Deployment's Assistant for the same User is just another key, treated
exactly like an external service's.

## Writing the User's Treasure Map: fill empty, never take

Each Duty row names one Assistant, so giving a Duty to this deployment's
Assistant takes it from whoever had it — another Deployment included. `signNip85`
writes through `planDesignation` (`lib/nip85Declaration`): it fills Duties nobody
holds or this Assistant already holds, and replaces another Assistant's row only
in the Duty categories the caller passes as `take`. The editor is the one other
writer: it saves the User's own draft, so every change there is their choice.

| Path                                                           | `take`                                                                              |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Activate page and the dashboard's Activate modal ("Switch")    | `["scores"]`                                                                        |
| Lists update pill, Settings › Republish, the automatic publish | none                                                                                |
| Treasure Map editor (its own save, no `take`)                  | whatever category the User changes, shown before Save as "Moves from X (site) to Y" |

A new path passes `take` explicitly and joins this table. Lists another
Assistant holds read as `elsewhere` in `services/trustLists`, never `missing`,
so nothing offers to move them.

## Naming an Assistant to people

- **Who holds a Duty**: `useRankProvider` names the rank holder — profile name,
  short npub until it loads.
- **Which site it belongs to**: `useVerifiedHost` returns its NIP-05's host once
  that NIP-05 verifies for its key. A profile's `website` is only a claim; show
  the verified host or nothing.
- **"Ours" is a key comparison.** Production's Assistant verifies on
  `brainstorm.nosfabrica.com` while production is served at `brainstorm.world`,
  so comparing a host to the app's origin misreads it.
- Name the holder — "This replaces Pip's Brainstorm Assistant
  (brainstorm.nosfabrica.com)" — wherever a write moves a Duty.

## Specs

- Kind 10040 and kind 30382: NosFabrica/protocols
  [trusted-assertions.md](https://github.com/NosFabrica/protocols/blob/main/specs/trusted-assertions.md).
- Treasure Maps, Duty Menus and Assistant designation are Tapestry drafts:
  [treasure-maps.md](https://github.com/nous-clawds4/tapestry/blob/main/protocols/drafts/treasure-maps.md),
  [duty-menus.md](https://github.com/nous-clawds4/tapestry/blob/main/protocols/drafts/duty-menus.md),
  [assistant-designation.md](https://github.com/nous-clawds4/tapestry/blob/main/protocols/drafts/assistant-designation.md).
  Read them on GitHub: a local Tapestry checkout can lag the drafts.
- Agent keys for external agents: unbuilt; [AGENT-KEYS-ASK.md](../assistant/AGENT-KEYS-ASK.md)
  is what the UI needs from the server.
