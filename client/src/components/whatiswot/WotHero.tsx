import { motion, AnimatePresence } from 'framer-motion';
import type { UserMode } from './data';

export function WotHero({ mode }: { mode: UserMode }) {
  return (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-10 sm:mb-16"
          >
            <h1 
              className="text-3xl sm:text-4xl md:text-5xl font-bold mb-4 sm:mb-6 bg-gradient-to-r from-white via-indigo-200 to-violet-300 bg-clip-text text-transparent"
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}
            >
              What is Web of Trust?
            </h1>
            
            <AnimatePresence mode="wait">
              <motion.div
                key={`subtitle-${mode}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="max-w-3xl mx-auto"
              >
                {mode === 'normal' ? (
                  <p className="text-base sm:text-lg text-slate-400 leading-relaxed max-w-2xl mx-auto px-2">
                    Your social connections become a <span className="text-indigo-400 font-medium">powerful signal</span>. Trust propagates through your network to build authentic communities, surface quality content, keep you safe and filter through the mess — <span className="text-white">all controlled by you.</span>
                  </p>
                ) : (
                  <p className="text-base sm:text-lg text-slate-400 leading-relaxed max-w-2xl mx-auto px-2">
                    A <span className="text-indigo-400 font-medium">distributed, subjective reputation system</span> using graph traversal. Compute personalized trust scores via multi-hop propagation with configurable parameters. <span className="text-white">Open source. User-sovereign. No central authority.</span>
                  </p>
                )}
              </motion.div>
            </AnimatePresence>
          </motion.div>
  );
}
