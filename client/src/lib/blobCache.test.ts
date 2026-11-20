// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { sha256Text } from "@/lib/frontPage/observerSite";

let cache: typeof import("./blobCache");

beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory();
  cache = await import("./blobCache");
  cache.__resetBlobCache();
});

/** Read as a new page load would: nothing in memory, only the device. */
async function reload() {
  cache.__resetBlobCache();
}

describe("the device's Blossom files", () => {
  it("keeps a file by its hash across a reload", async () => {
    const text = "<p>edition</p>";
    const hash = await sha256Text(text);
    await cache.writeBlob(hash, text);
    await reload();
    expect(await cache.readBlob(hash.toUpperCase())).toBe(text);
  });

  it("refuses to keep bytes under a hash that isn't theirs", async () => {
    await cache.writeBlob("0".repeat(64), "<p>not that</p>");
    await reload();
    expect(await cache.readBlob("0".repeat(64))).toBeNull();
  });

  it("never serves a copy changed on disk", async () => {
    const text = "<p>original</p>";
    const hash = await sha256Text(text);
    await cache.writeBlob(hash, text);
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open("brainstorm-blobs");
      open.onsuccess = () => {
        const tx = open.result.transaction("blobs", "readwrite");
        tx.objectStore("blobs").put({ sha256: hash, text: "<p>swapped</p>", at: Date.now() });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      };
    });
    await reload();
    expect(await cache.readBlob(hash)).toBeNull();
  });

  it("is bounded, evicting the oldest", async () => {
    const hashes: string[] = [];
    // A clock that always moves: a timer can fire within the same millisecond, and a
    // tie would be evicted in hash order instead.
    let tick = 1_000;
    const clock = vi.spyOn(Date, "now").mockImplementation(() => ++tick);
    try {
      for (let i = 0; i <= cache.MAX_BLOBS; i++) {
        const text = `<p>${i}</p>`;
        hashes.push(await sha256Text(text));
        await cache.writeBlob(hashes[i], text);
      }
    } finally {
      clock.mockRestore();
    }
    await reload();
    expect(await cache.readBlob(hashes[0])).toBeNull();
    expect(await cache.readBlob(hashes[cache.MAX_BLOBS])).toBe(`<p>${cache.MAX_BLOBS}</p>`);
  });

  it("forgets everything on sign-out", async () => {
    const text = "<p>trail</p>";
    const hash = await sha256Text(text);
    await cache.writeBlob(hash, text);
    await cache.clearBlobCache();
    await reload();
    expect(await cache.readBlob(hash)).toBeNull();
  });
});
