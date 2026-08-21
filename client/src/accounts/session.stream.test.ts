// @vitest-environment node
import { describe, expect, it } from "vitest";
import { BehaviorSubject, Subject } from "rxjs";

import { activeHasSession$ } from "./session";

function account(session?: { token: string; isAdmin: boolean }) {
  const metadata$ = new Subject<unknown>();
  return {
    account: { metadata: { remembered: true, ...(session ? { session } : {}) }, metadata$ },
    touch: () => metadata$.next(null),
  };
}

function watch(active$: BehaviorSubject<unknown>) {
  const seen: boolean[] = [];
  const sub = activeHasSession$({ active$ } as never).subscribe((v) => seen.push(v));
  return { seen, stop: () => sub.unsubscribe() };
}

/**
 * `activeHasSession()` is read during render, so nothing tells a component the
 * answer changed. A React Query `enabled` gate gets stuck: minting a Session
 * leaves the query disabled, and `invalidateQueries` will not refetch a disabled
 * query — the unlock clears the notice and the page stays empty.
 */
describe("whether the active account has a session, as a stream", () => {
  it("is false with nobody signed in", () => {
    const { seen, stop } = watch(new BehaviorSubject<unknown>(null));
    expect(seen).toEqual([false]);
    stop();
  });

  it("says so the moment a session is minted", () => {
    const a = account();
    const active$ = new BehaviorSubject<unknown>(a.account);
    const { seen, stop } = watch(active$);
    expect(seen).toEqual([false]);

    a.account.metadata = { ...a.account.metadata, session: { token: "t", isAdmin: false } };
    a.touch();

    expect(seen).toEqual([false, true]);
    stop();
  });

  it("says so when it is taken away again", () => {
    const a = account({ token: "t", isAdmin: false });
    const { seen, stop } = watch(new BehaviorSubject<unknown>(a.account));
    expect(seen).toEqual([true]);

    a.account.metadata = { remembered: true };
    a.touch();

    expect(seen).toEqual([true, false]);
    stop();
  });

  it("does not repeat itself for unrelated metadata writes", () => {
    const a = account({ token: "t", isAdmin: false });
    const { seen, stop } = watch(new BehaviorSubject<unknown>(a.account));

    a.touch();
    a.touch();

    expect(seen).toEqual([true]);
    stop();
  });
});
