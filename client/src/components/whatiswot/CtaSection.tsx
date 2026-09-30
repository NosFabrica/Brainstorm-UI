import { motion } from "framer-motion";
import { NetworkWebIcon } from "@/components/WotIcons";
import networkBg from "@assets/generated_images/abstract_network_web_background.png";
import type { UserMode } from "./data";

interface CtaSectionProps {
  mode: UserMode;
  setLocation: (path: string) => void;
}

export function CtaSection({ mode, setLocation }: CtaSectionProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.5 }}
      className="mx-auto max-w-3xl"
    >
      <motion.div
        className="relative overflow-hidden rounded-2xl border border-brand-primary/[0.5] bg-gradient-to-br from-brand-primary/20 via-slate-900/95 to-brand-accent/20 p-6 backdrop-blur-xl"
        initial={{
          boxShadow:
            "0 8px 40px rgb(var(--brand-primary)/0.3), 0 16px 80px rgba(139, 92, 246, 0.2), 0 0 0 1px rgb(var(--brand-primary)/0.15), inset 0 1px 0 rgba(255, 255, 255, 0.08)",
        }}
        animate={{
          boxShadow: [
            "0 8px 40px rgb(var(--brand-primary)/0.3), 0 16px 80px rgba(139, 92, 246, 0.2), 0 0 0 1px rgb(var(--brand-primary)/0.15), inset 0 1px 0 rgba(255, 255, 255, 0.08)",
            "0 12px 60px rgb(var(--brand-primary)/0.4), 0 24px 100px rgba(139, 92, 246, 0.28), 0 0 0 1px rgb(var(--brand-primary)/0.2), inset 0 1px 0 rgba(255, 255, 255, 0.1)",
            "0 8px 40px rgb(var(--brand-primary)/0.3), 0 16px 80px rgba(139, 92, 246, 0.2), 0 0 0 1px rgb(var(--brand-primary)/0.15), inset 0 1px 0 rgba(255, 255, 255, 0.08)",
          ],
        }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
        whileHover={{
          y: -4,
          boxShadow:
            "0 20px 80px rgb(var(--brand-primary)/0.5), 0 40px 120px rgba(139, 92, 246, 0.35), 0 0 0 1px rgb(var(--brand-primary)/0.3), inset 0 1px 0 rgba(255, 255, 255, 0.12)",
        }}
      >
        {/* Network background */}
        <div
          className="absolute inset-0 opacity-25"
          style={{
            backgroundImage: `url(${networkBg})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-br from-slate-950/70 via-slate-950/50 to-slate-950/70" />

        {/* Extra glow orbs */}
        <motion.div
          className="absolute -left-10 -top-10 h-40 w-40 rounded-full bg-brand-primary/20 blur-3xl"
          animate={{ opacity: [0.3, 0.6, 0.3], scale: [1, 1.2, 1] }}
          transition={{ duration: 4, repeat: Infinity }}
        />
        <motion.div
          className="absolute -bottom-10 -right-10 h-40 w-40 rounded-full bg-brand-accent/20 blur-3xl"
          animate={{ opacity: [0.3, 0.6, 0.3], scale: [1.2, 1, 1.2] }}
          transition={{ duration: 4, repeat: Infinity, delay: 2 }}
        />

        {/* Top glow line */}
        <motion.div
          className="absolute left-1/2 top-0 h-1 w-48 -translate-x-1/2 rounded-full bg-gradient-to-r from-transparent via-brand-primary to-transparent"
          animate={{ opacity: [0.4, 0.9, 0.4] }}
          transition={{ duration: 2, repeat: Infinity }}
        />

        {/* Shooting stars - diagonal, coming down from different angles */}
        {[
          { startX: "10%", startY: "-5%", angle: 35, delay: 0 },
          { startX: "60%", startY: "-5%", angle: 45, delay: 4 },
          { startX: "30%", startY: "-5%", angle: 25, delay: 8 },
          { startX: "80%", startY: "-5%", angle: 55, delay: 12 },
        ].map((star, i) => (
          <motion.div
            key={`shooting-star-${i}`}
            className="pointer-events-none absolute h-px w-20"
            style={{
              background:
                "linear-gradient(90deg, transparent, rgba(255,255,255,0.7), rgba(200,200,255,0.4), transparent)",
              left: star.startX,
              top: star.startY,
              transform: `rotate(${star.angle}deg)`,
              transformOrigin: "left center",
            }}
            initial={{ x: 0, y: 0, opacity: 0 }}
            animate={{
              x: [0, 300],
              y: [0, 250],
              opacity: [0, 0.8, 0.6, 0],
            }}
            transition={{
              duration: 4,
              repeat: Infinity,
              repeatDelay: 10 + i * 2,
              delay: star.delay,
              ease: "linear",
            }}
          />
        ))}

        {/* Twinkling stars */}
        <svg className="pointer-events-none absolute inset-0 h-full w-full" style={{ opacity: 0.8 }}>
          {Array.from({ length: 20 }, (_, i) => (
            <motion.circle
              key={`cta-star-${i}`}
              cx={`${8 + Math.random() * 84}%`}
              cy={`${10 + Math.random() * 80}%`}
              r={Math.random() * 1.2 + 0.5}
              fill="white"
              initial={{ opacity: 0.2 }}
              animate={{ opacity: [0.2, 0.9, 0.2] }}
              transition={{ duration: Math.random() * 2 + 1.5, repeat: Infinity, delay: Math.random() * 2 }}
            />
          ))}
        </svg>

        <motion.div
          className="absolute left-1/2 top-1/2 h-40 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{ background: "radial-gradient(circle, rgb(var(--brand-primary)/0.2) 0%, transparent 70%)" }}
          animate={{ scale: [1, 1.4, 1], opacity: [0.4, 0.7, 0.4] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute left-1/2 top-1/2 h-56 w-56 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{ background: "radial-gradient(circle, rgba(139,92,246,0.15) 0%, transparent 70%)" }}
          animate={{ scale: [1.2, 1, 1.2], opacity: [0.3, 0.5, 0.3] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut", delay: 1.5 }}
        />

        <div className="relative z-10 text-center">
          <h2 className="mb-2 text-xl font-bold text-white" style={{ fontFamily: "var(--font-display)" }}>
            Ready to explore your trust network?
          </h2>
          <p className="mx-auto mb-4 max-w-md text-xs text-slate-400">
            {mode === "normal"
              ? "See who your network trusts and discover new connections"
              : "Compute your personalized trust scores with full parameter control"}
          </p>
          <motion.button
            onClick={() => setLocation("/dashboard")}
            className="inline-flex items-center gap-2 rounded-lg border border-brand-primary/[0.4] px-5 py-2 text-sm font-medium text-brand-primary transition-all hover:border-brand-primary/60 hover:bg-brand-primary/10 hover:text-white"
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
            data-testid="button-get-started"
          >
            Get Started
            <NetworkWebIcon className="h-3.5 w-3.5" />
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
}
