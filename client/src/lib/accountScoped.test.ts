// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BehaviorSubject } from "rxjs";
import {
  __resetAccountScoped,
  followActive,
  onAccountChange,
  onViewerChange,
  perspectiveChanged,
} from "./accountScoped";

beforeEach(() => __resetAccountScoped());

describe("account-scoped caches", () => {
  it("reset when the Active Account changes to another pubkey, or to none — not on a repeat", () => {
    const reset = vi.fn();
    onAccountChange(reset);
    const active$ = new BehaviorSubject<{ pubkey: string } | undefined>({ pubkey: "a" });
    const stop = followActive(active$);
    expect(reset).not.toHaveBeenCalled();
    active$.next({ pubkey: "A" });
    expect(reset).not.toHaveBeenCalled();
    active$.next({ pubkey: "b" });
    active$.next(undefined);
    expect(reset).toHaveBeenCalledTimes(2);
    stop();
  });

  it("a viewer-scoped cache resets on a Perspective switch too; an account-scoped one doesn't", () => {
    const account = vi.fn();
    const viewer = vi.fn();
    onAccountChange(account);
    const off = onViewerChange(viewer);
    perspectiveChanged();
    expect(viewer).toHaveBeenCalledTimes(1);
    expect(account).not.toHaveBeenCalled();
    off();
    perspectiveChanged();
    expect(viewer).toHaveBeenCalledTimes(1);
  });
});
