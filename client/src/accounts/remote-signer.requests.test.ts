// @vitest-environment node
import { describe, expect, it } from "vitest";

import { SettlingRequests } from "./remote-signer";

const settle = () => new Promise((r) => setTimeout(r, 0));

function deferred() {
  let resolve!: (v: string) => void;
  let reject!: (e: unknown) => void;
  const p = new Promise<string>((ok, no) => {
    resolve = ok;
    reject = no;
  });
  return Object.assign(p, { resolve, reject });
}

describe("SettlingRequests", () => {
  it("forgets a request once it is answered, either way", async () => {
    const book = new SettlingRequests<ReturnType<typeof deferred>>();
    const ok = deferred();
    const no = deferred();
    book.set("a", ok);
    book.set("b", no);
    ok.resolve("plain");
    no.reject(new Error("rate limited"));
    await settle();
    expect(book.size).toBe(0);
  });

  it("forgets one never answered once it is long past its deadline", () => {
    let now = 0;
    const book = new SettlingRequests<ReturnType<typeof deferred>>(1_000, () => now);
    book.set("dropped", deferred());
    now = 500;
    book.set("recent", deferred());
    expect(book.has("dropped")).toBe(true);
    now = 1_200;
    book.set("next", deferred());
    expect([...book.keys()]).toEqual(["recent", "next"]);
  });
});
