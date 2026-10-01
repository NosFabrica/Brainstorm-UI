// @vitest-environment node
import { describe, expect, it } from "vitest";
import { finalizeEvent, generateSecretKey, getPublicKey, nip44, verifyEvent } from "nostr-tools";
import {
  CHAT_KIND,
  GIFT_WRAP_KIND,
  SEAL_KIND,
  UnwrapError,
  WRAP_JITTER_SECONDS,
  expirationOf,
  makeRumor,
  randomPast,
  unwrapGiftWrap,
  wrapRumor,
  type SealSigner,
} from "./giftWrap";

function person() {
  const sk = generateSecretKey();
  const pubkey = getPublicKey(sk);
  const signer: SealSigner = {
    pubkey,
    encrypt: async (to, text) => nip44.encrypt(text, nip44.getConversationKey(sk, to)),
    signSeal: async (t) => finalizeEvent(t, sk),
  };
  const decrypt = async (from: string, text: string) => nip44.decrypt(text, nip44.getConversationKey(sk, from));
  return { sk, pubkey, signer, decrypt };
}

describe("gift wrap", () => {
  it("round-trips a chat message to the recipient", async () => {
    const alice = person();
    const bob = person();
    const rumor = makeRumor({ pubkey: alice.pubkey, kind: CHAT_KIND, tags: [["p", bob.pubkey]], content: "hi bob" });
    const wrap = await wrapRumor(rumor, bob.pubkey, alice.signer);

    expect(wrap.kind).toBe(GIFT_WRAP_KIND);
    expect(wrap.pubkey).not.toBe(alice.pubkey);
    expect(wrap.tags).toEqual([["p", bob.pubkey]]);
    expect(verifyEvent(wrap)).toBe(true);

    const opened = await unwrapGiftWrap(wrap, bob.decrypt);
    expect(opened.rumor).toEqual(rumor);
    expect(opened.seal.kind).toBe(SEAL_KIND);
    expect(opened.seal.pubkey).toBe(alice.pubkey);
    expect(opened.seal.tags).toEqual([]);
  });

  it("lets the sender read their own copy", async () => {
    const alice = person();
    const bob = person();
    const rumor = makeRumor({ pubkey: alice.pubkey, kind: CHAT_KIND, tags: [["p", bob.pubkey]], content: "note" });
    const copy = await wrapRumor(rumor, alice.pubkey, alice.signer);
    expect((await unwrapGiftWrap(copy, alice.decrypt)).rumor.content).toBe("note");
  });

  it("back-dates the seal and wrap by up to two days, never into the future", async () => {
    const alice = person();
    const bob = person();
    const at = 1_800_000_000;
    const rumor = makeRumor({ pubkey: alice.pubkey, kind: CHAT_KIND, tags: [], content: "x", created_at: at });
    const early = await wrapRumor(rumor, bob.pubkey, alice.signer, { at, random: () => 0.999999 });
    const late = await wrapRumor(rumor, bob.pubkey, alice.signer, { at, random: () => 0 });
    expect(late.created_at).toBe(at);
    expect(early.created_at).toBeGreaterThan(at - WRAP_JITTER_SECONDS);
    expect(early.created_at).toBeLessThan(at - WRAP_JITTER_SECONDS + 2);
    expect(randomPast(at, () => 0.5)).toBe(at - WRAP_JITTER_SECONDS / 2);
  });

  it("puts a disappearing message's expiration on the wrap", async () => {
    const alice = person();
    const bob = person();
    const rumor = makeRumor({ pubkey: alice.pubkey, kind: CHAT_KIND, tags: [], content: "x" });
    const wrap = await wrapRumor(rumor, bob.pubkey, alice.signer, { expiration: 1_900_000_000 });
    expect(expirationOf(wrap)).toBe(1_900_000_000);
  });

  it("refuses a wrap meant for someone else", async () => {
    const alice = person();
    const bob = person();
    const eve = person();
    const rumor = makeRumor({ pubkey: alice.pubkey, kind: CHAT_KIND, tags: [], content: "secret" });
    const wrap = await wrapRumor(rumor, bob.pubkey, alice.signer);
    await expect(unwrapGiftWrap(wrap, eve.decrypt)).rejects.toThrow();
  });

  it("opens a seal that carries tags, as Amethyst's does", async () => {
    const alice = person();
    const bob = person();
    const amethyst: SealSigner = {
      ...alice.signer,
      signSeal: async (t) => finalizeEvent({ ...t, tags: [["client", "Amethyst"]] }, alice.sk),
    };
    const rumor = makeRumor({ pubkey: alice.pubkey, kind: CHAT_KIND, tags: [["p", bob.pubkey]], content: "Hi" });
    const opened = await unwrapGiftWrap(await wrapRumor(rumor, bob.pubkey, amethyst), bob.decrypt);
    expect(opened.rumor.content).toBe("Hi");
    expect(opened.seal.tags).toEqual([["client", "Amethyst"]]);
  });

  it("refuses a rumor that claims an author other than the seal's", async () => {
    const mallory = person();
    const alice = person();
    const bob = person();
    // Mallory seals a rumor that says it is from Alice.
    const forged = makeRumor({ pubkey: alice.pubkey, kind: CHAT_KIND, tags: [], content: "send money" });
    const wrap = await wrapRumor(forged, bob.pubkey, mallory.signer);
    await expect(unwrapGiftWrap(wrap, bob.decrypt)).rejects.toBeInstanceOf(UnwrapError);
  });

  it("recomputes the rumor id rather than trusting the one inside", async () => {
    const alice = person();
    const bob = person();
    const rumor = {
      ...makeRumor({ pubkey: alice.pubkey, kind: CHAT_KIND, tags: [], content: "a" }),
      id: "f".repeat(64),
    };
    const wrap = await wrapRumor(rumor, bob.pubkey, alice.signer);
    const opened = await unwrapGiftWrap(wrap, bob.decrypt);
    expect(opened.rumor.id).not.toBe("f".repeat(64));
    expect(opened.rumor.id).toBe(makeRumor({ ...rumor }).id);
  });

  it("refuses a tampered wrap", async () => {
    const alice = person();
    const bob = person();
    const rumor = makeRumor({ pubkey: alice.pubkey, kind: CHAT_KIND, tags: [], content: "a" });
    const wrap = await wrapRumor(rumor, bob.pubkey, alice.signer);
    // As a relay would deliver it: a fresh object, no cached verification.
    const tampered = { ...JSON.parse(JSON.stringify(wrap)), created_at: wrap.created_at + 1 };
    await expect(unwrapGiftWrap(tampered, bob.decrypt)).rejects.toThrow(/signature/);
  });
});
