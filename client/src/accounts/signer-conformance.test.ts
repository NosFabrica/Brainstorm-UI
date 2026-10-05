// @vitest-environment node
/**
 * Every flow that asks a signer, against every way a NIP-07 extension behaves.
 *
 * Each feature used to be tested against the one signer its author had in mind,
 * so an extension that answered a "no" differently — Nostash resolving
 * `undefined` — passed every suite and still lost messages for good. The rows
 * here are the extensions (`signer-fakes.ts`); the columns are the flows, each
 * observed the way the app itself observes it:
 *
 * - **login**: `handleLogin`, the extension button on the login picker.
 * - **publish**: `signAs` → `signingFailure`, what every publish reports.
 * - **relay sign-in**: `signerSaidNo` on that same error — what `startRelayAuth`
 *   is handed to tell a "no" (wait for the reader) from a failure (retry).
 * - **private messages**: a real gift wrap opened through `dmAccountFor`, its
 *   failure sorted exactly as the DM engine sorts it.
 * - **self-encryption**: `encryptToSelf` / `decryptFromSelf`, behind DM prefs
 *   sync and the alert-preference list.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PrivateKeySigner } from "applesauce-signers";
import { finalizeEvent, generateSecretKey, getPublicKey } from "nostr-tools/pure";
import type { EventTemplate } from "nostr-tools";

import { accountManager } from "@/accounts";
import { CHAT_KIND, makeRumor, unwrapGiftWrap, UnwrapError, wrapRumor } from "@/lib/dm/giftWrap";
import { pool } from "@/lib/relayPool";
import { dmAccountFor } from "@/services/dm";
import { publishAlertPrefs } from "@/services/nostr";
import type { SignerFailure } from "@/services/dm/engine";
import { BrainstormExtensionAccount, EXTENSION_TIMEOUT_MS } from "./extension";
import type { BrainstormAccount } from "./metadata";
import { classifySignerError, signerSaidNo } from "./signer-errors";
import { installExtension, removeExtension, type ExtensionBehaviour, type FakeExtension } from "./signer-fakes";
import { decryptFromSelf, encryptToSelf, signAs, signingFailure } from "./signing";
import { loginTemplate } from "./session";

vi.mock("./session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./session")>()),
  // The backend half of a login, minus the backend: the challenge is still signed.
  sessions: {
    authenticate: async (account: BrainstormAccount) => {
      await account.signEvent(loginTemplate("challenge"));
      return "token.eyJhbGciOiJIUzI1NiJ9.sig";
    },
    ensureSession: async () => "token.eyJhbGciOiJIUzI1NiJ9.sig",
  },
}));
vi.mock("@/lib/queryClient", () => ({ queryClient: { clear: () => {} } }));
vi.mock("@/services/api", () => ({ apiClient: {} }));
// What a login fires and forgets at relays.
vi.mock("@/lib/relayRouting", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/relayRouting")>()),
  loadRelayList: async () => null,
}));
vi.mock("@/services/nostr", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/nostr")>()),
  fetchProfile: async () => null,
}));
vi.mock("@/services/socialActions", () => ({ fetchContactList: async () => null }));

const template = { kind: 1, tags: [], content: "hello" };

/** Run `work` to completion, letting every deadline it races pass. */
async function settled<T>(work: Promise<T>): Promise<{ value?: T; error?: unknown }> {
  const result = work.then(
    (value) => ({ value }),
    (error: unknown) => ({ error }),
  );
  await vi.advanceTimersByTimeAsync(EXTENSION_TIMEOUT_MS + 1000);
  return result;
}

/** A message from someone else to `to`, wrapped as any NIP-17 client wraps it. */
async function messageTo(to: string, content: string) {
  const sender = new PrivateKeySigner(generateSecretKey());
  const pubkey = await sender.getPublicKey();
  return wrapRumor(makeRumor({ pubkey, kind: CHAT_KIND, tags: [["p", to]], content }), to, {
    pubkey,
    encrypt: (recipient, plaintext) => sender.nip44.encrypt(recipient, plaintext),
    signSeal: (seal) => sender.signEvent(seal),
  });
}

/** Open a wrap through the account, sorting a failure exactly as `DmEngine` does. */
async function openMessage(account: BrainstormAccount, fake: FakeExtension): Promise<string | SignerFailure> {
  const dm = dmAccountFor(account);
  if (!dm.decrypt) return "no-nip44";
  const { value, error } = await settled(unwrapGiftWrap(await messageTo(fake.pubkey, "hi there"), dm.decrypt));
  if (value) return value.rumor.content;
  return error instanceof UnwrapError ? "broken" : dm.classify(error);
}

