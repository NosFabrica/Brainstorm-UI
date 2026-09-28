import { motion, AnimatePresence } from "framer-motion";
import type { UserMode } from "./data";

export function WotHero({ mode }: { mode: UserMode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-10 text-center sm:mb-16">
      <h1 className="font-brand mb-4 bg-gradient-to-r from-white via-brand-primary to-brand-primary bg-clip-text text-3xl font-bold text-transparent sm:mb-6 sm:text-4xl md:text-5xl">
        What is Web of Trust?
      </h1>

      <AnimatePresence mode="wait">
        <motion.div
          key={`subtitle-${mode}`}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="mx-auto max-w-3xl"
        >
          {mode === "normal" ? (
            <p className="mx-auto max-w-2xl px-2 text-base leading-relaxed text-slate-400 sm:text-lg">
              Your social connections become a <span className="font-medium text-brand-primary">powerful signal</span>.
              Trust propagates through your network to build authentic communities, surface quality content, keep you
              safe and filter through the mess — <span className="text-white">all controlled by you.</span>
            </p>
          ) : (
            <p className="mx-auto max-w-2xl px-2 text-base leading-relaxed text-slate-400 sm:text-lg">
              A <span className="font-medium text-brand-primary">distributed, subjective reputation system</span> using
              graph traversal. Compute personalized trust scores via multi-hop propagation with configurable parameters.{" "}
              <span className="text-white">Open source. User-sovereign. No central authority.</span>
            </p>
          )}
        </motion.div>
      </AnimatePresence>
    </motion.div>
  );
}
