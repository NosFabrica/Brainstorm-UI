// @vitest-environment node
import { describe, expect, it } from "vitest";
import { SignerMismatchError } from "applesauce-accounts";
import { ExtensionMissingError } from "applesauce-signers";

import { UnlockCancelled } from "./local-signer";
import { RemoteSignerTimeoutError } from "./remote-signer";
import { classifySignerError, SignerDeclinedError, signerSaidNo, type SignerErrorKind } from "./signer-errors";
import { NoSignerError } from "./signing";

/** What signers send, and what it means. nos2x's "denied" and Amber's "Canceled" are verbatim from their source. */
const CASES: [string, unknown, SignerErrorKind][] = [
  ["our unlock modal, dismissed", new UnlockCancelled(), "cancelled"],
  ["an extension answering nothing (Nostash)", new SignerDeclinedError(), "declined"],
  ["a declined error that crossed a module reload", { name: "SignerDeclinedError", message: "x" }, "declined"],
  ["nos2x", new Error("denied"), "declined"],
  ["an extension's rejection", new Error("User rejected the request"), "declined"],
  ["a NIP-46 bunker", new Error("user rejected"), "declined"],
  ["a bunker's permission refusal", new Error("Permission denied"), "declined"],
  ["a bunker refusing an unpaired app", new Error("not authorized"), "declined"],
  ["an extension without a grant", new Error("Permission not granted"), "declined"],
  ["Amber's clipboard flow, a bare string", "Canceled", "declined"],
  ["our deadline", new RemoteSignerTimeoutError(), "timeout"],
  ["a relay's timeout is not the signer's", new Error("COUNT timeout"), "unknown"],
  ["no extension in this browser", new ExtensionMissingError("Signer extension missing"), "missing"],
  ["an extension on another profile", new SignerMismatchError("Signer signed with wrong pubkey"), "wrong-account"],
  ["NIP-44 MAC", new Error("invalid MAC"), "bad-payload"],
  ["NIP-44 version", new Error("unknown encryption version 3"), "bad-payload"],
  ["NIP-44 padding", new Error("invalid padding"), "bad-payload"],
  ["Amethyst's bunker, asked too fast", new Error("rate limited"), "rate-limited"],
  ["a relay's NIP-01 prefix", new Error("rate-limited: slow down there chief"), "rate-limited"],
  ["an HTTP-style bunker", new Error("Too Many Requests"), "rate-limited"],
  ["a closed bunker connection", new Error("Closed"), "unknown"],
  ["window.nostr gone", new Error("window.nostr not found"), "unknown"],
  ["nothing signed in", new NoSignerError(), "unknown"],
  ["undefined", undefined, "unknown"],
];

describe("classifySignerError", () => {
  it.each(CASES)("%s", (_, error, kind) => {
    expect(classifySignerError(error)).toBe(kind);
  });
});

describe("signerSaidNo", () => {
  it("is the reader's own no: a declined prompt, or a cancelled unlock", () => {
    for (const [, error, kind] of CASES) expect(signerSaidNo(error)).toBe(kind === "declined" || kind === "cancelled");
  });
});
