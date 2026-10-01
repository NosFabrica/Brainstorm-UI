/**
 * The opened messages of one account, grouped into rooms. Plain data with a
 * version counter, so React reads it through `useSyncExternalStore` and every
 * screen sees the same conversation.
 */
import { CHAT_KIND, FILE_KIND, REACTION_KIND, expirationOf, type Rumor } from "./giftWrap";
import { participantsOf, reactionTargetOf, replyTargetOf, roomKey, subjectOf } from "./rooms";

/** One relay's answer to one wrap of an outgoing message. */
export interface Delivery {
  recipient: string;
  relay: string;
  ok?: boolean;
  message?: string;
  /** Refused until the sender signs in to the relay (NIP-42). */
  auth?: boolean;
}

/** `queued`: not delivered, and the device is offline — it goes out on its own when back. */
export type OutgoingStatus = "sending" | "sent" | "partial" | "failed" | "queued";

export interface DmMessage {
  id: string;
  rumor: Rumor;
  room: string;
  author: string;
  createdAt: number;
  kind: number;
  /** The wrap this copy arrived in, and its back-dated time. */
  wrapId: string;
  wrapAt: number;
  /** Relays it was seen on. */
  relays: string[];
  expiresAt?: number;
  replyTo?: string;
  reactionTo?: string;
  subject?: string;
  /** Present on messages sent from this device, while we know how they went. */
  outgoing?: { status: OutgoingStatus; deliveries: Delivery[]; error?: string };
}

export interface DmRoom {
  key: string;
  participants: string[];
  /** Chat and file messages, oldest first. */
  messages: DmMessage[];
  /** Reactions by the message they are about. */
  reactions: Map<string, DmMessage[]>;
  last?: DmMessage;
  lastAt: number;
  subject?: string;
  /** The account has written here — it is a conversation, not a request. */
  hasMine: boolean;
}

export function messageFromRumor(
  rumor: Rumor,
  wrap: { id: string; created_at: number; tags?: string[][] },
  relays: string[],
): DmMessage | null {
  if (rumor.kind !== CHAT_KIND && rumor.kind !== FILE_KIND && rumor.kind !== REACTION_KIND) return null;
  const expiresAt = expirationOf(rumor) ?? (wrap.tags ? expirationOf({ tags: wrap.tags }) : undefined);
  return {
    id: rumor.id,
    rumor,
    room: roomKey(participantsOf(rumor)),
    author: rumor.pubkey,
    createdAt: rumor.created_at,
    kind: rumor.kind,
    wrapId: wrap.id,
    wrapAt: wrap.created_at,
    relays: [...relays],
    expiresAt,
    replyTo: replyTargetOf(rumor),
    reactionTo: reactionTargetOf(rumor),
    subject: subjectOf(rumor),
  };
}

const NOTIFY_MS = 80;

const byTime = (a: DmMessage, b: DmMessage) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1);

export class DmStore {
  private readonly byId = new Map<string, DmMessage>();
  /** room key → ids of its messages and reactions. */
  private readonly byRoom = new Map<string, Set<string>>();
  private readonly listeners = new Set<() => void>();
  /**
   * Rooms are rebuilt only when one of their messages changed: an unchanged
   * room keeps its identity, so lists and open chats downstream can skip it.
   */
  private readonly built = new Map<string, DmRoom>();
  private readonly dirtyRooms = new Set<string>();
  private list: DmRoom[] = [];
  private builtVersion = -1;
  private holding = 0;
  private dirty = false;
  version = 0;

  constructor(readonly owner: string) {}

  get size(): number {
    return this.byId.size;
  }

  message(id: string): DmMessage | undefined {
    return this.byId.get(id);
  }

  private put(message: DmMessage) {
    this.byId.set(message.id, message);
    let ids = this.byRoom.get(message.room);
    if (!ids) this.byRoom.set(message.room, (ids = new Set()));
    ids.add(message.id);
    this.dirtyRooms.add(message.room);
  }