type Expected = {
  /** "ok" signs in as whichever profile the extension is on now. */
  login: "ok" | "PERMISSION_DENIED" | "SIGN_CANCELLED" | "silent";
  publish: "ok" | "declined" | "unreachable" | "other-profile";
  /** Whether relay sign-in records the reader's "no" and stops asking. */
  relaySaidNo?: boolean;
  /** What opening a private message comes to. "broken" is remembered for good. */
  message?: string | SignerFailure;
  /** Whether a self-encrypted copy can be written and read back. */
  selfEncryption?: boolean;
};

const MATRIX: [ExtensionBehaviour, Expected][] = [
  ["works", { login: "ok", publish: "ok", message: "hi there", selfEncryption: true }],
  [
    "rejects",
    { login: "PERMISSION_DENIED", publish: "declined", relaySaidNo: true, message: "refused", selfEncryption: false },
  ],
  [
    "answers-nothing",
    { login: "PERMISSION_DENIED", publish: "declined", relaySaidNo: true, message: "refused", selfEncryption: false },
  ],
  [
    "never-answers",
    { login: "silent", publish: "unreachable", relaySaidNo: false, message: "unreachable", selfEncryption: false },
  ],
  ["no-nip44", { login: "ok", publish: "ok", message: "no-nip44", selfEncryption: false }],
  // Its self-encryption is covered where it would reach relays, below.
  ["switched-profile", { login: "ok", publish: "other-profile", relaySaidNo: false, message: "wrong-account" }],
];

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  removeExtension();
  for (const account of [...accountManager.accounts]) accountManager.removeAccount(account);
});

