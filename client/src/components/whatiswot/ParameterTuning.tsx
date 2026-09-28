import { useState } from "react";
import { motion } from "framer-motion";

export function ParameterTuning() {
  const [attenuation, setAttenuation] = useState(0.8);
  const [hops, setHops] = useState(3);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      className="mb-16"
    >
      <div className="mb-8 text-center">
        <h2 className="mb-2 text-2xl font-bold text-white" style={{ fontFamily: "var(--font-display)" }}>
          Interactive Parameter Tuning
        </h2>
        <p className="text-sm text-slate-400">See how different settings affect trust propagation</p>
      </div>

      <div
        className="relative mx-auto max-w-3xl overflow-hidden rounded-2xl border border-brand-primary/[0.4] bg-gradient-to-br from-brand-primary/15 via-slate-900/95 to-brand-accent/15 p-6 backdrop-blur-md"
        style={{
          boxShadow:
            "0 12px 48px rgb(var(--brand-primary)/0.25), 0 24px 80px rgba(139, 92, 246, 0.15), 0 0 0 1px rgb(var(--brand-primary)/0.12), inset 0 1px 0 rgba(255, 255, 255, 0.07)",
        }}
      >
        {/* Background effects */}
        <div className="absolute inset-0 bg-gradient-to-br from-slate-950/80 via-slate-950/60 to-slate-950/80" />
        <motion.div
          className="pointer-events-none absolute -right-20 -top-20 h-48 w-48 rounded-full bg-gradient-to-br from-emerald-500/20 to-cyan-500/15 blur-3xl"
          animate={{ opacity: [0.3, 0.5, 0.3], scale: [1, 1.15, 1] }}
          transition={{ duration: 5, repeat: Infinity }}
        />
        <motion.div
          className="pointer-events-none absolute -bottom-16 -left-16 h-40 w-40 rounded-full bg-gradient-to-br from-brand-accent/15 to-brand-primary/20 blur-3xl"
          animate={{ opacity: [0.3, 0.5, 0.3], scale: [1.1, 1, 1.1] }}
          transition={{ duration: 5, repeat: Infinity, delay: 2.5 }}
        />

        {/* Top accent */}
        <motion.div
          className="absolute left-1/2 top-0 h-1 w-32 -translate-x-1/2 rounded-full bg-gradient-to-r from-transparent via-emerald-500 to-transparent"
          animate={{ opacity: [0.4, 0.8, 0.4] }}
          transition={{ duration: 2, repeat: Infinity }}
        />

        {/* Computation grid */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(16, 185, 129, 0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(16, 185, 129, 0.5) 1px, transparent 1px)",
            backgroundSize: "24px 24px",
          }}
        />

        <div className="relative z-10">
          {/* Brief smart explanation - dynamic */}
          <div className="mb-5 text-center">
            <p className="mx-auto max-w-md text-[11px] leading-relaxed text-slate-400">
              Trust decays exponentially: each hop multiplies by <span className="font-mono text-emerald-400">α</span>.
              At <span className="font-mono text-emerald-400">α={attenuation.toFixed(2)}</span> over{" "}
              <span className="font-mono text-brand-accent">
                {hops} hop{hops > 1 ? "s" : ""}
              </span>
              ,{hops === 1 ? " a direct friend" : hops === 2 ? " a friend-of-friend" : ` a ${hops}-hop connection`}{" "}
              contributes{" "}
              <motion.span
                className="font-mono text-brand-primary"
                key={`${attenuation}-${hops}`}
                initial={{ opacity: 0.5 }}
                animate={{ opacity: 1 }}
              >
                {Math.round(Math.pow(attenuation, hops) * 100)}%
              </motion.span>{" "}
              of direct trust.
            </p>
          </div>

          {/* Compact controls row */}
          <div className="mb-6 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-6">
            {/* Attenuation control */}
            <div
              className="flex items-center justify-between gap-3 rounded-xl border border-slate-700/40 bg-slate-950/25 px-3 py-2 sm:justify-start"
              data-testid="control-attenuation"
            >
              <div className="flex shrink-0 items-center gap-2">
                <span className="font-mono text-[10px] text-slate-500">α =</span>
                <motion.span
                  className="font-mono text-lg font-bold text-emerald-400"
                  key={attenuation}
                  initial={{ scale: 1.2, color: "#34d399" }}
                  animate={{ scale: 1, color: "#34d399" }}
                >
                  {attenuation.toFixed(2)}
                </motion.span>
              </div>
              <input
                type="range"
                min="0.5"
                max="0.95"
                step="0.05"
                value={attenuation}
                onChange={(e) => setAttenuation(parseFloat(e.target.value))}
                className="h-2 w-40 cursor-pointer appearance-none rounded-lg bg-slate-700/70 accent-emerald-500 sm:w-24"
                data-testid="range-attenuation"
              />
            </div>

            {/* Hops control */}
            <div
              className="flex items-center justify-between gap-3 rounded-xl border border-slate-700/40 bg-slate-950/25 px-3 py-2 sm:justify-start"
              data-testid="control-hops"
            >
              <div className="flex shrink-0 items-center gap-2">
                <span className="font-mono text-[10px] text-slate-500">d =</span>
                <motion.span
                  className="font-mono text-lg font-bold text-brand-accent"
                  key={hops}
                  initial={{ scale: 1.2 }}
                  animate={{ scale: 1 }}
                >
                  {hops}
                </motion.span>
              </div>
              <input
                type="range"
                min="1"
                max="5"
                step="1"
                value={hops}
                onChange={(e) => setHops(parseInt(e.target.value))}
                className="h-2 w-40 cursor-pointer appearance-none rounded-lg bg-slate-700/70 accent-brand-accent sm:w-20"
                data-testid="range-hops"
              />
            </div>
          </div>

          {/* Visual decay chain */}
          <div className="mb-5 flex flex-wrap items-center justify-center gap-1">
            {Array.from({ length: hops + 1 }, (_, i) => {
              const score = Math.pow(attenuation, i);
              const size = 32 + (1 - i / Math.max(hops, 1)) * 10;
              return (
                <div key={i} className="flex shrink-0 items-center">
                  <motion.div
                    className="flex flex-col items-center"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: i * 0.08 }}
                  >
                    <motion.div
                      className="relative flex items-center justify-center overflow-hidden rounded-full border-2 font-mono text-[10px] font-bold"
                      style={{
                        width: size,
                        height: size,
                        borderColor: i === 0 ? "rgba(52, 211, 153, 0.6)" : `rgba(139, 92, 246, ${0.6 - i * 0.1})`,
                        background:
                          i === 0
                            ? "linear-gradient(135deg, rgba(52, 211, 153, 0.2), rgba(16, 185, 129, 0.1))"
                            : `linear-gradient(135deg, rgba(139, 92, 246, ${0.2 - i * 0.03}), rgb(var(--brand-primary)/${0.1 - i * 0.02}))`,
                      }}
                      animate={{
                        boxShadow:
                          i === 0
                            ? [
                                "0 0 12px rgba(52, 211, 153, 0.3)",
                                "0 0 20px rgba(52, 211, 153, 0.5)",
                                "0 0 12px rgba(52, 211, 153, 0.3)",
                              ]
                            : undefined,
                      }}
                      transition={{ duration: 2, repeat: Infinity }}
                    >
                      <span className={i === 0 ? "text-emerald-400" : "text-brand-accent"}>{score.toFixed(2)}</span>
                    </motion.div>
                    <span className="mt-1 text-[8px] text-slate-500">{i === 0 ? "you" : `h${i}`}</span>
                  </motion.div>
                  {i < hops && (
                    <motion.div
                      className="mx-1 flex items-center"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: i * 0.08 + 0.05 }}
                    >
                      <motion.div
                        className="h-px w-4 bg-gradient-to-r from-brand-accent/60 to-brand-accent/[0.3]"
                        animate={{ opacity: [0.4, 0.8, 0.4] }}
                        transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.2 }}
                      />
                      <span className="mx-0.5 text-[8px] text-slate-600">×α</span>
                      <motion.div
                        className="h-px w-4 bg-gradient-to-r from-brand-accent/[0.3] to-brand-accent/60"
                        animate={{ opacity: [0.4, 0.8, 0.4] }}
                        transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.2 + 0.3 }}
                      />
                    </motion.div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Compact stats row */}
          <div className="grid grid-cols-1 gap-2 border-t border-slate-700/40 pt-4 sm:flex sm:items-center sm:justify-center sm:gap-4">
            <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-700/30 bg-slate-800/50 px-3 py-2 sm:justify-start">
              <span className="text-[9px] text-slate-500">T(u) at d={hops}</span>
              <motion.span
                className="font-mono text-sm font-bold text-brand-primary"
                key={`${attenuation}-${hops}`}
                initial={{ color: "#7237ff" }}
                animate={{ color: "#a5b4fc" }}
                transition={{ duration: 0.3 }}
              >
                {Math.pow(attenuation, hops).toFixed(4)}
              </motion.span>
            </div>

            <div className="hidden h-4 w-px bg-slate-700/50 sm:block" />

            <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-700/30 bg-slate-800/50 px-3 py-2 sm:justify-start">
              <span className="text-[9px] text-slate-500">reach</span>
              <span className="font-mono text-sm text-amber-400/80">~{Math.pow(150, hops).toLocaleString()}</span>
            </div>

            <div className="hidden h-4 w-px bg-slate-700/50 sm:block" />

            <div className="flex items-center justify-between gap-2 overflow-x-auto rounded-lg border border-slate-700/30 bg-slate-800/50 px-3 py-2 sm:justify-start">
              <span className="shrink-0 text-[9px] text-slate-500">formula</span>
              <span className="whitespace-nowrap font-mono text-[10px] text-slate-300">
                α<sup>d</sup> = {attenuation}
                <sup>{hops}</sup>
              </span>
            </div>
          </div>
        </div>

        {/* Bottom decorative element */}
        <motion.div
          className="absolute bottom-0 left-1/2 h-px w-24 -translate-x-1/2 bg-gradient-to-r from-transparent via-emerald-500/40 to-transparent"
          animate={{ opacity: [0.3, 0.6, 0.3] }}
          transition={{ duration: 2, repeat: Infinity }}
        />
      </div>
    </motion.div>
  );
}
