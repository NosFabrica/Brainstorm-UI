/**
 * framer-motion for the app's fades, slides and pulses: `m` components under
 * `<Motion>`, which loads only the DOM animation features (animate, exit,
 * hover and tap, keyframes), not the whole of `motion` — layout animation and
 * drag stay out of the pages that never use them. `strict`, so a full
 * `motion.*` slipped in under it throws in development instead of quietly
 * bringing the rest back. Drag-to-reorder (ProfileCustomizer's Reorder) still
 * uses the full package, in its own lazy chunk.
 */
import type { ReactNode } from "react";
import { LazyMotion, domAnimation } from "framer-motion";

export { m, AnimatePresence } from "framer-motion";

export function Motion({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={domAnimation} strict>
      {children}
    </LazyMotion>
  );
}