describe.each(MATRIX)("an extension that %s", (behaviour, expected) => {
  it(`login: ${expected.login}`, async () => {
    const fake = installExtension(behaviour);
    const { handleLogin } = await import("./login-flow");
    const { value, error } = await settled(handleLogin());

    if (expected.login === "ok") {
      expect(error).toBeUndefined();
      expect(value?.pubkey).toBe(fake.currentPubkey);
      return;
    }
    const { code, message } = error as { code: string; message: string };
    if (expected.login === "silent") {
      expect(code).toBe("EXTENSION_FAILED");
      expect(message).toMatch(/didn't answer/);
    } else {
      expect(code).toBe(expected.login);
    }
    expect(accountManager.active).toBeUndefined();
  });

  it(`publish: ${expected.publish}`, async () => {
    const fake = installExtension(behaviour);
    const account = new BrainstormExtensionAccount(fake.pubkey) as unknown as BrainstormAccount;
    const { value, error } = await settled(signAs(account, template));

    if (expected.publish === "ok") {
      expect(value?.pubkey).toBe(fake.pubkey);
      return;
    }
    const outcome = signingFailure(error);
    expect(outcome.success).toBe(false);
    expect(outcome.cancelled).toBeFalsy();
    expect(!!outcome.signerUnreachable).toBe(expected.publish === "unreachable");
    if (expected.publish === "declined") expect(classifySignerError(error)).toBe("declined");
    if (expected.publish === "other-profile") expect(outcome.error).toMatch(/different profile/);
  });

  if (expected.relaySaidNo !== undefined) {
    it(`relay sign-in: ${expected.relaySaidNo ? "a no, kept until the reader asks again" : "retried"}`, async () => {
      const fake = installExtension(behaviour);
      const account = new BrainstormExtensionAccount(fake.pubkey) as unknown as BrainstormAccount;
      const { error } = await settled(signAs(account, loginTemplate("relay-challenge")));
      expect(signerSaidNo(error)).toBe(expected.relaySaidNo);
    });
  }

  if (expected.message !== undefined) {
    it(`private message: ${expected.message}`, async () => {
      const fake = installExtension(behaviour);
      const account = new BrainstormExtensionAccount(fake.pubkey) as unknown as BrainstormAccount;
      expect(await openMessage(account, fake)).toBe(expected.message);
    });
  }

  if (expected.selfEncryption !== undefined) {
    it(`self-encryption: ${expected.selfEncryption ? "round-trips" : "reports it can't, without throwing"}`, async () => {
      const fake = installExtension(behaviour);
      const account = new BrainstormExtensionAccount(fake.pubkey) as unknown as BrainstormAccount;
      const { value: sealed } = await settled(encryptToSelf(account, "prefs"));
      if (!expected.selfEncryption) {
        expect(sealed).toBeNull();
        return;
      }
      const { value: opened } = await settled(decryptFromSelf(account, sealed!));
      expect(opened).toBe("prefs");
    });
  }
});

describe("an extension that switches profile mid-login", () => {
  it("says so, rather than that signing failed", async () => {
    installExtension("works");
    const other = generateSecretKey();
    const nostr = (globalThis as unknown as { window: { nostr: Record<string, unknown> } }).window.nostr;
    nostr.signEvent = async (t: EventTemplate) => finalizeEvent(t, other);
    const { handleLogin } = await import("./login-flow");
    const { error } = await settled(handleLogin());
    expect((error as Error).message).toMatch(/different profile/);
    expect(accountManager.active).toBeUndefined();
  });
});

describe("an extension that injects late", () => {
  it("is still found by login, within the wait", async () => {
    const fake = installExtension("works", { after: 500 });
    const { handleLogin } = await import("./login-flow");
    const { value } = await settled(handleLogin());
    expect(value?.pubkey).toBe(fake.pubkey);
  });
});

describe("no extension at all", () => {
  beforeEach(() => removeExtension());
  const account = () => new BrainstormExtensionAccount("a".repeat(64)) as unknown as BrainstormAccount;

  it("login: says so, rather than that it failed", async () => {
    const { handleLogin } = await import("./login-flow");
    const { error } = await settled(handleLogin());
    expect((error as { code: string }).code).toBe("NO_EXTENSION");
  });

  it("publish and relay sign-in: missing, not a no", async () => {
    const { error } = await settled(signAs(account(), template));
    expect(classifySignerError(error)).toBe("missing");
    expect(signerSaidNo(error)).toBe(false);
  });

  it("private messages: not yet, rather than never — it may still inject", async () => {
    const fake = installExtension("works");
    removeExtension();
    const account = new BrainstormExtensionAccount(fake.pubkey) as unknown as BrainstormAccount;
    expect(await openMessage(account, fake)).toBe("unreachable");
  });
});

describe("an extension that injects after private messages started", () => {
  it("opens them once it's here", async () => {
    const fake = installExtension("works");
    removeExtension();
    const account = new BrainstormExtensionAccount(fake.pubkey) as unknown as BrainstormAccount;
    const dm = dmAccountFor(account);
    expect(dm.decrypt).toBeDefined();
    installExtension("works", { secretKey: fake.secretKey });
    const { value } = await settled(unwrapGiftWrap(await messageTo(fake.pubkey, "late"), dm.decrypt!));
    expect(value?.rumor.content).toBe("late");
  });
});

describe("a message that really won't open", () => {
  it("is still remembered as broken once the extension confirms its profile — asked once for a run of them", async () => {
    const fake = installExtension("works");
    const account = new BrainstormExtensionAccount(fake.pubkey) as unknown as BrainstormAccount;
    const dm = dmAccountFor(account);
    // Sealed for someone else: no key this account holds can open it.
    const stranger = getPublicKey(generateSecretKey());
    const wraps = await Promise.all([1, 2, 3].map(() => messageTo(stranger, "not yours")));
    const opened = await settled(Promise.allSettled(wraps.map((wrap) => unwrapGiftWrap(wrap, dm.decrypt!))));
    for (const result of opened.value!) {
      const error = result.status === "rejected" ? result.reason : undefined;
      expect(error instanceof UnwrapError ? "broken" : dm.classify(error)).toBe("broken");
    }
    expect(fake.calls.filter((call) => call === "getPublicKey")).toHaveLength(1);
  });
});

describe("a self-encrypted copy from a switched profile", () => {
  it("never reaches a relay: signing it fails as the wrong profile", async () => {
    const fake = installExtension("switched-profile");
    const account = new BrainstormExtensionAccount(fake.pubkey) as unknown as BrainstormAccount;
    accountManager.addAccount(account);
    accountManager.setActive(account);
    const publish = vi.spyOn(pool, "publish");

    const { value: outcome } = await settled(publishAlertPrefs({ muted: [] }, "test-prefs"));

    expect(outcome?.success).toBe(false);
    expect(outcome?.error).toMatch(/different profile/);
    expect(publish).not.toHaveBeenCalled();
  });
});