  /** Add or merge one message. Returns true when it is new. */
  add(message: DmMessage, now = Date.now() / 1000): boolean {
    if (message.expiresAt && message.expiresAt <= now) return false;
    const held = this.byId.get(message.id);
    if (held) {
      const relays = [...new Set([...held.relays, ...message.relays])];
      const outgoing = message.outgoing ?? held.outgoing;
      const adopt = !held.wrapId && !!message.wrapId;
      if (relays.length === held.relays.length && outgoing === held.outgoing && !adopt) return false;
      const merged = { ...held, relays, outgoing };
      if (adopt) Object.assign(merged, { wrapId: message.wrapId, wrapAt: message.wrapAt });
      this.put(merged);
      this.bump();
      return false;
    }
    this.put(message);
    this.bump();
    return true;
  }

  /** Update what we know about a message this device sent. */
  patch(id: string, patch: Partial<DmMessage>): void {
    const held = this.byId.get(id);
    if (!held) return;
    this.put({ ...held, ...patch });
    this.bump();
  }

  remove(ids: string[]): void {
    let changed = false;
    for (const id of ids) {
      const held = this.byId.get(id);
      if (!held) continue;
      this.byId.delete(id);
      this.byRoom.get(held.room)?.delete(id);
      this.dirtyRooms.add(held.room);
      changed = true;
    }
    if (changed) this.bump();
  }

  /** Forget messages whose NIP-40 expiration has passed. Returns what went. */
  sweepExpired(now = Date.now() / 1000): DmMessage[] {
    const gone = [...this.byId.values()].filter((m) => m.expiresAt && m.expiresAt <= now);
    if (gone.length) this.remove(gone.map((m) => m.id));
    return gone;
  }

  private buildRoom(key: string): DmRoom | null {
    const ids = this.byRoom.get(key);
    if (!ids?.size) return null;
    const room: DmRoom = {
      key,
      participants: key.split(","),
      messages: [],
      reactions: new Map(),
      lastAt: 0,
      hasMine: false,
    };
    const sorted = [...ids].map((id) => this.byId.get(id)!).sort(byTime);
    for (const m of sorted) {
      if (m.author === this.owner) room.hasMine = true;
      if (m.kind === REACTION_KIND) {
        if (!m.reactionTo) continue;
        const list = room.reactions.get(m.reactionTo) ?? [];
        list.push(m);
        room.reactions.set(m.reactionTo, list);
        continue;
      }
      room.messages.push(m);
      room.last = m;
      room.lastAt = m.createdAt;
      if (m.subject) room.subject = m.subject;
    }
    // A room made only of reactions (its messages expired, or not loaded yet) has nothing to show.
    return room.messages.length ? room : null;
  }

  private build() {
    if (this.builtVersion === this.version) return;
    if (this.dirtyRooms.size) {
      for (const key of this.dirtyRooms) {
        const room = this.buildRoom(key);
        if (room) this.built.set(key, room);
        else this.built.delete(key);
        if (!this.byRoom.get(key)?.size) this.byRoom.delete(key);
      }
      this.dirtyRooms.clear();
      this.list = [...this.built.values()].sort((a, b) => b.lastAt - a.lastAt);
    }
    this.builtVersion = this.version;
  }

  /** Every room with something to show, newest first. */
  rooms(): DmRoom[] {
    this.build();
    return this.list;
  }

  room(key: string): DmRoom | undefined {
    this.build();
    return this.built.get(key);
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Many changes, one notification — for hydrating hundreds of messages at once. */
  batch(work: () => void): void {
    this.holding++;
    try {
      work();
    } finally {
      this.holding--;
      if (!this.holding && this.dirty) {
        this.dirty = false;
        this.notify();
      }
    }
  }

  private bump() {
    this.version++;
    if (this.holding) this.dirty = true;
    else this.notify();
  }

  /**
   * Listeners hear about a burst at most every `NOTIFY_MS`: a page of history
   * opens hundreds of messages one by one, and re-rendering the inbox for each
   * of them starves the very decrypts that are filling it.
   */
  private notifyTimer: ReturnType<typeof setTimeout> | null = null;
  private lastNotify = 0;

  private notify() {
    if (this.notifyTimer) return;
    const wait = this.lastNotify + NOTIFY_MS - Date.now();
    if (wait <= 0) {
      this.flushNotify();
      return;
    }
    this.notifyTimer = setTimeout(() => this.flushNotify(), wait);
  }

  private flushNotify() {
    this.notifyTimer = null;
    this.lastNotify = Date.now();
    for (const l of [...this.listeners]) l();
  }
}
