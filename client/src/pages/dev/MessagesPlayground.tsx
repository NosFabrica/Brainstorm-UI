/**
 * /dev/messages — dev only (the route exists only under `import.meta.env.DEV`,
 * like /dev/renderers). The real ChatView over sample chats nobody would have
 * on hand: npubs and `nostr:` links that never break, a long link, a long
 * word, a reply and reactions, both sides. Built to check the thread at phone
 * width — that nothing pushes it sideways — in light and dark, without
 * publishing a message under anyone's key. Nothing here sends: there is no
 * engine.
 */
import { useMemo } from "react";
import { ChatView } from "@/components/messages/ChatView";
import { CHAT_KIND, REACTION_KIND } from "@/lib/dm/giftWrap";
import { readDmPrefs } from "@/lib/dm/prefs";
import { roomKey as keyOf } from "@/lib/dm/rooms";
import type { DmMessage, DmRoom } from "@/lib/dm/store";
import type { DmEngineState } from "@/services/dm/engine";

const ME = "d".repeat(63) + "1";
const ANA = "a".repeat(63) + "2";
const ROOM = keyOf([ME, ANA]);
const NPUB = "npub1sg6plzptd64u62a878hep2kev88swjh3tw00gjsfl8f237lmu63q0uf63m";
const T = Math.floor(Date.now() / 1000) - 3600;

const msg = (id: string, author: string, content: string, at: number, extra: Partial<DmMessage> = {}): DmMessage =>
  ({
    id,
    author,
    room: ROOM,
    kind: CHAT_KIND,
    createdAt: at,
    wrapId: `w${id}`,
    wrapAt: at,
    relays: [],
    rumor: { id, pubkey: author, created_at: at, kind: CHAT_KIND, content, tags: [] },
    ...extra,
  }) as DmMessage;

const MESSAGES: DmMessage[] = [
  msg("m1", ANA, "hey! here's my profile, follow me there", T),
  msg("m2", ANA, `nostr:${NPUB}`, T + 10),
  msg("m3", ME, `got it — is this you too? ${NPUB}`, T + 60),
  msg(
    "m4",
    ANA,
    "and the doc: https://example.com/a/very/long/path/that/keeps/going/and/going/without/any/break/at/all?with=query&and=more",
    T + 120,
  ),
  msg(
    "m5",
    ME,
    "Supercalifragilisticexpialidocious-and-then-some-more-letters-with-no-spaces-at-all-to-break-on",
    T + 180,
  ),
  msg("m6", ANA, "event id: 3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d", T + 240, {
    replyTo: "m5",
  }),
  msg("m7", ME, "Normal message so we can see an ordinary bubble beside the long ones. 👍", T + 300),
];
const REACTIONS = new Map<string, DmMessage[]>([
  [
    "m7",
    [
      msg("r1", ANA, "+", T + 320, { kind: REACTION_KIND, reactionTo: "m7" }),
      msg("r2", ANA, "🔥", T + 330, { kind: REACTION_KIND, reactionTo: "m7" }),
    ],
  ],
]);

const STATE: DmEngineState = {
  status: "ready",
  inboxRelays: ["wss://relay.example"],
  live: {},
  liveSynced: true,
  liveSettled: true,
  sendAuth: [],
  floor: 0,
  queued: 0,
  failed: 0,
  setAside: 0,
  downloading: false,
  sync: { received: {}, opened: 0 },
  history: { floor: 0, relays: [], loading: false, exhausted: true, complete: true },
};

export default function MessagesPlayground() {
  const room: DmRoom = useMemo(
    () => ({
      key: ROOM,
      participants: [ME, ANA],
      messages: MESSAGES,
      reactions: REACTIONS,
      last: MESSAGES[MESSAGES.length - 1],
      lastAt: MESSAGES[MESSAGES.length - 1].createdAt,
      hasMine: true,
    }),
    [],
  );
  const noop = () => {};
  return (
    <div
      className="flex h-[calc(100dvh-var(--bs-bottom-chrome,0px))] flex-col bg-background text-foreground"
      data-testid="dev-messages"
    >
      <ChatView
        engine={null}
        state={STATE}
        roomKey={ROOM}
        room={room}
        me={ME}
        profiles={new Map([[ANA, { name: "Ana" }]])}
        scoreOf={() => 0.6}
        prefs={readDmPrefs(ME)}
        shelf="chat"
        onBack={noop}
        onAccept={noop}
        onDelete={noop}
        onBlock={noop}
        onDetails={noop}
        onToggleInfo={noop}
        onArchive={noop}
        sendError={noop}
      />
    </div>
  );
}
