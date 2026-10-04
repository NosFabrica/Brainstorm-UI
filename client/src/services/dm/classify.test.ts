import { describe, expect, it } from "vitest";
import { BrainstormExtensionAccount, ExtensionDeclinedError } from "@/accounts/extension";
import { RemoteSignerTimeoutError } from "@/accounts/remote-signer";
import { dmAccountFor } from "./index";

describe("an extension's declined decrypt", () => {
  it("is the signer saying no, never a broken message", () => {
    const account = new BrainstormExtensionAccount("a".repeat(64));
    const { classify } = dmAccountFor(account);
    expect(classify(new ExtensionDeclinedError())).toBe("refused");
    expect(classify(new RemoteSignerTimeoutError("Your signer extension didn't answer."))).toBe("unreachable");
  });
});
