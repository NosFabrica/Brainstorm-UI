import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight } from "lucide-react";
import { KeyControlIcon, ShowEyeIcon, NetworkWebIcon, TunerIcon } from "@/components/WotIcons";
import networkBg from "@assets/generated_images/abstract_network_web_background.png";
import { trustNodeInfo, type UserMode } from "./data";

export function ControlCard({ mode }: { mode: UserMode }) {
  const [selectedTrustNode, setSelectedTrustNode] = useState<number | null>(null);
  const [selectedFeature, setSelectedFeature] = useState<number | null>(null);
  const [selectedFormula, setSelectedFormula] = useState<number | null>(null);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className="mb-10 sm:mb-16"
    >
      <div
        className="relative mx-auto max-w-3xl overflow-hidden rounded-2xl border border-brand-primary/[0.4] bg-gradient-to-br from-brand-primary/15 via-slate-900/95 to-brand-accent/15 p-6 backdrop-blur-md"
        style={{
          boxShadow:
            "0 12px 48px rgb(var(--brand-primary)/0.25), 0 24px 80px rgba(139, 92, 246, 0.15), 0 0 0 1px rgb(var(--brand-primary)/0.12), inset 0 1px 0 rgba(255, 255, 255, 0.07)",
        }}
      >
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
          initial={{ opacity: 0.4 }}
          animate={{ opacity: selectedTrustNode !== null || selectedFeature !== null ? 1 : 0.4 }}
          transition={{ duration: 0.3 }}
        />

        <div className="relative z-10 mb-4 text-center">
          <h2 className="mb-2 text-[24px] font-bold text-white" style={{ fontFamily: "var(--font-display)" }}>
            You Are In Control
          </h2>
          <p className="mx-auto max-w-md text-xs text-slate-400">
            {mode === "normal"
              ? "You decide how trust flows. Closer connections = more trust."
              : "Algorithmic sovereignty: inspect, adjust, and export every parameter."}
          </p>
        </div>

        {mode === "normal" ? (
          <div className="relative z-10">
            <div className="flex items-center justify-center gap-2 py-4 sm:gap-3">
              {trustNodeInfo.map((node, i) => (
                <motion.div
                  key={i}
                  className="flex items-center gap-2"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.1, type: "spring" }}
                >
                  {i > 0 && (
                    <motion.div
                      animate={{
                        x: selectedTrustNode === null ? [0, 3, 0] : 0,
                        opacity: selectedTrustNode !== null && selectedTrustNode < i ? 0.2 : 1,
                      }}
                      transition={{ duration: 1.5, repeat: selectedTrustNode === null ? Infinity : 0, delay: i * 0.2 }}
                    >
                      <ChevronRight className={`h-3 w-3 ${node.textColor} opacity-40`} />
                    </motion.div>
                  )}
                  <motion.div
                    className={`group flex cursor-pointer flex-col items-center ${selectedTrustNode === i ? "z-10" : ""}`}
                    onMouseEnter={() => setSelectedTrustNode(i)}
                    onMouseLeave={() => setSelectedTrustNode(null)}
                    whileHover={{ scale: 1.15, y: -4 }}
                    animate={{
                      opacity: selectedTrustNode !== null && selectedTrustNode !== i ? 0.4 : 1,
                    }}
                  >
                    <motion.div
                      className={`${node.size} overflow-hidden rounded-full shadow-lg ${node.glow} relative transition-all`}
                      animate={{
                        boxShadow: selectedTrustNode === i ? "0 0 25px rgb(var(--brand-primary)/0.6)" : undefined,
                      }}
                    >
                      <AnimatePresence mode="wait">
                        {selectedTrustNode === i ? (
                          <motion.img
                            key="image"
                            src={node.image}
                            alt={node.label}
                            className={`h-full w-full border-2 object-cover ${node.borderColor} rounded-full`}
                            initial={{ opacity: 0, scale: 1.2 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.8 }}
                            transition={{ duration: 0.2 }}
                          />
                        ) : (
                          <motion.div
                            key="label"
                            className={`h-full w-full bg-gradient-to-br ${node.color} flex items-center justify-center text-[10px] font-semibold text-white`}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.15 }}
                          >
                            {node.label}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                    <span
                      className={`text-[9px] ${node.textColor} mt-1 opacity-70 transition-opacity group-hover:opacity-100`}
                    >
                      {node.trust}
                    </span>
                  </motion.div>
                </motion.div>
              ))}
            </div>

            <div className="mx-4 mb-2 mt-1 flex h-20 flex-col items-center justify-center">
              <AnimatePresence mode="wait">
                {selectedTrustNode !== null ? (
                  <motion.div
                    key={selectedTrustNode}
                    initial={{ opacity: 0, scale: 0.9, y: -10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9, y: -10 }}
                    transition={{ duration: 0.2, type: "spring", stiffness: 400, damping: 25 }}
                    className="max-w-sm rounded-lg border border-brand-primary/20 bg-slate-800/95 px-4 py-2 text-center backdrop-blur-sm"
                    style={{
                      boxShadow: "0 0 15px rgb(var(--brand-primary)/0.15)",
                    }}
                  >
                    <p className="text-xs leading-relaxed text-slate-200">
                      {trustNodeInfo[selectedTrustNode].explanation}
                    </p>
                    <p className="mt-1 text-[10px] font-medium text-brand-primary">
                      ✦ {trustNodeInfo[selectedTrustNode].insight}
                    </p>
                  </motion.div>
                ) : (
                  <motion.div
                    key="idle"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex flex-col items-center gap-2"
                  >
                    <KeyControlIcon className="h-6 w-6 text-brand-primary/60" />
                    <p className="text-[10px] text-slate-500">
                      <span className="hidden text-brand-primary/80 sm:inline">Hover</span>
                      <span className="text-brand-primary/80 sm:hidden">Tap</span> to explore trust decay
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        ) : (
          <>
            <div className="relative z-10 flex flex-wrap items-center justify-center gap-2 py-3">
              {[
                {
                  label: "T(u)",
                  sub: "Score",
                  color: "indigo",
                  expanded:
                    "Final trust score for user u — computed recursively from your graph's edge structure. Aggregates weighted contributions from all connected paths.",
                  insight: "Output range [0,1] normalized via softmax",
                },
                { label: "=", color: "slate", isOperator: true },
                {
                  label: "Σ",
                  sub: "paths",
                  color: "violet",
                  expanded:
                    "Summation over all valid paths from you to target user. Handles cycles via convergence bounds and path deduplication.",
                  insight: "Max path depth configurable (default: 6 hops)",
                },
                { label: "×", color: "slate", isOperator: true },
                {
                  label: "α^d",
                  sub: "decay",
                  color: "emerald",
                  expanded:
                    "Attenuation factor α raised to hop depth d. Each hop multiplies trust by α, so distant connections contribute less. You control α.",
                  insight: "Typical values: 0.5 (strict) to 0.85 (trusting)",
                },
                { label: "×", color: "slate", isOperator: true },
                {
                  label: "w_ij",
                  sub: "weight",
                  color: "amber",
                  expanded:
                    "Edge weight between nodes i→j. Derived from explicit attestations (follows, endorsements) plus implicit behavioral signals (interactions, replies).",
                  insight: "Weights stored as signed events on relays",
                },
              ].map((item, i) => {
                const actualIndex = i === 0 ? 0 : i === 2 ? 1 : i === 4 ? 2 : i === 6 ? 3 : -1;
                return item.isOperator ? (
                  <span key={i} className="px-0.5 text-sm text-slate-500">
                    {item.label}
                  </span>
                ) : (
                  <motion.div
                    key={i}
                    className={`relative cursor-pointer rounded-lg px-2.5 py-1.5 text-center transition-all ${
                      selectedFormula === actualIndex
                        ? `bg-${item.color}-500/25 border border-${item.color}-400/50`
                        : `bg-${item.color}-500/20 border border-${item.color}-500/30 hover:bg-${item.color}-500/25`
                    }`}
                    onMouseEnter={() => setSelectedFormula(actualIndex)}
                    onMouseLeave={() => setSelectedFormula(null)}
                    whileHover={{ scale: 1.08, y: -2 }}
                    animate={{
                      opacity: selectedFormula !== null && selectedFormula !== actualIndex ? 0.5 : 1,
                    }}
                  >
                    <motion.span
                      className={`font-mono text-sm font-bold text-${item.color}-400`}
                      animate={{
                        scale: selectedFormula === actualIndex ? [1, 1.1, 1] : 1,
                      }}
                      transition={{ duration: 0.3 }}
                    >
                      {item.label}
                    </motion.span>
                    {item.sub && <span className="block text-[9px] text-slate-500">{item.sub}</span>}
                  </motion.div>
                );
              })}
            </div>

            {/* Expanded formula explanation */}
            <div className="relative z-10 mx-4 mb-2 mt-1 flex min-h-[4.5rem] items-center justify-center">
              <AnimatePresence mode="wait">
                {selectedFormula !== null ? (
                  <motion.div
                    key={selectedFormula}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.2 }}
                    className="max-w-md rounded-lg border border-brand-primary/20 bg-slate-800/95 px-4 py-2.5 text-center backdrop-blur-sm"
                    style={{
                      boxShadow: "0 0 15px rgb(var(--brand-primary)/0.15)",
                    }}
                  >
                    <p className="text-xs leading-relaxed text-slate-200">
                      {
                        [
                          {
                            expanded:
                              "Final trust score for user u — computed recursively from your graph's edge structure. Aggregates weighted contributions from all connected paths.",
                            insight: "Output range [0,1] normalized via softmax",
                          },
                          {
                            expanded:
                              "Summation over all valid paths from you to target user. Handles cycles via convergence bounds and path deduplication.",
                            insight: "Max path depth configurable (default: 6 hops)",
                          },
                          {
                            expanded:
                              "Attenuation factor α raised to hop depth d. Each hop multiplies trust by α, so distant connections contribute less. You control α.",
                            insight: "Typical values: 0.5 (strict) to 0.85 (trusting)",
                          },
                          {
                            expanded:
                              "Edge weight between nodes i→j. Derived from explicit attestations (follows, endorsements) plus implicit behavioral signals.",
                            insight: "Weights stored as signed events on relays",
                          },
                        ][selectedFormula].expanded
                      }
                    </p>
                    <p className="mt-1.5 text-[10px] font-medium text-brand-primary">
                      ✦{" "}
                      {
                        [
                          { insight: "Output range [0,1] normalized via softmax" },
                          { insight: "Max path depth configurable (default: 6 hops)" },
                          { insight: "Typical values: 0.5 (strict) to 0.85 (trusting)" },
                          { insight: "Weights stored as signed events on relays" },
                        ][selectedFormula].insight
                      }
                    </p>
                  </motion.div>
                ) : (
                  <motion.div
                    key="idle"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex flex-col items-center gap-2"
                  >
                    <KeyControlIcon className="h-6 w-6 text-brand-primary/60" />
                    <p className="text-[10px] text-slate-500">
                      <span className="hidden text-brand-primary/80 sm:inline">Hover</span>
                      <span className="text-brand-primary/80 sm:hidden">Tap</span> to explore the formula
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </>
        )}

        <div className="relative z-10 grid grid-cols-3 gap-2 border-t border-slate-700/30 pt-3">
          {[
            {
              Icon: ShowEyeIcon,
              label: "Transparent",
              desc: "See exactly how scores are calculated",
              expanded:
                mode === "normal"
                  ? "No black boxes. Every trust score shows its path: who vouched for whom, at what strength, through how many hops. You can trace exactly why someone has a 0.72 or a 0.31."
                  : "Full computation audit trail via NIP-XX. Export your score derivations as JSON. Verify calculations locally with open-source reference implementation.",
            },
            {
              Icon: TunerIcon,
              label: "Adjustable",
              desc: "Tune settings to match your style",
              expanded:
                mode === "normal"
                  ? "Cautious by nature? Increase decay. Trust freely? Lower it. Your graph, your rules. Different contexts can have different settings — strict for finance, relaxed for music."
                  : "Configure hop decay factor (α), maximum path depth, attestation weighting curves, and context-specific trust domains. All parameters stored in your local profile.",
            },
            {
              Icon: NetworkWebIcon,
              label: "Portable",
              desc: "Take your trust graph anywhere",
              expanded:
                mode === "normal"
                  ? "Your trust network isn't locked in one app. Export it, import it elsewhere, or let multiple apps read from the same source. Your reputation travels with you."
                  : "Standards-based export via NIP-XX. Interoperable with any compliant Nostr client. Your social graph lives on relays you control, not corporate servers.",
            },
          ].map((item, i) => (
            <motion.div
              key={i}
              className={`flex cursor-pointer flex-col items-center rounded-xl px-2 py-2 text-center transition-all ${
                selectedFeature === i
                  ? "border border-brand-primary/[0.4] bg-brand-primary/15"
                  : "hover:bg-slate-800/40"
              }`}
              onMouseEnter={() => setSelectedFeature(i)}
              onMouseLeave={() => setSelectedFeature(null)}
              whileHover={{ scale: 1.03, y: -2 }}
              animate={{
                opacity: selectedFeature !== null && selectedFeature !== i ? 0.5 : 1,
              }}
            >
              <motion.div
                animate={{
                  scale: selectedFeature === i ? [1, 1.15, 1] : 1,
                }}
                transition={{ duration: 0.3 }}
              >
                <item.Icon
                  className={`mb-1 h-4 w-4 transition-colors ${selectedFeature === i ? "text-brand-primary" : "text-brand-primary"}`}
                />
              </motion.div>
              <span
                className={`text-[11px] font-medium transition-colors ${selectedFeature === i ? "text-white" : "text-slate-300"}`}
              >
                {item.label}
              </span>
              <span className="mt-0.5 text-[9px] leading-tight text-slate-500">{item.desc}</span>
            </motion.div>
          ))}
        </div>

        {/* Expanded feature explanation */}
        <div className="relative z-10 mx-4 mt-2 flex h-16 items-center justify-center">
          <AnimatePresence mode="wait">
            {selectedFeature !== null ? (
              <motion.div
                key={selectedFeature}
                initial={{ opacity: 0, scale: 0.9, y: -10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: -10 }}
                transition={{ duration: 0.2, type: "spring", stiffness: 400, damping: 25 }}
                className="max-w-sm rounded-lg border border-brand-primary/20 bg-slate-800/95 px-4 py-2 text-center backdrop-blur-sm"
                style={{
                  boxShadow: "0 0 15px rgb(var(--brand-primary)/0.15)",
                }}
              >
                <p className="text-xs leading-relaxed text-slate-200">
                  {
                    [
                      {
                        expanded:
                          mode === "normal"
                            ? "Every trust score shows its path: who vouched, at what strength, through how many hops."
                            : "Full audit trail via NIP-XX. Export derivations as JSON. Verify locally.",
                      },
                      {
                        expanded:
                          mode === "normal"
                            ? "Cautious? Increase decay. Trust freely? Lower it. Different contexts, different settings."
                            : "Configure decay factor, path depth, and weighting curves. Stored in your profile.",
                      },
                      {
                        expanded:
                          mode === "normal"
                            ? "Export your trust network, import elsewhere. Your reputation travels with you."
                            : "Standards-based export. Your graph lives on relays you control.",
                      },
                    ][selectedFeature].expanded
                  }
                </p>
              </motion.div>
            ) : (
              <motion.p
                className="text-[10px] text-slate-500"
                initial={{ opacity: 0 }}
                animate={{ opacity: [0.4, 0.7, 0.4] }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                <span className="hidden sm:inline">Hover</span>
                <span className="sm:hidden">Tap</span> to explore features
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}
