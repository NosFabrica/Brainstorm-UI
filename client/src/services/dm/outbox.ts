/**
 * Sending: a message or a reaction sealed and wrapped once per recipient,
 * published to each one's inbox relays, and kept in the outbox — across reloads
 * — until everyone has it. Part of the DM engine (services/dm/engine), which
 * composes it.
 */
import type { NostrEvent } from "nostr-tools";
import { CHAT_KIND, REACTION_KIND, makeRumor, wrapRumor, type Rumor } from "@/lib/dm/giftWrap";
import { messageFromRumor, type Delivery, type DmMessage, type OutgoingStatus } from "@/lib/dm/store";
import { chatTags } from "@/lib/dm/rooms";
import { MAX_INBOX_RELAYS, type DmRelayLookup } from "@/lib/dm/inboxRelays";
import type { CustomEmoji } from "@/lib/customEmoji";
import type { Sealer } from "@/lib/dm/cache";
import type { DmCore } from "./core";
import type { DmAccount, DmEngineState, DmTransport, PublishResult, SendResult } from "./engine";

/** One recipient's wrap of a message, and the relays it goes to. */
export interface OutgoingWrap {
  recipient: string;
  wrap: NostrEvent;
  relays: string[];
}

/** A message waiting in the outbox: its signed wraps, so a retry needs no signer. */
interface OutboxEntry {
  rumor: Rumor;
  wrapId: string;
  wrapAt: number;
  wraps: OutgoingWrap[];
  deliveries: Delivery[];
}

export interface OutboxDeps {
  transport: Pick<DmTransport, "publish" | "onAuthenticated">;
  loadInbox(pubkey: string): Promise<DmRelayLookup>;
  sealer?: Sealer;
}

/** What sending needs from the rest of the engine. */
export interface OutboxHost {
  status(): DmEngineState["status"];
  /** The engine's start, while it is still starting. */
  whenStarted(): Promise<void> | undefined;
  /** The reader's own inbox relays. */
  inbox(): string[];
  /** Opening waits while a message is sealed (WrapOpener.beginSeal / endSeal). */
  beginSeal(): void;
  endSeal(): void;
  keepOpened(message: DmMessage): Promise<void>;
  keepFailed(wrapId: string, at: number, reason: "skipped"): void;
  /** The outbox changed: save it soon. */
  scheduleState(): void;
}

export class Outbox {
  private readonly me: string;
  private readonly outgoing = new Map<string, OutgoingWrap[]>();
  /** Relay → stop watching for its login; sends refused there resend on login. */
  private readonly sendAuthWaits = new Map<string, () => void>();
  /** Messages not yet delivered to everyone; kept across reloads and retried. */
  private readonly outbox = new Set<string>();
  /**
   * Message → its publish, until every relay has answered. Only one at a time per
   * message: two would publish the same wraps and overwrite each other's results.
   */
  private readonly publishing = new Map<string, Promise<void>>();
  /** The newest `created_at` this engine gave a rumor (see `stamp`). */
  private lastStamp = 0;
  /** Automatic tries per message since the connection last came back. */
  private readonly attempts = new Map<string, number>();

  constructor(
    private readonly core: DmCore,
    private readonly account: Pick<DmAccount, "sealSigner" | "classify">,
    private readonly deps: OutboxDeps,
    private readonly host: OutboxHost,
  ) {
    this.me = core.me;
  }

  private get stopped(): boolean {
    return this.core.stopped;
  }

  private get store() {
    return this.core.store;
  }

  private get online(): boolean {
    return this.core.online();
  }

  private now(): number {
    return this.core.now();
  }

  /** Relays that refused a message until the reader signs in to them. */
  sendAuth(): string[] {
    return [...this.sendAuthWaits.keys()];
  }

  /** The connection came back: every message gets its automatic tries again. */
  resetAttempts() {
    this.attempts.clear();
  }

  /** The outbox, sealed like opened messages. Nothing kept where the device can't seal. */
  async seal(): Promise<string | undefined> {
    const sealer = this.deps.sealer;
    if (!this.outbox.size || !sealer?.supported()) return undefined;
    const entries: OutboxEntry[] = [];
    for (const id of this.outbox) {
      const message = this.store.message(id);
      const wraps = this.outgoing.get(id);
      if (!message || !wraps) continue;
      entries.push({
        rumor: message.rumor,
        wrapId: message.wrapId,
        wrapAt: message.wrapAt,
        wraps,
        deliveries: message.outgoing?.deliveries ?? [],
      });
    }
    return entries.length ? sealer.seal(JSON.stringify(entries), this.me) : undefined;
  }

