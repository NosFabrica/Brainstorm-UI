// @vitest-environment node
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * There must be exactly one `EventStore` in the app.
 *
 * A second one gets its own model cache and its own `insert$`/`update$` streams,
 * so observables derived from one silently never see writes to the other —
 * applesauce's most common integration bug, and a miserable one to find because
 * nothing errors. It just goes quiet: a component subscribes, the data arrives in
 * the *other* store, and the screen never updates.
 *
 * This reads the source rather than the runtime because the failure it guards is
 * a source edit — somebody writing `new EventStore()` in a second module. At
 * runtime the two stores would both work perfectly, separately, which is the
 * whole problem.
 *
 * The owner is `lib/eventStore.ts`, beside the pool. It used to be
 * `services/nostr.ts`; it moved down when `lib/relayRequest.ts` came to need it,
 * for the same reason the pool lives there — `services/nostr.ts` may import from
 * `lib/`, and not the other way about.
 */
const SOURCE_ROOT = new URL("../", import.meta.url).pathname;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

describe("the app's event store", () => {
  it("is constructed exactly once, and in the module that owns it", () => {
    const built = sourceFiles(SOURCE_ROOT).filter((file) =>
      /\bnew EventStore\s*\(/.test(readFileSync(file, "utf8")),
    );

    expect(built.map((file) => file.slice(SOURCE_ROOT.length))).toEqual(["lib/eventStore.ts"]);
  });
});
