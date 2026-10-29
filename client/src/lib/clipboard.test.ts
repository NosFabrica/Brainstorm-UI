/** Copying a link still being minted: the write starts inside the tap, the long link stands in. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { copyPromisedText } from "./clipboard";

const LONG = "https://brainstorm.world/p/npub1abc";
const SHORT = "https://brainstorm.world/s/AB3XK9QZ";

class FakeClipboardItem {
  constructor(readonly items: Record<string, Promise<Blob>>) {}
}
const textOf = async (item: FakeClipboardItem) => {
  const blob = await item.items["text/plain"];
  expect(blob.type).toBe("text/plain");
  return blob.text();
};

const write = vi.fn(async (_items: FakeClipboardItem[]) => {});
const writeText = vi.fn(async (_text: string) => {});

beforeEach(() => {
  write.mockReset().mockImplementation(async () => {});
  writeText.mockClear();
  Object.defineProperty(navigator, "clipboard", { value: { write, writeText }, configurable: true });
  Object.defineProperty(window, "isSecureContext", { value: true, configurable: true });
  vi.stubGlobal("ClipboardItem", FakeClipboardItem);
});
afterEach(() => vi.unstubAllGlobals());

describe("copyPromisedText", () => {
  it("starts the write at once, with the text to come", async () => {
    let resolve!: (s: string) => void;
    const done = copyPromisedText(new Promise<string>((r) => (resolve = r)), LONG);
    expect(write).toHaveBeenCalledTimes(1);
    resolve(SHORT);
    expect(await done).toBe(true);
    expect(await textOf(write.mock.calls[0][0][0])).toBe(SHORT);
    expect(writeText).not.toHaveBeenCalled();
  });

  it("a text that never comes copies the fallback", async () => {
    expect(await copyPromisedText(Promise.reject(new Error("429")), LONG)).toBe(true);
    expect(await textOf(write.mock.calls[0][0][0])).toBe(LONG);
  });

  it("without ClipboardItem, copies the fallback as plain text", async () => {
    vi.stubGlobal("ClipboardItem", undefined);
    expect(await copyPromisedText(Promise.resolve(SHORT), LONG)).toBe(true);
    expect(write).not.toHaveBeenCalled();
    expect(writeText).toHaveBeenCalledWith(LONG);
  });

  it("a refused write copies the fallback as plain text", async () => {
    write.mockRejectedValue(new DOMException("", "NotAllowedError"));
    expect(await copyPromisedText(Promise.resolve(SHORT), LONG)).toBe(true);
    expect(writeText).toHaveBeenCalledWith(LONG);
  });
});