  async restore(sealed: string) {
    const sealer = this.deps.sealer;
    if (!sealer?.supported()) return;
    let entries: OutboxEntry[];
    try {
      entries = JSON.parse(await sealer.open(sealed, this.me)) as OutboxEntry[];
    } catch {
      return;
    }
    const now = this.now();
    this.store.batch(() => {
      for (const e of entries) {
        const message = messageFromRumor(e.rumor, { id: e.wrapId, created_at: e.wrapAt }, []);
        if (!message) continue;
        message.outgoing = { status: this.online ? "failed" : "queued", deliveries: e.deliveries };
        this.store.add(message, now);
        this.core.seen.add(e.wrapId);
        this.core.wrapToMessage.set(e.wrapId, message.id);
        this.outgoing.set(message.id, e.wraps);
        this.outbox.add(message.id);
      }
    });
  }

  /** After a send settles: in the outbox until everyone has it. */
  private settleOutbox(messageId: string) {
    const out = this.store.message(messageId)?.outgoing;
    const before = this.outbox.has(messageId);
    // "Sent" is about the recipients; the copy for the reader's other devices is retried too.
    const mineMissing =
      !!out?.deliveries.some((d) => d.recipient === this.me) &&
      !out.deliveries.some((d) => d.recipient === this.me && d.ok);
    if (!out || (out.status === "sent" && !mineMissing)) {
      this.outbox.delete(messageId);
      this.attempts.delete(messageId);
      // Every relay took it: nothing will ever be resent.
      if (out?.deliveries.every((d) => d.ok)) this.outgoing.delete(messageId);
    } else this.outbox.add(messageId);
    if (before || this.outbox.has(messageId)) this.host.scheduleState();
  }

  /** Send again whatever the outbox holds — on start, every minute, and when the connection returns. */
  flushOutbox(): void {
    if (this.stopped || this.host.status() !== "ready" || !this.online) return;
    for (const id of this.outbox) {
      if (this.publishing.has(id) || this.store.message(id)?.outgoing?.status === "sending") continue;
      // A relay that keeps refusing isn't asked forever; Retry, or the connection coming back, starts over.
      const tries = this.attempts.get(id) ?? 0;
      if (tries >= MAX_AUTO_RETRIES) continue;
      this.attempts.set(id, tries + 1);
      void this.resend(id);
    }
  }

  /** Give up on an undelivered message: gone from here, and from the outbox. */
  discard(messageId: string): void {
    const message = this.store.message(messageId);
    const status = message?.outgoing?.status;
    if (!message || (status !== "failed" && status !== "queued")) return;
    // A retry is on its way out: it can't be called back now.
    if (this.publishing.has(messageId)) return;
    this.outbox.delete(messageId);
    this.attempts.delete(messageId);
    this.outgoing.delete(messageId);
    this.store.remove([messageId]);
    // The reader's own copy may already sit on their relays, and would come back
    // on the next load looking sent. A wrap can't be deleted (a throwaway key
    // signed it), so it is remembered as skipped, like a wrap that isn't a message.
    if (message.wrapId) this.host.keepFailed(message.wrapId, message.wrapAt, "skipped");
    this.host.scheduleState();
  }

  /**
   * Send a chat message to everyone in `room` (a room key: sorted participants,
   * the sender among them). One wrap per recipient, to their own inbox relays,
   * plus one to the sender's, so their other devices see it too.
   */
  async send(
    room: string,
    content: string,
    opts: { replyTo?: string; subject?: string; timer?: number; kind?: number; tags?: string[][] } = {},
  ): Promise<SendResult> {
    const text = content.trim();
    if (!text) return { ok: false, error: "Nothing to send" };
    const others = room.split(",").filter((pk) => pk && pk !== this.me);
    const now = this.stamp();
    const expiration = opts.timer ? now + opts.timer : undefined;
    const rumor = makeRumor({
      pubkey: this.me,
      kind: opts.kind ?? CHAT_KIND,
      created_at: now,
      tags: [...chatTags(others, { replyTo: opts.replyTo, subject: opts.subject, expiration }), ...(opts.tags ?? [])],
      content: text,
    });
    return this.deliver(rumor, others, expiration);
  }

