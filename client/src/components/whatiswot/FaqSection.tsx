import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { BrainLogo } from "@/components/BrainLogo";
import networkBg from "@assets/generated_images/abstract_network_web_background.png";
import { faqs, type UserMode } from "./data";

export function FaqSection({ mode }: { mode: UserMode }) {
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);
  const [faqExpanded, setFaqExpanded] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4 }}
      className="relative mb-16"
    >
      {/* FAQ container - matching "You Are In Control" style */}
      <div
        className="relative mx-auto max-w-3xl overflow-hidden rounded-2xl border border-brand-primary/[0.4] bg-gradient-to-br from-brand-primary/15 via-slate-900/95 to-brand-accent/15 p-6 backdrop-blur-md"
        style={{
          boxShadow:
            "0 12px 48px rgb(var(--brand-primary)/0.25), 0 24px 80px rgba(139, 92, 246, 0.15), 0 0 0 1px rgb(var(--brand-primary)/0.12), inset 0 1px 0 rgba(255, 255, 255, 0.07)",
        }}
      >
        {/* Network background */}
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage: `url(${networkBg})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-br from-slate-950/80 via-slate-950/60 to-slate-950/80" />
        <motion.div
          className="absolute left-1/2 top-0 h-1 w-32 -translate-x-1/2 rounded-full bg-gradient-to-r from-transparent via-brand-primary to-transparent"
          animate={{ opacity: [0.3, 0.7, 0.3] }}
          transition={{ duration: 2, repeat: Infinity }}
        />

        {/* Header */}
        <div className="relative z-10 mb-8 text-center">
          <h2
            className="mb-3 bg-gradient-to-r from-white via-brand-primary to-brand-accent bg-clip-text text-2xl font-bold text-transparent"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Frequently Asked Questions
          </h2>
          <p className="mx-auto max-w-xl text-sm text-slate-400">
            {mode === "normal"
              ? "Common concerns addressed honestly"
              : "Technical deep-dives on implementation considerations"}
          </p>
        </div>

        {/* FAQ Items with staggered animation */}
        <div className="relative z-10 mx-auto max-w-2xl space-y-3">
          {(faqExpanded ? faqs : faqs.slice(0, 4)).map((faq, i) => (
            <motion.div
              key={i}
              className={`relative overflow-hidden rounded-xl transition-all duration-300 ${
                expandedFaq === i
                  ? "border-2 border-brand-primary/[0.4] bg-gradient-to-br from-brand-primary/10 via-brand-accent/10 to-brand-primary/10"
                  : "border border-slate-700/50 bg-slate-800/40 hover:border-brand-primary/[0.3] hover:bg-slate-800/60"
              }`}
              initial={{ opacity: 0, x: i % 2 === 0 ? -20 : 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.4 + i * 0.08 }}
              style={{
                boxShadow:
                  expandedFaq === i
                    ? "0 4px 20px rgb(var(--brand-primary)/0.15), inset 0 1px 0 rgba(255,255,255,0.05)"
                    : "inset 0 1px 0 rgba(255,255,255,0.02)",
              }}
            >
              {/* Animated border glow when not expanded */}
              {expandedFaq !== i && (
                <motion.div
                  className="pointer-events-none absolute inset-0 rounded-xl"
                  animate={{
                    boxShadow: [
                      "inset 0 0 0 1px rgb(var(--brand-primary)/0)",
                      "inset 0 0 0 1px rgb(var(--brand-primary)/0.2)",
                      "inset 0 0 0 1px rgb(var(--brand-primary)/0)",
                    ],
                  }}
                  transition={{ duration: 3, repeat: Infinity, delay: i * 0.3 }}
                />
              )}

              {/* Top glow line when expanded */}
              {expandedFaq === i && (
                <motion.div
                  className="absolute left-1/4 right-1/4 top-0 h-px bg-gradient-to-r from-transparent via-brand-primary to-transparent"
                  initial={{ opacity: 0, scaleX: 0 }}
                  animate={{ opacity: 1, scaleX: 1 }}
                />
              )}

              <button
                onClick={() => setExpandedFaq(expandedFaq === i ? null : i)}
                className="group flex w-full items-center justify-between px-6 py-4 text-left"
                data-testid={`faq-${i}`}
              >
                <div className="flex items-center gap-3 pr-4">
                  <motion.div
                    className={`relative flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg transition-all ${
                      expandedFaq === i
                        ? "border border-brand-primary/60 bg-gradient-to-br from-brand-primary/[0.4] to-brand-accent/[0.4]"
                        : "border border-slate-600/50 bg-slate-700/50 group-hover:border-brand-primary/[0.3] group-hover:bg-brand-primary/20"
                    }`}
                    animate={
                      expandedFaq === i ? { rotateY: [0, 180, 360], scale: [1, 1.15, 1] } : { scale: [1, 1.05, 1] }
                    }
                    transition={
                      expandedFaq === i
                        ? { duration: 0.5, ease: "easeOut" }
                        : { duration: 2, repeat: Infinity, delay: i * 0.2 }
                    }
                    style={{ transformStyle: "preserve-3d" }}
                  >
                    {expandedFaq === i && (
                      <motion.div
                        className="pointer-events-none absolute inset-0 rounded-lg"
                        initial={{ scale: 1, opacity: 0.8 }}
                        animate={{ scale: 2, opacity: 0 }}
                        transition={{ duration: 0.6, ease: "easeOut" }}
                        style={{
                          background: "radial-gradient(circle, rgb(var(--brand-primary)/0.4) 0%, transparent 70%)",
                        }}
                      />
                    )}
                    <AnimatePresence mode="wait">
                      {expandedFaq === i ? (
                        <motion.div
                          key="brain-icon"
                          initial={{ opacity: 0, scale: 0.5 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.5 }}
                          transition={{ duration: 0.2, delay: 0.15 }}
                        >
                          <BrainLogo size={16} className="text-brand-primary" />
                        </motion.div>
                      ) : (
                        <motion.span
                          key="number"
                          initial={{ opacity: 0, scale: 0.5 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.5 }}
                          transition={{ duration: 0.2 }}
                          className="font-mono text-xs text-slate-400 group-hover:text-brand-primary"
                        >
                          {String(i + 1).padStart(2, "0")}
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </motion.div>
                  <span
                    className={`text-sm font-medium transition-colors ${expandedFaq === i ? "text-white" : "text-slate-200 group-hover:text-white"}`}
                  >
                    {faq.question}
                  </span>
                </div>
                <motion.div
                  animate={{ rotate: expandedFaq === i ? 180 : 0 }}
                  transition={{ duration: 0.3, type: "spring", stiffness: 300 }}
                  className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full transition-all ${
                    expandedFaq === i
                      ? "border border-brand-primary/[0.5] bg-brand-primary/[0.3]"
                      : "border border-slate-600/50 bg-slate-700/50 group-hover:bg-brand-primary/20"
                  }`}
                >
                  <ChevronDown
                    className={`h-3.5 w-3.5 ${expandedFaq === i ? "text-brand-primary" : "text-slate-400"}`}
                  />
                </motion.div>
              </button>
              <AnimatePresence>
                {expandedFaq === i && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3, ease: "easeOut" }}
                  >
                    <div className="px-6 pb-5">
                      <motion.div
                        className="relative pl-11"
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                      >
                        {/* Connecting line */}
                        <div className="absolute bottom-0 left-4 top-0 w-px bg-gradient-to-b from-brand-primary/[0.4] to-transparent" />

                        <p className="rounded-lg border border-slate-700/30 bg-slate-800/30 p-4 text-sm leading-relaxed text-slate-300">
                          {faq.answer[mode]}
                        </p>
                      </motion.div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}

          {/* Expand/Collapse button */}
          {faqs.length > 4 && (
            <motion.button
              onClick={() => setFaqExpanded(!faqExpanded)}
              className="group mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-slate-700/50 bg-slate-800/40 px-4 py-3 transition-all hover:border-brand-primary/[0.4] hover:bg-slate-800/60"
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              data-testid="button-faq-expand"
            >
              <span className="text-sm text-slate-300 transition-colors group-hover:text-white">
                {faqExpanded ? "Show less" : `Show ${faqs.length - 4} more questions`}
              </span>
              <motion.div animate={{ rotate: faqExpanded ? 180 : 0 }} transition={{ duration: 0.3 }}>
                <ChevronDown className="h-4 w-4 text-slate-400 group-hover:text-brand-primary" />
              </motion.div>
            </motion.button>
          )}
        </div>

        {/* Bottom decorative element */}
        <motion.div
          className="relative z-10 mt-8 flex justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
        >
          <div className="flex items-center gap-2">
            <div className="h-px w-8 bg-gradient-to-r from-transparent to-brand-primary/[0.4]" />
            <motion.div
              className="h-2 w-2 rounded-full bg-brand-primary/[0.4]"
              animate={{ scale: [1, 1.3, 1], opacity: [0.4, 0.8, 0.4] }}
              transition={{ duration: 2, repeat: Infinity }}
            />
            <div className="h-px w-8 bg-gradient-to-l from-transparent to-brand-primary/[0.4]" />
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}
