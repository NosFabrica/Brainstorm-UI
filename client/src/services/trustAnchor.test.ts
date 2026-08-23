/**
 * The consent gate and the user-initiated NIP-85 publish, introduced when the
 * 10040 ask moved to the calculate step. The stakes: `shouldAutoPublishNip85`
 * decides whether we ever sign under the user's key without them clicking a
 * publish button, so an explicit decline must beat every implicit yes.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const triggerGrapeRank = vi.fn(async () => ({}));
const getUserHistory = vi.fn(async () => ({ data: {} }));
const signNip85 = vi.fn(async () => ({ id: "e".repeat(64), pubkey: "a".repeat(64) }));
const publishToRelays = vi.fn(async () => ({ success: true }));
const isUsingBrainstorm = vi.fn(async () => false);
const fetchTrustProviderList = vi.fn(async (): Promise<{ tags: string[][] } | undefined> => undefined);
const fetchOutboxRelayList = vi.fn(async () => undefined);
const isUnlockCancelled = vi.fn(() => false);
const identityHas = vi.fn(() => false);
const isNip85Activated = vi.fn(() => false);
const markNip85Activated = vi.fn();
const clearNip85Activated = vi.fn();
const activeAccount = vi.fn((): { pubkey: string } | null => null);
const canSignSilently = vi.fn(async () => false);

vi.mock("./api", () => ({
  apiClient: {
    triggerGrapeRank: () => triggerGrapeRank(),
    getUserHistory: () => getUserHistory(),
  },
}));
vi.mock("./nostr", () => ({
  fetchOutboxRelayList: (...a: unknown[]) => fetchOutboxRelayList(...(a as [])),
  fetchTrustProviderList: (...a: unknown[]) => fetchTrustProviderList(...(a as [])),
  getNip85RelayUrl: () => "wss://nip85.example",
  isUsingBrainstorm: (...a: unknown[]) => isUsingBrainstorm(...(a as [])),
  publishToRelays: (...a: unknown[]) => publishToRelays(...(a as [])),
  signNip85: (...a: unknown[]) => signNip85(...(a as [])),
}));
vi.mock("@/accounts/signing", () => ({
  activeAccount: () => activeAccount(),
  canSignSilently: () => canSignSilently(),
}));
vi.mock("@/accounts/local-signer", () => ({
  isUnlockCancelled: (e: unknown) => isUnlockCancelled(e),
}));
vi.mock("@/accounts/display", () => ({
  identityHas: (...a: unknown[]) => identityHas(...(a as [])),
}));
vi.mock("@/lib/nip85Activation", () => ({
  isNip85Activated: (...a: unknown[]) => isNip85Activated(...(a as [])),
  markNip85Activated: (...a: unknown[]) => markNip85Activated(...(a as [])),
  clearNip85Activated: (...a: unknown[]) => clearNip85Activated(...(a as [])),
}));

import {
  checkExistingTrustProvider,
  ensureBrainstormTrustAnchor,
  publishBrainstormTrustAnchor,
  shouldAutoPublishNip85,
  triggerScoringAndAnchor,
} from "./trustAnchor";
import { hasNip85Consent, recordNip85Consent } from "@/lib/nip85Consent";

const ME = "a".repeat(64);
const TA = "f".repeat(64);

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  identityHas.mockReturnValue(false);
  // Keeps `pollAndPublishTrustAnchor` a no-op so consenting trigger tests don't
  // leave a 15-second timer running behind the assertions.
  isNip85Activated.mockReturnValue(true);
});

describe("shouldAutoPublishNip85 — who may be published for without a click", () => {
  it("explicit consent enables it for any account type", () => {
    recordNip85Consent(ME, true);
    expect(shouldAutoPublishNip85(ME)).toBe(true);
  });

  it("never-asked + created in app keeps the legacy implicit consent", () => {
    identityHas.mockReturnValue(true);
    expect(shouldAutoPublishNip85(ME)).toBe(true);
  });

  it("an explicit decline beats createdInApp", () => {
    identityHas.mockReturnValue(true);
    recordNip85Consent(ME, false);
    expect(shouldAutoPublishNip85(ME)).toBe(false);
  });

  it("never-asked + external key stays manual-only", () => {
    expect(shouldAutoPublishNip85(ME)).toBe(false);
  });
});

describe("triggerScoringAndAnchor", () => {
  it("records the consent it was handed, then triggers scoring", async () => {
    await triggerScoringAndAnchor(ME, { nip85Consent: true });
    expect(hasNip85Consent(ME)).toBe(true);
    expect(triggerGrapeRank).toHaveBeenCalledTimes(1);
  });

  it("records a decline the same way", async () => {
    await triggerScoringAndAnchor(ME, { nip85Consent: false });
    expect(hasNip85Consent(ME)).toBe(false);
    expect(triggerGrapeRank).toHaveBeenCalledTimes(1);
  });

  it("legacy callers (no opts) leave the consent record untouched", async () => {
    await triggerScoringAndAnchor(ME);
    expect(localStorage.getItem(`brainstorm_nip85_consent:${ME}`)).toBeNull();
    expect(triggerGrapeRank).toHaveBeenCalledTimes(1);
  });
});

describe("publishBrainstormTrustAnchor — the user-initiated publish", () => {
  it("signs, publishes, marks activated, and narrates its phases", async () => {
    const phases: string[] = [];
    const res = await publishBrainstormTrustAnchor(ME, TA, (p) => phases.push(p));
    expect(res).toEqual({ status: "success" });
    expect(signNip85).toHaveBeenCalledWith(TA, "wss://nip85.example");
    expect(markNip85Activated).toHaveBeenCalledWith(ME);
    expect(phases).toEqual(["signing", "publishing"]);
  });

  it("a refused signature is cancelled, not an error", async () => {
    signNip85.mockRejectedValueOnce(new Error("nope"));
    const res = await publishBrainstormTrustAnchor(ME, TA);
    expect(res).toEqual({ status: "cancelled", unlockDeclined: false });
    expect(markNip85Activated).not.toHaveBeenCalled();
  });

  it("a declined unlock is flagged so callers can stay silent", async () => {
    signNip85.mockRejectedValueOnce(new Error("locked"));
    isUnlockCancelled.mockReturnValueOnce(true);
    const res = await publishBrainstormTrustAnchor(ME, TA);
    expect(res).toEqual({ status: "cancelled", unlockDeclined: true });
  });

  it("relay rejection surfaces the message and does not mark activated", async () => {
    publishToRelays.mockResolvedValueOnce({ success: false, error: "all relays refused" } as never);
    const res = await publishBrainstormTrustAnchor(ME, TA);
    expect(res).toEqual({ status: "error", message: "all relays refused" });
    expect(markNip85Activated).not.toHaveBeenCalled();
  });
});

describe("checkExistingTrustProvider — the consent card's pre-check", () => {
  it("no 10040 on their outbox relays → none", async () => {
    expect(await checkExistingTrustProvider(ME, TA)).toBe("none");
    // The outbox list is warmed first so the 10040 read routes correctly.
    expect(fetchOutboxRelayList).toHaveBeenCalledWith(ME);
  });

  it("an exact Brainstorm declaration → brainstorm, recorded locally", async () => {
    isUsingBrainstorm.mockResolvedValueOnce(true);
    expect(await checkExistingTrustProvider(ME, TA)).toBe("brainstorm");
    expect(markNip85Activated).toHaveBeenCalledWith(ME);
  });

  it("a declaration naming someone else → other, and the local flag is dropped", async () => {
    fetchTrustProviderList.mockResolvedValueOnce({ tags: [["30382:rank", "c".repeat(64), "wss://elsewhere"]] });
    expect(await checkExistingTrustProvider(ME, TA)).toBe("other");
    expect(markNip85Activated).not.toHaveBeenCalled();
    // A foreign declaration is definitive presence — the "activated" cache must
    // not keep claiming Brainstorm over it.
    expect(clearNip85Activated).toHaveBeenCalledWith(ME);
  });

  // Any 10040 is not enough — assistants are per-user keys, so even a
  // Brainstorm-relay-hinted declaration counts only when its rank pubkey IS
  // this user's assistant. Unverifiable (no ta_pubkey yet) reads as "other";
  // the card re-checks once /user/history delivers the key.
  it("without a ta_pubkey, an existing declaration is never 'already set'", async () => {
    fetchTrustProviderList.mockResolvedValue({ tags: [["30382:rank", "c".repeat(64), "wss://nip85.example"]] });
    expect(await checkExistingTrustProvider(ME)).toBe("other");
    expect(markNip85Activated).not.toHaveBeenCalled();
    // …but with no assistant key to compare against, "other" is a guess, not
    // evidence — the flag must survive it.
    expect(clearNip85Activated).not.toHaveBeenCalled();
  });

  it("rank pubkey equal to the assistant counts even when the strict relay check fails", async () => {
    fetchTrustProviderList.mockResolvedValueOnce({ tags: [["30382:rank", TA, "wss://elsewhere"]] });
    expect(await checkExistingTrustProvider(ME, TA)).toBe("brainstorm");
    // …but only the strict both-tags+relay match is recorded as published fact.
    expect(markNip85Activated).not.toHaveBeenCalled();
  });
});

/**
 * The automatic publish path (background poll + app-load self-heal) versus a
 * foreign declaration. `isUsingBrainstorm === false` alone cannot tell "no
 * 10040" from "a 10040 naming someone else" — and only the second must stop
 * the publish: the user's on-relay declaration takes precedence over anything
 * this app decided in the background.
 */
