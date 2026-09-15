import { useEffect, useState, type RefObject } from "react";

type SharedObserver = {
  io: IntersectionObserver;
  ctor: typeof IntersectionObserver;
  waiting: Map<Element, () => void>;
};

/** One observer per margin, however many elements are waiting on it. */
const shared = new Map<string, SharedObserver>();

function watch(el: Element, rootMargin: string, onNear: () => void): () => void {
  let observer = shared.get(rootMargin);
  // Tests swap the global IntersectionObserver without resetting this module.
  if (observer && observer.ctor !== IntersectionObserver) {
    observer.io.disconnect();
    observer = undefined;
  }
  if (!observer) {
    const waiting = new Map<Element, () => void>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const near = waiting.get(entry.target);
          unwatch(entry.target, rootMargin);
          near?.();
        }
      },
      { rootMargin },
    );
    observer = { io, ctor: IntersectionObserver, waiting };
    shared.set(rootMargin, observer);
  }
  observer.waiting.set(el, onNear);
  observer.io.observe(el);
  return () => unwatch(el, rootMargin);
}

function unwatch(el: Element, rootMargin: string): void {
  const observer = shared.get(rootMargin);
  if (!observer || !observer.waiting.delete(el)) return;
  observer.io.unobserve(el);
}

/**
 * Whether `ref`'s element has come within `rootMargin` of the viewport. Latches:
 * once near, it stays near. No IntersectionObserver means near straight away.
 */
export function useNearViewport(ref: RefObject<Element | null>, rootMargin: string): boolean {
  const [near, setNear] = useState(() => typeof IntersectionObserver === "undefined");
  useEffect(() => {
    const el = ref.current;
    if (near || !el) return;
    return watch(el, rootMargin, () => setNear(true));
  }, [near, ref, rootMargin]);
  return near;
}

/** Test seam. */
export function __resetNearViewport(): void {
  for (const observer of shared.values()) observer.io.disconnect();
  shared.clear();
}