  /**
   * A `created_at` for a rumor of ours: now, but always past the last one. Seconds
   * are coarse: two sends in one would sort by hash, so out of order half the time
   * (here and for them), and the same text twice would be one rumor id — one bubble,
   * whose second signing, turned down, would take the first one away with it.
   */
  private stamp(): number {
    this.lastStamp = Math.max(this.now(), this.lastStamp + 1);
    return this.lastStamp;
  }

  /** React to a message (NIP-25 inside a wrap). "+" is a like; a custom emoji carries its NIP-30 tag. */
  async react(target: DmMessage, content: string, emoji?: CustomEmoji): Promise<SendResult> {
    const others = target.room.split(",").filter((pk) => pk && pk !== this.me);
    // NIP-25 names the author; the other p tags keep the reaction in the same room.
    const named = [...new Set([target.author, ...others])].filter((pk) => pk !== this.me);
    const rumor = makeRumor({
      pubkey: this.me,
      kind: REACTION_KIND,
      created_at: this.stamp(),
      tags: [
        ["e", target.id],
        ...named.map((pk) => ["p", pk]),
        ["k", String(target.kind)],
        ...(emoji ? [["emoji", emoji.code, emoji.url]] : []),
      ],
      content: emoji ? `:${emoji.code}:` : content || "+",
    });
    return this.deliver(rumor, others, undefined);
  }

  private async deliver(rumor: Rumor, others: string[], expiration: number | undefined): Promise<SendResult> {
    // Sent while the cache or the inbox list is still loading: wait for them.
    if (this.host.status() === "starting") await this.host.whenStarted()?.catch(() => undefined);
    const signer = this.account.sealSigner;
    if (!signer) return { ok: false, error: "Your signer can't encrypt private messages (NIP-44)." };
    if (!this.host.inbox().length) return { ok: false, error: "Set up your inbox relays first." };

    const lookups = await Promise.all(
      others.map((pk) => this.deps.loadInbox(pk).catch(() => ({ relays: [], found: false }))),
    );
    const missing = others.filter((_, i) => !lookups[i].relays.length);
    if (missing.length && !this.online)
      return { ok: false, error: "You're offline, and this chat's inbox relays aren't known yet." };
    if (missing.length) return { ok: false, missing, error: "Some people have no inbox relays yet." };

    const placeholder = messageFromRumor(rumor, { id: "", created_at: this.now() }, [])!;
    placeholder.outgoing = { status: "sending", deliveries: [] };
    this.store.add(placeholder, this.now());

    const targets = [
      ...others.map((pk, i) => ({ pk, relays: lookups[i].relays })),
      { pk: this.me, relays: this.host.inbox() },
    ];
    const wraps: OutgoingWrap[] = [];
    // Opening pauses while this is sealed: a signer that limits its rate spends its
    // budget on the message being sent, not on the backlog.
    this.host.beginSeal();
    try {
      for (const target of targets) {
        const wrap = await wrapRumor(rumor, target.pk, signer, { expiration });
        wraps.push({ recipient: target.pk, wrap, relays: target.relays.slice(0, MAX_INBOX_RELAYS) });
      }
    } catch (error) {
      // Nothing was signed, so there is nothing to resend: a bubble kept here would
      // offer a Retry that can't do anything, beside the draft the composer keeps.
      // The draft is the retry — sent again, it asks the signer again.
      this.store.remove([rumor.id]);
      if (this.account.classify(error) === "cancelled") return { ok: false, error: "Cancelled" };
      return { ok: false, error: error instanceof Error ? error.message : "Signing failed" };
    } finally {
      this.host.endSeal();
    }

    const mine = wraps[wraps.length - 1].wrap;
    this.core.seen.add(mine.id);
    this.core.wrapToMessage.set(mine.id, rumor.id);
    this.store.patch(rumor.id, { wrapId: mine.id, wrapAt: mine.created_at });
    this.outgoing.set(rumor.id, wraps);
    const message = await this.publishWraps(rumor.id, wraps);
    const held = this.store.message(rumor.id);
    if (held) void this.host.keepOpened(held);
    return { ok: message?.outgoing?.status !== "failed", message };
  }