describe("ensureBrainstormTrustAnchor — the on-relay 10040 wins", () => {
  beforeEach(() => {
    isNip85Activated.mockReturnValue(false);
    activeAccount.mockReturnValue({ pubkey: ME });
    canSignSilently.mockResolvedValue(true);
    // clearAllMocks keeps implementations — pin the inert defaults so a
    // persistent mockResolvedValue can't leak between these tests.
    fetchTrustProviderList.mockResolvedValue(undefined);
    isUsingBrainstorm.mockResolvedValue(false);
  });

  it("backs off from a declaration naming a different assistant — never a silent replace", async () => {
    fetchTrustProviderList.mockResolvedValue({ tags: [["30382:rank", "c".repeat(64), "wss://elsewhere"]] });

    await ensureBrainstormTrustAnchor(ME, TA);

    expect(signNip85).not.toHaveBeenCalled();
    expect(publishToRelays).not.toHaveBeenCalled();
    expect(markNip85Activated).not.toHaveBeenCalled();
  });

  it("records an existing Brainstorm declaration and stops", async () => {
    isUsingBrainstorm.mockResolvedValueOnce(true);

    await ensureBrainstormTrustAnchor(ME, TA);

    expect(markNip85Activated).toHaveBeenCalledWith(ME);
    expect(signNip85).not.toHaveBeenCalled();
  });

  it("publishes when relays hold no declaration at all", async () => {
    await ensureBrainstormTrustAnchor(ME, TA);

    expect(signNip85).toHaveBeenCalledWith(TA, "wss://nip85.example");
    expect(markNip85Activated).toHaveBeenCalledWith(ME);
  });
});
