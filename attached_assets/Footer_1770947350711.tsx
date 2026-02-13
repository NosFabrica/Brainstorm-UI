import { motion } from 'framer-motion';
import { useLocation } from 'wouter';
import { Info, Sparkles, ChevronRight } from 'lucide-react';

export function Footer() {
  const [, setLocation] = useLocation();

  return (
    <motion.footer 
      className="relative z-20 w-screen mt-auto bg-slate-950"
      data-footer-dark="true"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.6 }}
      style={{ marginLeft: 'calc(50% - 50vw)', paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 24px)' }}
    >
      <div className="w-full px-6 pb-6 pt-4 sm:px-8">
        {/* Desktop Footer */}
        <div className="hidden sm:block">
          <div className="h-px bg-gradient-to-r from-transparent via-slate-700/50 to-transparent mb-5" />
          
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-5 text-xs text-slate-500">
              <motion.a 
                href="https://nosfabrica.com/" 
                target="_blank" 
                rel="noopener noreferrer"
                className="group"
                data-testid="link-nosfabrica"
                whileHover={{ y: -8, scale: 1.15 }}
                transition={{ type: "spring", stiffness: 400, damping: 20 }}
              >
                <img 
                  src="/nosfabrica-logo.png" 
                  alt="Nosfabrica" 
                  className="h-6 w-auto rounded opacity-60 group-hover:opacity-100 transition-all duration-300 group-hover:drop-shadow-[0_0_12px_rgba(255,255,255,0.5)]"
                />
              </motion.a>
              
              <div className="w-px h-4 bg-slate-700/50" />
              
              <motion.a 
                href="https://nostr.how/en/what-is-nostr" 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-[10px] text-slate-500 group cursor-pointer"
                whileHover={{ y: -8, scale: 1.15, zIndex: 50 }}
                transition={{ type: "spring", stiffness: 400, damping: 20 }}
              >
                <img src="/nostr-ostrich.gif" alt="Nostr" className="h-6 w-auto group-hover:h-8 transition-all duration-200" />
                <span className="text-slate-400 group-hover:text-violet-400 group-hover:font-medium transition-all duration-200">Built on Nostr</span>
              </motion.a>
              
              <div className="w-px h-4 bg-slate-700/50" />
              
              <motion.span 
                className="text-[10px] text-slate-600 font-mono cursor-default hover:text-slate-300 transition-colors duration-300"
                whileHover={{ textShadow: ["0 0 4px rgba(255,255,255,0.3)", "0 0 8px rgba(255,255,255,0.5)", "0 0 4px rgba(255,255,255,0.3)"] }}
                transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
              >v0.1.0-alpha</motion.span>
            </div>
            
            <div className="flex items-center gap-4">
              <motion.div 
                className="flex items-center gap-1.5 text-[10px] text-slate-500 cursor-default hover:text-slate-300 transition-colors duration-300"
                whileHover={{ textShadow: ["0 0 4px rgba(255,255,255,0.3)", "0 0 8px rgba(255,255,255,0.5)", "0 0 4px rgba(255,255,255,0.3)"] }}
                transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
              >
                <div className="w-1.5 h-1.5 rounded-full bg-violet-500 animate-pulse" />
                <span>Clarity in a fragmented world</span>
              </motion.div>
              
              <div className="w-px h-4 bg-slate-700/50" />
              
              <motion.button 
                className="relative text-indigo-400 hover:text-white text-sm font-medium flex items-center gap-2 transition-colors group overflow-visible"
                onClick={() => setLocation('/what-is-wot')}
                data-testid="button-learn-more"
                whileHover={{ scale: 1.05 }}
                transition={{ type: "spring", stiffness: 400, damping: 20 }}
              >
                <motion.div className="absolute -inset-3 rounded-xl bg-gradient-to-r from-indigo-500/20 via-violet-500/20 to-purple-500/20 opacity-0 group-hover:opacity-100 blur-md transition-opacity duration-300" />
                <motion.div className="absolute -inset-2 rounded-lg border border-indigo-500/0 group-hover:border-indigo-500/40 transition-all duration-300" />
                <Info className="h-3.5 w-3.5 relative z-10 group-hover:rotate-12 transition-transform duration-300" />
                <span className="relative z-10">What is Web of Trust?</span>
                <motion.span className="absolute -right-1 -top-1 opacity-0 group-hover:opacity-100 transition-opacity duration-300" initial={{ scale: 0 }} whileHover={{ scale: 1 }}>
                  <Sparkles className="h-3 w-3 text-violet-400" />
                </motion.span>
              </motion.button>
              
              <div className="w-px h-4 bg-slate-700/50" />
              
              <motion.a 
                href="https://megistus.xyz/" 
                target="_blank" 
                rel="noopener noreferrer"
                className="group relative"
                data-testid="link-megistus"
                whileHover={{ y: -8, scale: 1.15 }}
                transition={{ type: "spring", stiffness: 400, damping: 20 }}
              >
                {/* Sparkle burst effect */}
                <div className="absolute inset-0 pointer-events-none overflow-visible opacity-0 group-hover:opacity-100">
                  {/* Center shooting line */}
                  <motion.div 
                    className="absolute left-1/2 -translate-x-1/2 bottom-1/2 w-0.5 bg-gradient-to-t from-white via-white to-transparent"
                    initial={{ height: 0, opacity: 0 }}
                    whileHover={{ height: 40, opacity: [0, 1, 0] }}
                    transition={{ duration: 0.5, ease: "easeOut" }}
                  />
                  {/* Left diagonal line */}
                  <motion.div 
                    className="absolute left-1/4 bottom-1/2 w-0.5 bg-gradient-to-t from-white/80 via-white/60 to-transparent origin-bottom -rotate-[25deg]"
                    initial={{ height: 0, opacity: 0 }}
                    whileHover={{ height: 30, opacity: [0, 1, 0] }}
                    transition={{ duration: 0.45, delay: 0.05, ease: "easeOut" }}
                  />
                  {/* Right diagonal line */}
                  <motion.div 
                    className="absolute right-1/4 bottom-1/2 w-0.5 bg-gradient-to-t from-white/80 via-white/60 to-transparent origin-bottom rotate-[25deg]"
                    initial={{ height: 0, opacity: 0 }}
                    whileHover={{ height: 30, opacity: [0, 1, 0] }}
                    transition={{ duration: 0.45, delay: 0.05, ease: "easeOut" }}
                  />
                  {/* Sparkle dots */}
                  {[
                    { x: '50%', y: -35, delay: 0.2, size: 'w-1.5 h-1.5' },
                    { x: '25%', y: -25, delay: 0.25, size: 'w-1 h-1' },
                    { x: '75%', y: -25, delay: 0.25, size: 'w-1 h-1' },
                    { x: '15%', y: -15, delay: 0.15, size: 'w-0.5 h-0.5' },
                    { x: '85%', y: -15, delay: 0.15, size: 'w-0.5 h-0.5' },
                    { x: '40%', y: -30, delay: 0.3, size: 'w-0.5 h-0.5' },
                    { x: '60%', y: -30, delay: 0.3, size: 'w-0.5 h-0.5' },
                  ].map((spark, i) => (
                    <motion.div
                      key={i}
                      className={`absolute ${spark.size} rounded-full bg-white shadow-[0_0_6px_2px_rgba(255,255,255,0.8)]`}
                      style={{ left: spark.x, bottom: '50%' }}
                      initial={{ y: 0, opacity: 0, scale: 0 }}
                      whileHover={{ y: spark.y, opacity: [0, 1, 1, 0], scale: [0, 1.5, 1, 0] }}
                      transition={{ duration: 0.6, delay: spark.delay, ease: "easeOut" }}
                    />
                  ))}
                  {/* Outer ring burst */}
                  <motion.div 
                    className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 rounded-full border border-white/40"
                    initial={{ scale: 0.5, opacity: 0 }}
                    whileHover={{ scale: 2, opacity: [0, 0.6, 0] }}
                    transition={{ duration: 0.5, ease: "easeOut" }}
                  />
                </div>
                <img 
                  src="/megistus-icon-white.png" 
                  alt="Megistus" 
                  className="h-10 w-auto opacity-60 group-hover:opacity-100 transition-all duration-300 group-hover:drop-shadow-[0_0_20px_rgba(255,255,255,0.8)] group-hover:brightness-125 relative z-10"
                />
              </motion.a>
            </div>
          </div>
        </div>
        
        {/* Mobile Footer - Clean stacked layout */}
        <div className="sm:hidden">
          <div className="h-px bg-gradient-to-r from-transparent via-slate-700/50 to-transparent mb-6" />
          
          {/* What is Web of Trust - Featured at top */}
          <motion.button 
            className="w-full mb-6 py-3 px-4 bg-gradient-to-r from-indigo-500/10 via-violet-500/10 to-purple-500/10 border border-indigo-500/30 rounded-xl flex items-center justify-center gap-3 group"
            onClick={() => setLocation('/what-is-wot')}
            data-testid="button-learn-more-mobile"
            whileTap={{ scale: 0.98 }}
          >
            <Info className="h-4 w-4 text-indigo-400" />
            <span className="text-sm font-medium text-indigo-300">What is Web of Trust?</span>
            <ChevronRight className="h-4 w-4 text-indigo-400/60" />
          </motion.button>
          
          {/* Partner logos row - 3 items */}
          <div className="flex items-center justify-center gap-5 mb-4">
            <motion.a 
              href="https://nosfabrica.com/" 
              target="_blank" 
              rel="noopener noreferrer"
              className="opacity-50 hover:opacity-100 transition-opacity"
              data-testid="link-nosfabrica-mobile"
              whileTap={{ scale: 0.95 }}
            >
              <img src="/nosfabrica-logo.png" alt="Nosfabrica" className="h-5 w-auto rounded" />
            </motion.a>
            
            <div className="w-px h-5 bg-slate-700/30" />
            
            <motion.a 
              href="https://nostr.how/en/what-is-nostr" 
              target="_blank" 
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 opacity-50 hover:opacity-100 transition-opacity"
              whileTap={{ scale: 0.95 }}
            >
              <img src="/nostr-ostrich.gif" alt="Nostr" className="h-5 w-auto" />
              <span className="text-[10px] text-slate-400">Nostr</span>
            </motion.a>
            
            <div className="w-px h-5 bg-slate-700/30" />
            
            <motion.a 
              href="https://megistus.xyz/" 
              target="_blank" 
              rel="noopener noreferrer"
              className="opacity-50 hover:opacity-100 transition-opacity"
              data-testid="link-megistus-mobile"
              whileTap={{ scale: 0.95 }}
            >
              <img src="/megistus-icon-white.png" alt="Megistus" className="h-8 w-auto" />
            </motion.a>
          </div>
          
          {/* Version */}
          <div className="text-center mt-1">
            <span className="text-[9px] text-slate-700 font-mono">v0.1.0-beta</span>
          </div>
        </div>
      </div>
    </motion.footer>
  );
}