  /** Publish again to every relay that hasn't accepted yet. */
  async resend(messageId: string): Promise<SendResult> {
    const wraps = this.outgoing.get(messageId);
    if (!wraps) return { ok: false, error: "Nothing to resend" };
    if (this.publishing.has(messageId)) return { ok: false, error: "Already sending" };
    const message = await this.publishWraps(messageId, wraps, true);
    return { ok: message?.outgoing?.status !== "failed", message };
  }

  /**
   * Publish every wrap to its relays. Answers as soon as each recipient has a
   * relay that took theirs (or every relay has answered): a dead relay's
   * timeout shouldn't hold the composer. The rest land in the store as they come.
   */
  private async publishWraps(messageId: string, wraps: OutgoingWrap[], onlyFailed = false) {
    const out = this.store.message(messageId)?.outgoing;
    const previous = out?.deliveries ?? [];
    // A retry shows as sending from the start, not once the first relay answers: until
    // then its bubble would still read failed, offering a Discard that can't call it back.
    if (out && out.status !== "sending") this.store.patch(messageId, { outgoing: { ...out, status: "sending" } });
    const accepted = (recipient: string, relay: string) =>
      previous.some((d) => d.recipient === recipient && d.relay === relay && d.ok);
    const deliveries: Delivery[] = [];
    const recipients = wraps.filter((w) => w.recipient !== this.me || wraps.length === 1).map((w) => w.recipient);
    const allReached = () => recipients.every((r) => deliveries.some((d) => d.recipient === r && d.ok));
    const update = (final: boolean) => {
      const reached = recipients.filter((r) => deliveries.some((d) => d.recipient === r && d.ok));
      const status: OutgoingStatus =
        reached.length === recipients.length
          ? "sent"
          : !final
            ? "sending"
            : reached.length
              ? "partial"
              : this.online
                ? "failed"
                : "queued";
      const relays = deliveries.filter((d) => d.ok && d.recipient === this.me).map((d) => d.relay);
      this.store.patch(messageId, { outgoing: { status, deliveries: [...deliveries] }, relays });
    };

    let reachedAll!: () => void;
    const early = new Promise<void>((resolve) => (reachedAll = resolve));
    const settled = Promise.all(
      wraps.flatMap((w) =>
        w.relays.map(async (relay) => {
          if (onlyFailed && accepted(w.recipient, relay)) {
            deliveries.push({ recipient: w.recipient, relay, ok: true });
            return;
          }
          const result: PublishResult = await this.deps.transport
            .publish(relay, w.wrap)
            .catch((e: unknown) => ({ ok: false, message: e instanceof Error ? e.message : String(e) }));
          // A failure keeps everything the transport learned about it.
          deliveries.push({
            recipient: w.recipient,
            relay,
            ...(result.ok ? { ok: true, message: result.message } : result),
          });
          if (!result.ok && result.auth) this.awaitSendAuth(relay);
          update(false);
          if (allReached()) reachedAll();
        }),
      ),
    ).then(() => {
      update(true);
      this.settleOutbox(messageId);
    });
    // Held until the last relay answers, not just until the early return below.
    this.publishing.set(messageId, settled);
    const done = () => {
      if (this.publishing.get(messageId) === settled) this.publishing.delete(messageId);
    };
    settled.then(done, done);
    await Promise.race([early, settled]);
    return this.store.message(messageId);
  }

  /** Once `relay` signs us in, send again whatever it refused for want of a login. */
  private awaitSendAuth(relay: string) {
    if (this.sendAuthWaits.has(relay) || this.stopped) return;
    let fired = false;
    const stop = this.deps.transport.onAuthenticated(relay, () => {
      if (fired) return;
      fired = true;
      queueMicrotask(() => {
        stop();
        this.sendAuthWaits.delete(relay);
        this.core.changed();
        for (const id of this.outgoing.keys()) {
          const refused = this.store
            .message(id)
            ?.outgoing?.deliveries.some((d) => d.relay === relay && !d.ok && d.auth);
          // Still out on its first try: resend once that has heard from every relay.
          if (refused) void (this.publishing.get(id) ?? Promise.resolve()).then(() => this.resend(id));
        }
      });
    });
    if (fired) return;
    this.sendAuthWaits.set(relay, stop);
    this.core.changed();
  }

  /** The engine stopped: no relay's login sends anything any more. */
  stop() {
    for (const stop of this.sendAuthWaits.values()) stop();
    this.sendAuthWaits.clear();
  }
}

/** About ten minutes of once-a-minute retries. */
const MAX_AUTO_RETRIES = 10;
