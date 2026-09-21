import { vi } from "vitest";
import { act } from "@testing-library/react";

/**
 * An IntersectionObserver a test moves by hand: nothing is visible until the
 * test says so. For "far, then near" behaviour that `visibleIntersectionObserver`
 * (visible the moment it's observed) can't show.
 */
export function stubControllableIntersectionObserver() {
  const observers: ControllableObserver[] = [];

  class ControllableObserver {
    readonly observed = new Set<Element>();
    constructor(
      private readonly cb: IntersectionObserverCallback,
      readonly options?: IntersectionObserverInit,
    ) {
      observers.push(this);
    }
    observe(el: Element) {
      this.observed.add(el);
    }
    unobserve(el: Element) {
      this.observed.delete(el);
    }
    disconnect() {
      this.observed.clear();
    }
    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }
    report(el: Element, isIntersecting: boolean) {
      act(() => {
        this.cb([{ target: el, isIntersecting } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
      });
    }
  }

  vi.stubGlobal("IntersectionObserver", ControllableObserver);
  return {
    observers,
    /** Everything currently observed comes into view. */
    bringAllIntoView() {
      for (const o of observers) for (const el of [...o.observed]) o.report(el, true);
    },
  };
}
