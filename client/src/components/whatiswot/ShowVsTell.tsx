import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight, Users, Briefcase, Music, Compass, Heart } from "lucide-react";
import {
  CompareIcon,
  NetworkWebIcon,
  FollowHeartIcon,
  ZapBoltIcon,
  RepostIcon,
  QuoteBubbleIcon,
  StarRatingIcon,
  TagLabelIcon,
  ActionProofIcon,
  ExplicitContextIcon,
} from "@/components/WotIcons";
import showTrustImage from "@assets/generated_images/show_trust_behavioral_proof_hands.png";
import tellTrustImage from "@assets/generated_images/tell_trust_attestation_speech_bubbles.png";
import { trustScenarios, type UserMode } from "./data";

export function ShowVsTell({ mode }: { mode: UserMode }) {
  const [activeShowTell, setActiveShowTell] = useState<"show" | "tell" | "both" | null>(null);
  const [selectedScenario, setSelectedScenario] = useState(0);
  const [isComputing, setIsComputing] = useState(false);
  const [displayedScenario, setDisplayedScenario] = useState(0);
  const [computingCard, setComputingCard] = useState<"show" | "tell" | "both" | null>(null);

  const handleScenarioChange = (newIndex: number) => {
    if (newIndex === selectedScenario) return;
    setSelectedScenario(newIndex);
    setIsComputing(true);
    setComputingCard("both");
    setTimeout(() => {
      setDisplayedScenario(newIndex);
      setTimeout(() => {
        setIsComputing(false);
        setComputingCard(null);
      }, 400);
    }, 600);
  };

  const handleCardReveal = (card: "show" | "tell") => {
    if (computingCard) return;

    const isClosing =
      (card === "show" && (activeShowTell === "show" || activeShowTell === "both")) ||
      (card === "tell" && (activeShowTell === "tell" || activeShowTell === "both"));

    if (isClosing) {
      if (card === "show") {
        setActiveShowTell(activeShowTell === "both" ? "tell" : null);
      } else {
        setActiveShowTell(activeShowTell === "both" ? "show" : null);
      }
      return;
    }

    const willRevealBoth =
      (card === "show" && activeShowTell === "tell") || (card === "tell" && activeShowTell === "show");

    if (willRevealBoth) {
      setIsComputing(true);
      setComputingCard("both");
      setTimeout(() => {
        setActiveShowTell("both");
        setTimeout(() => {
          setIsComputing(false);
          setComputingCard(null);
        }, 400);
      }, 600);
    } else {
      setComputingCard(card);
      setTimeout(() => {
        setActiveShowTell(card);
        setTimeout(() => setComputingCard(null), 300);
      }, 500);
    }
  };

  const scenario = trustScenarios[displayedScenario];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15 }}
      className="mb-16"
    >
      <div className="mb-8 text-center">
        <motion.div
          className="mb-4 inline-flex items-center gap-3"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <motion.div
            className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl border border-emerald-500/30 bg-emerald-500/15"
            animate={{ scale: [1, 1.05, 1] }}
            transition={{ duration: 2, repeat: Infinity, repeatDelay: 1 }}
          >
            <img src={showTrustImage} alt="Show Trust" className="h-full w-full object-cover" />
          </motion.div>
          <h2
            className="text-2xl font-bold text-white md:text-3xl lg:text-4xl"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Show <span className="mx-1 font-normal text-slate-500 md:mx-2">vs</span> Tell
          </h2>
          <motion.div
            className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl border border-brand-accent/[0.3] bg-brand-accent/15"
            animate={{ scale: [1, 1.05, 1] }}
            transition={{ duration: 2, repeat: Infinity, repeatDelay: 1, delay: 0.5 }}
          >
            <img src={tellTrustImage} alt="Tell Trust" className="h-full w-full object-cover" />
          </motion.div>
        </motion.div>
        <p className="mx-auto mb-3 max-w-md text-sm text-slate-400">
          {mode === "normal"
            ? "Two fundamental ways to express trust in a decentralized network."
            : "Implicit behavioral signals vs explicit semantic attestations."}
        </p>
        <div className="mb-2 flex flex-wrap items-center justify-center gap-2">
          {activeShowTell !== "both" && !computingCard && (
            <motion.button
              onClick={() => {
                setIsComputing(true);
                setComputingCard("both");
                setTimeout(() => {
                  setActiveShowTell("both");
                  setTimeout(() => {
                    setIsComputing(false);
                    setComputingCard(null);
                  }, 400);
                }, 600);
              }}
              className="inline-flex items-center gap-2 rounded-full border border-brand-primary/[0.3] bg-gradient-to-r from-emerald-500/20 via-brand-primary/20 to-brand-accent/20 px-4 py-2 transition-all hover:border-brand-primary/[0.5]"
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.98 }}
              animate={{
                boxShadow: [
                  "0 0 0 0 rgb(var(--brand-primary)/0)",
                  "0 0 12px rgb(var(--brand-primary)/0.2)",
                  "0 0 0 0 rgb(var(--brand-primary)/0)",
                ],
              }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              <CompareIcon className="h-4 w-4 text-brand-primary" />
              <span className="text-[11px] font-medium text-white">Reveal Both</span>
            </motion.button>
          )}
          {activeShowTell === "both" && (
            <motion.button
              onClick={() => setActiveShowTell(null)}
              className="inline-flex items-center gap-2 rounded-full border border-slate-600/50 bg-slate-800/60 px-4 py-2 transition-all hover:border-slate-500/50"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.98 }}
            >
              <span className="text-[11px] text-slate-400">Reset</span>
            </motion.button>
          )}
        </div>
        {activeShowTell === null && (
          <motion.p
            className="text-[10px] text-slate-500"
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            Or tap cards individually to explore
          </motion.p>
        )}
      </div>

      <motion.div
        className="relative mx-auto max-w-3xl overflow-hidden rounded-3xl border border-brand-primary/[0.3] bg-gradient-to-br from-slate-900 via-slate-950 to-brand-primary p-8 backdrop-blur-xl"
        initial={{
          boxShadow:
            "0 8px 40px rgb(var(--brand-primary)/0.2), 0 0 80px rgba(139, 92, 246, 0.15), inset 0 1px 0 rgba(255,255,255,0.05)",
        }}
        whileHover={{
          boxShadow:
            "0 12px 50px rgb(var(--brand-primary)/0.3), 0 0 100px rgba(139, 92, 246, 0.2), inset 0 1px 0 rgba(255,255,255,0.08)",
        }}
        transition={{ duration: 0.4 }}
      >
        {/* Deep space gradient overlay */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-brand-primary/20 via-brand-accent/10 to-brand-primary/20" />

        {/* Star field particles */}
        {[...Array(30)].map((_, i) => (
          <motion.div
            key={i}
            className="pointer-events-none absolute h-0.5 w-0.5 rounded-full bg-white"
            style={{
              left: `${(i * 37 + 10) % 100}%`,
              top: `${(i * 23 + 5) % 100}%`,
            }}
            animate={{
              opacity: [0.2, 0.8, 0.2],
              scale: [0.8, 1.2, 0.8],
            }}
            transition={{
              duration: 2 + (i % 3),
              repeat: Infinity,
              delay: i * 0.15,
              ease: "easeInOut",
            }}
          />
        ))}

        {/* Floating mathematical symbols */}
        {["∫", "Σ", "α", "π", "∞", "Δ", "λ", "∂"].map((sym, i) => (
          <motion.span
            key={i}
            className="pointer-events-none absolute select-none font-mono text-brand-primary/20"
            style={{
              left: `${10 + i * 12}%`,
              top: `${15 + ((i * 10) % 70)}%`,
              fontSize: `${12 + (i % 3) * 6}px`,
            }}
            animate={{
              opacity: [0.1, 0.3, 0.1],
              y: [0, -8, 0],
              rotate: [0, 5, 0],
            }}
            transition={{
              duration: 6 + i,
              repeat: Infinity,
              delay: i * 0.8,
              ease: "easeInOut",
            }}
          >
            {sym}
          </motion.span>
        ))}

        {/* Nebula glow orbs */}
        <motion.div
          className="pointer-events-none absolute -right-32 -top-32 h-72 w-72 rounded-full bg-gradient-to-br from-brand-accent/25 to-brand-primary/20 blur-3xl"
          animate={{ opacity: [0.3, 0.6, 0.3], scale: [1, 1.2, 1], x: [0, 15, 0], y: [0, -15, 0] }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="pointer-events-none absolute -bottom-32 -left-32 h-72 w-72 rounded-full bg-gradient-to-br from-brand-primary/20 to-brand-accent/25 blur-3xl"
          animate={{ opacity: [0.3, 0.6, 0.3], scale: [1, 1.2, 1], x: [0, -15, 0], y: [0, 15, 0] }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut", delay: 4 }}
        />
        <motion.div
          className="bg-gradient-radial pointer-events-none absolute left-1/2 top-1/2 h-80 w-80 -translate-x-1/2 -translate-y-1/2 rounded-full from-brand-primary/15 via-brand-accent/10 to-transparent blur-2xl"
          animate={{ opacity: [0.2, 0.4, 0.2], scale: [0.9, 1.15, 0.9] }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut", delay: 2 }}
        />

        {/* Computation grid overlay */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(139, 92, 246, 0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(139, 92, 246, 0.4) 1px, transparent 1px)",
            backgroundSize: "30px 30px",
          }}
        />

        {/* Glowing edge lines */}
        <div className="absolute left-1/4 right-1/4 top-0 h-px bg-gradient-to-r from-transparent via-brand-accent/[0.5] to-transparent" />
        <div className="absolute bottom-0 left-1/3 right-1/3 h-px bg-gradient-to-r from-transparent via-brand-primary/[0.4] to-transparent" />

        {/* Animated corner brackets */}
        <motion.div
          className="pointer-events-none absolute right-4 top-4 h-16 w-16 rounded-tr-2xl border-r-2 border-t-2 border-brand-accent/[0.4]"
          animate={{ opacity: [0.3, 0.7, 0.3] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="pointer-events-none absolute bottom-4 left-4 h-16 w-16 rounded-bl-2xl border-b-2 border-l-2 border-brand-primary/[0.4]"
          animate={{ opacity: [0.3, 0.7, 0.3] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut", delay: 2 }}
        />

        <div className="relative z-10 mb-6 gap-2 sm:flex sm:items-center sm:justify-center">
          {/* Mobile: 3 on first row, 2 centered on second row */}
          <div className="mb-2 grid grid-cols-3 gap-2 sm:hidden">
            {trustScenarios.slice(0, 3).map((s, i) => {
              const IconComponent =
                s.icon === "users"
                  ? Users
                  : s.icon === "briefcase"
                    ? Briefcase
                    : s.icon === "music"
                      ? Music
                      : s.icon === "heart"
                        ? Heart
                        : Compass;
              const isActive = selectedScenario === i;
              return (
                <motion.button
                  key={s.id}
                  onClick={() => handleScenarioChange(i)}
                  className={`relative flex items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-[10px] font-semibold transition-all ${
                    isActive
                      ? "border border-brand-accent/[0.5] bg-gradient-to-r from-brand-accent to-brand-primary text-white shadow-lg shadow-brand-accent/[0.3]"
                      : "border border-slate-600/50 bg-slate-800/60 text-slate-300 hover:border-brand-accent/[0.5] hover:bg-slate-700/60 hover:text-white"
                  }`}
                  whileHover={{ scale: 1.05, y: -2 }}
                  whileTap={{ scale: 0.97 }}
                  style={
                    isActive
                      ? { boxShadow: "0 4px 20px rgba(139, 92, 246, 0.4), inset 0 1px 0 rgba(255,255,255,0.15)" }
                      : { boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05)" }
                  }
                >
                  {isActive && (
                    <motion.div
                      className="absolute inset-0 rounded-xl bg-gradient-to-r from-brand-accent/20 to-brand-primary/20"
                      layoutId="activeScenario"
                      transition={{ type: "spring", stiffness: 400, damping: 30 }}
                    />
                  )}
                  <IconComponent className={`relative z-10 h-3.5 w-3.5 ${isActive ? "text-white" : ""}`} />
                  <span className="relative z-10">{s.label}</span>
                </motion.button>
              );
            })}
          </div>
          <div className="flex justify-center gap-2 sm:hidden">
            {trustScenarios.slice(3).map((s, idx) => {
              const i = idx + 3;
              const IconComponent =
                s.icon === "users"
                  ? Users
                  : s.icon === "briefcase"
                    ? Briefcase
                    : s.icon === "music"
                      ? Music
                      : s.icon === "heart"
                        ? Heart
                        : Compass;
              const isActive = selectedScenario === i;
              return (
                <motion.button
                  key={s.id}
                  onClick={() => handleScenarioChange(i)}
                  className={`relative flex items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-[10px] font-semibold transition-all ${
                    isActive
                      ? "border border-brand-accent/[0.5] bg-gradient-to-r from-brand-accent to-brand-primary text-white shadow-lg shadow-brand-accent/[0.3]"
                      : "border border-slate-600/50 bg-slate-800/60 text-slate-300 hover:border-brand-accent/[0.5] hover:bg-slate-700/60 hover:text-white"
                  }`}
                  whileHover={{ scale: 1.05, y: -2 }}
                  whileTap={{ scale: 0.97 }}
                  style={
                    isActive
                      ? { boxShadow: "0 4px 20px rgba(139, 92, 246, 0.4), inset 0 1px 0 rgba(255,255,255,0.15)" }
                      : { boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05)" }
                  }
                >
                  {isActive && (
                    <motion.div
                      className="absolute inset-0 rounded-xl bg-gradient-to-r from-brand-accent/20 to-brand-primary/20"
                      layoutId="activeScenario"
                      transition={{ type: "spring", stiffness: 400, damping: 30 }}
                    />
                  )}
                  <IconComponent className={`relative z-10 h-3.5 w-3.5 ${isActive ? "text-white" : ""}`} />
                  <span className="relative z-10">{s.label}</span>
                </motion.button>
              );
            })}
          </div>
          {/* Desktop: all in one row */}
          <div className="hidden gap-2 sm:flex sm:items-center sm:justify-center">
            {trustScenarios.map((s, i) => {
              const IconComponent =
                s.icon === "users"
                  ? Users
                  : s.icon === "briefcase"
                    ? Briefcase
                    : s.icon === "music"
                      ? Music
                      : s.icon === "heart"
                        ? Heart
                        : Compass;
              const isActive = selectedScenario === i;
              return (
                <motion.button
                  key={s.id}
                  onClick={() => handleScenarioChange(i)}
                  className={`relative flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-all ${
                    isActive
                      ? "border border-brand-accent/[0.5] bg-gradient-to-r from-brand-accent to-brand-primary text-white shadow-lg shadow-brand-accent/[0.3]"
                      : "border border-slate-600/50 bg-slate-800/60 text-slate-300 hover:border-brand-accent/[0.5] hover:bg-slate-700/60 hover:text-white"
                  }`}
                  whileHover={{ scale: 1.05, y: -2 }}
                  whileTap={{ scale: 0.97 }}
                  style={
                    isActive
                      ? { boxShadow: "0 4px 20px rgba(139, 92, 246, 0.4), inset 0 1px 0 rgba(255,255,255,0.15)" }
                      : { boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05)" }
                  }
                >
                  {isActive && (
                    <motion.div
                      className="absolute inset-0 rounded-xl bg-gradient-to-r from-brand-accent/20 to-brand-primary/20"
                      layoutId="activeScenario"
                      transition={{ type: "spring", stiffness: 400, damping: 30 }}
                    />
                  )}
                  <IconComponent className={`relative z-10 h-3.5 w-3.5 ${isActive ? "text-white" : ""}`} />
                  <span className="relative z-10">{s.label}</span>
                  {isActive && (
                    <motion.div
                      className="absolute -bottom-px left-1/4 right-1/4 h-0.5 bg-gradient-to-r from-transparent via-white/60 to-transparent"
                      initial={{ opacity: 0, scaleX: 0 }}
                      animate={{ opacity: 1, scaleX: 1 }}
                    />
                  )}
                </motion.button>
              );
            })}
          </div>
        </div>

        <AnimatePresence mode="popLayout">
          <motion.div
            key={scenario.id}
            className="relative z-10 mb-4 flex items-center justify-between sm:mb-6 sm:justify-center sm:gap-4"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
          >
            <motion.div
              className="flex flex-1 items-center gap-2 rounded-xl border border-slate-600/50 bg-slate-800/70 px-2.5 py-2 sm:flex-initial sm:gap-3 sm:rounded-2xl sm:px-4 sm:py-3"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 }}
              style={{ boxShadow: "0 4px 16px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05)" }}
            >
              <div className="relative flex-shrink-0">
                <motion.div
                  className="absolute inset-0 rounded-full bg-gradient-to-br from-emerald-400/50 to-cyan-400/40 blur-md"
                  animate={{ opacity: [0.5, 0.9, 0.5] }}
                  transition={{ duration: 3, repeat: Infinity }}
                />
                <img
                  src={scenario.personA.avatar}
                  alt={scenario.personA.name}
                  className="relative h-8 w-8 rounded-full border-2 border-emerald-400/80 object-cover shadow-lg shadow-emerald-500/30 sm:h-10 sm:w-10"
                />
                <motion.div
                  className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-slate-900 bg-gradient-to-br from-emerald-400 to-emerald-500 sm:h-3 sm:w-3"
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ duration: 2, repeat: Infinity }}
                />
              </div>
              <div className="text-left">
                <p className="text-xs font-semibold text-white sm:text-sm">{scenario.personA.name}</p>
                <p className="text-[9px] font-medium text-emerald-400 sm:text-[10px]">{scenario.personA.role}</p>
              </div>
            </motion.div>

            <motion.div
              className="hidden flex-shrink-0 flex-col items-center gap-1 px-4 sm:flex"
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2, type: "spring", stiffness: 300 }}
            >
              <div className="flex items-center gap-1">
                <motion.div
                  className="h-0.5 w-8 rounded-full bg-gradient-to-r from-emerald-400/70 to-cyan-400/70"
                  animate={{ opacity: [0.5, 1, 0.5] }}
                  transition={{ duration: 2, repeat: Infinity }}
                />
                <motion.div
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-brand-accent/[0.5] bg-gradient-to-br from-brand-accent/[0.3] to-brand-primary/[0.3]"
                  animate={{ rotate: [0, 360] }}
                  transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                  style={{ boxShadow: "0 0 20px rgba(139, 92, 246, 0.35)" }}
                >
                  <NetworkWebIcon className="h-4 w-4 text-brand-accent" />
                </motion.div>
                <motion.div
                  className="h-0.5 w-8 rounded-full bg-gradient-to-r from-brand-primary/70 to-brand-accent/70"
                  animate={{ opacity: [0.5, 1, 0.5] }}
                  transition={{ duration: 2, repeat: Infinity, delay: 0.5 }}
                />
              </div>
              <span className="text-[9px] font-medium text-slate-400">trust network</span>
            </motion.div>
            <span className="flex-shrink-0 px-1 text-slate-500 sm:hidden">→</span>

            <motion.div
              className="flex flex-1 items-center justify-end gap-2 rounded-xl border border-slate-600/50 bg-slate-800/70 px-2.5 py-2 sm:flex-initial sm:gap-3 sm:rounded-2xl sm:px-4 sm:py-3"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 }}
              style={{ boxShadow: "0 4px 16px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05)" }}
            >
              <div className="text-right">
                <p className="text-xs font-semibold text-white sm:text-sm">{scenario.personB.name}</p>
                <p className="text-[9px] font-medium text-brand-accent sm:text-[10px]">{scenario.personB.role}</p>
              </div>
              <div className="relative flex-shrink-0">
                <motion.div
                  className="absolute inset-0 rounded-full bg-gradient-to-br from-brand-accent/[0.5] to-brand-primary/[0.4] blur-md"
                  animate={{ opacity: [0.5, 0.9, 0.5] }}
                  transition={{ duration: 3, repeat: Infinity, delay: 1.5 }}
                />
                <img
                  src={scenario.personB.avatar}
                  alt={scenario.personB.name}
                  className="relative h-8 w-8 rounded-full border-2 border-brand-accent/80 object-cover shadow-lg shadow-brand-accent/[0.3] sm:h-10 sm:w-10"
                />
                <motion.div
                  className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-slate-900 bg-gradient-to-br from-brand-accent to-brand-accent sm:h-3 sm:w-3"
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ duration: 2, repeat: Infinity, delay: 0.5 }}
                />
              </div>
            </motion.div>
          </motion.div>
        </AnimatePresence>

        <div className="relative z-10 grid gap-4 md:grid-cols-2">
          <AnimatePresence>
            {isComputing && (
              <motion.div
                className="absolute inset-0 z-20 flex items-center justify-center rounded-xl bg-slate-900/95 backdrop-blur-sm"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.4, ease: "easeInOut" }}
              >
                <div className="flex flex-col items-center gap-3">
                  <div className="flex items-center gap-2">
                    {["Σ", "∫", "α", "×", "T(u)", "→"].map((sym, i) => (
                      <motion.span
                        key={i}
                        className="font-mono text-lg"
                        style={{ color: i % 2 === 0 ? "#13d2e5" : "#7237ff" }}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: [0, 1, 1, 0], y: [10, 0, 0, -10] }}
                        transition={{
                          duration: 0.8,
                          delay: i * 0.1,
                          times: [0, 0.2, 0.8, 1],
                        }}
                      >
                        {sym}
                      </motion.span>
                    ))}
                  </div>
                  <motion.div
                    className="flex items-center gap-1.5"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.3 }}
                  >
                    <motion.div
                      className="h-1.5 w-1.5 rounded-full bg-brand-accent"
                      animate={{ scale: [1, 1.5, 1], opacity: [0.5, 1, 0.5] }}
                      transition={{ duration: 0.4, repeat: 2 }}
                    />
                    <span className="font-mono text-[10px] text-slate-400">recalculating trust scores...</span>
                  </motion.div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <motion.button
            onClick={() => handleCardReveal("show")}
            animate={{
              opacity: computingCard === "show" || computingCard === "both" ? 0.3 : 1,
              filter: computingCard === "show" || computingCard === "both" ? "blur(2px)" : "blur(0px)",
            }}
            transition={{ duration: 0.2 }}
            className={`group relative overflow-hidden rounded-xl p-5 text-left transition-all ${
              activeShowTell === "show" || activeShowTell === "both"
                ? "border-2 border-emerald-400/50 bg-emerald-900/30"
                : "border border-slate-600/50 bg-slate-800/50 hover:border-emerald-400/40 hover:bg-slate-800/70"
            }`}
            whileHover={{ scale: 1.02, y: -3 }}
            whileTap={{ scale: 0.98 }}
            style={{
              boxShadow:
                activeShowTell === "show" || activeShowTell === "both"
                  ? "0 4px 20px rgba(16, 185, 129, 0.25), inset 0 1px 0 rgba(255,255,255,0.05)"
                  : "inset 0 1px 0 rgba(255,255,255,0.03)",
            }}
          >
            <AnimatePresence>
              {computingCard === "show" && (
                <motion.div
                  className="absolute inset-0 z-20 flex items-center justify-center rounded-xl bg-slate-900/95 backdrop-blur-sm"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <div className="flex items-center gap-2">
                    {["Σ", "→", "T(s)"].map((sym, i) => (
                      <motion.span
                        key={i}
                        className="font-mono text-base text-emerald-400"
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: [0, 1, 1, 0], y: [8, 0, 0, -8] }}
                        transition={{ duration: 0.5, delay: i * 0.12, times: [0, 0.2, 0.7, 1] }}
                      >
                        {sym}
                      </motion.span>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            {!(activeShowTell === "show" || activeShowTell === "both") && (
              <motion.div
                className="pointer-events-none absolute inset-0 rounded-xl"
                animate={{
                  boxShadow: [
                    "inset 0 0 0 1px rgba(16, 185, 129, 0)",
                    "inset 0 0 0 2px rgba(16, 185, 129, 0.4)",
                    "inset 0 0 0 1px rgba(16, 185, 129, 0)",
                  ],
                }}
                transition={{ duration: 2, repeat: Infinity, repeatDelay: 1 }}
              />
            )}
            {(activeShowTell === "show" || activeShowTell === "both") && (
              <motion.div
                className="absolute left-0 right-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-500 to-transparent"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              />
            )}
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <motion.div
                  className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-lg border border-emerald-400/40 bg-emerald-500/20"
                  animate={!(activeShowTell === "show" || activeShowTell === "both") ? { scale: [1, 1.08, 1] } : {}}
                  transition={{ duration: 1.5, repeat: Infinity, repeatDelay: 0.5 }}
                >
                  <img src={showTrustImage} alt="Show Trust" className="h-full w-full object-cover" />
                </motion.div>
                <div>
                  <span className="block text-sm font-semibold text-white">Show Trust</span>
                  <span className="text-[10px] text-emerald-400">Behavioral signals</span>
                </div>
              </div>
              {!(activeShowTell === "show" || activeShowTell === "both") && (
                <motion.div
                  className="flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-500/15 px-2 py-1"
                  animate={{ opacity: [0.7, 1, 0.7] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                >
                  <span className="text-[9px] font-medium text-emerald-400">Tap to reveal</span>
                  <ChevronRight className="h-3 w-3 text-emerald-400" />
                </motion.div>
              )}
            </div>
            <AnimatePresence mode="popLayout">
              {activeShowTell === "show" || activeShowTell === "both" ? (
                <motion.div
                  key={`show-${scenario.id}`}
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="space-y-2.5"
                >
                  {scenario.showActions.map((action, idx) => {
                    const IconComponent =
                      action.icon === "heart" ? FollowHeartIcon : action.icon === "zap" ? ZapBoltIcon : RepostIcon;
                    const colorClass =
                      action.color === "emerald"
                        ? "text-emerald-400"
                        : action.color === "amber"
                          ? "text-amber-400"
                          : "text-brand-accent";
                    return (
                      <div key={idx} className="flex items-center gap-2.5 text-xs text-slate-300">
                        <IconComponent className={`h-4 w-4 ${colorClass} flex-shrink-0`} />
                        <span>{action.text}</span>
                      </div>
                    );
                  })}
                  <div className="mt-3 flex items-start gap-2 border-t border-emerald-500/30 pt-3">
                    <ActionProofIcon className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-400" />
                    <p className="text-[10px] leading-relaxed text-slate-400">{scenario.showInsight}</p>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  className="flex items-center gap-2 py-2"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <div className="flex -space-x-1">
                    <div className="flex h-5 w-5 items-center justify-center rounded-full border border-emerald-400/40 bg-emerald-500/20">
                      <FollowHeartIcon className="h-2.5 w-2.5 text-emerald-400" />
                    </div>
                    <div className="flex h-5 w-5 items-center justify-center rounded-full border border-amber-400/40 bg-amber-500/20">
                      <ZapBoltIcon className="h-2.5 w-2.5 text-amber-400" />
                    </div>
                    <div className="flex h-5 w-5 items-center justify-center rounded-full border border-brand-accent/[0.4] bg-brand-accent/20">
                      <RepostIcon className="h-2.5 w-2.5 text-brand-accent" />
                    </div>
                  </div>
                  <span className="text-[11px] text-slate-400">{scenario.showActions.length} action types</span>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.button>

          <motion.button
            onClick={() => handleCardReveal("tell")}
            animate={{
              opacity: computingCard === "tell" || computingCard === "both" ? 0.3 : 1,
              filter: computingCard === "tell" || computingCard === "both" ? "blur(2px)" : "blur(0px)",
            }}
            transition={{ duration: 0.2 }}
            className={`group relative overflow-hidden rounded-xl p-5 text-left transition-all ${
              activeShowTell === "tell" || activeShowTell === "both"
                ? "border-2 border-brand-accent/[0.5] bg-brand-accent/[0.3]"
                : "border border-slate-600/50 bg-slate-800/50 hover:border-brand-accent/[0.4] hover:bg-slate-800/70"
            }`}
            whileHover={{ scale: 1.02, y: -3 }}
            whileTap={{ scale: 0.98 }}
            style={{
              boxShadow:
                activeShowTell === "tell" || activeShowTell === "both"
                  ? "0 4px 20px rgba(139, 92, 246, 0.25), inset 0 1px 0 rgba(255,255,255,0.05)"
                  : "inset 0 1px 0 rgba(255,255,255,0.03)",
            }}
          >
            <AnimatePresence>
              {computingCard === "tell" && (
                <motion.div
                  className="absolute inset-0 z-20 flex items-center justify-center rounded-xl bg-slate-900/95 backdrop-blur-sm"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <div className="flex items-center gap-2">
                    {["α", "×", "A(t)"].map((sym, i) => (
                      <motion.span
                        key={i}
                        className="font-mono text-base text-brand-accent"
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: [0, 1, 1, 0], y: [8, 0, 0, -8] }}
                        transition={{ duration: 0.5, delay: i * 0.12, times: [0, 0.2, 0.7, 1] }}
                      >
                        {sym}
                      </motion.span>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            {!(activeShowTell === "tell" || activeShowTell === "both") && (
              <motion.div
                className="pointer-events-none absolute inset-0 rounded-xl"
                animate={{
                  boxShadow: [
                    "inset 0 0 0 1px rgba(139, 92, 246, 0)",
                    "inset 0 0 0 2px rgba(139, 92, 246, 0.4)",
                    "inset 0 0 0 1px rgba(139, 92, 246, 0)",
                  ],
                }}
                transition={{ duration: 2, repeat: Infinity, repeatDelay: 1, delay: 0.5 }}
              />
            )}
            {(activeShowTell === "tell" || activeShowTell === "both") && (
              <motion.div
                className="absolute left-0 right-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-accent to-transparent"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              />
            )}
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <motion.div
                  className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-lg border border-brand-accent/[0.4] bg-brand-accent/20"
                  animate={!(activeShowTell === "tell" || activeShowTell === "both") ? { scale: [1, 1.08, 1] } : {}}
                  transition={{ duration: 1.5, repeat: Infinity, repeatDelay: 0.5, delay: 0.3 }}
                >
                  <img src={tellTrustImage} alt="Tell Trust" className="h-full w-full object-cover" />
                </motion.div>
                <div>
                  <span className="block text-sm font-semibold text-white">Tell Trust</span>
                  <span className="text-[10px] text-brand-accent">Explicit attestations</span>
                </div>
              </div>
              {!(activeShowTell === "tell" || activeShowTell === "both") && (
                <motion.div
                  className="flex items-center gap-1 rounded-full border border-brand-accent/[0.3] bg-brand-accent/15 px-2 py-1"
                  animate={{ opacity: [0.7, 1, 0.7] }}
                  transition={{ duration: 1.5, repeat: Infinity, delay: 0.3 }}
                >
                  <span className="text-[9px] font-medium text-brand-accent">Tap to reveal</span>
                  <ChevronRight className="h-3 w-3 text-brand-accent" />
                </motion.div>
              )}
            </div>
            <AnimatePresence mode="popLayout">
              {activeShowTell === "tell" || activeShowTell === "both" ? (
                <motion.div
                  key={`tell-${scenario.id}`}
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="space-y-2.5"
                >
                  {scenario.tellActions.map((action, idx) => {
                    const IconComponent =
                      action.icon === "quote"
                        ? QuoteBubbleIcon
                        : action.icon === "star"
                          ? StarRatingIcon
                          : TagLabelIcon;
                    return (
                      <div key={idx} className="flex items-center gap-2.5 text-xs text-slate-300">
                        <IconComponent className="h-4 w-4 flex-shrink-0 text-brand-accent" />
                        <span>{action.text}</span>
                      </div>
                    );
                  })}
                  <div className="mt-3 flex items-start gap-2 border-t border-brand-accent/[0.3] pt-3">
                    <ExplicitContextIcon className="mt-0.5 h-4 w-4 flex-shrink-0 text-brand-accent" />
                    <p className="text-[10px] leading-relaxed text-slate-400">{scenario.tellInsight}</p>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  className="flex items-center gap-2 py-2"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <div className="flex -space-x-1">
                    <div className="flex h-5 w-5 items-center justify-center rounded-full border border-brand-accent/[0.4] bg-brand-accent/20">
                      <QuoteBubbleIcon className="h-2.5 w-2.5 text-brand-accent" />
                    </div>
                    <div className="flex h-5 w-5 items-center justify-center rounded-full border border-brand-accent/[0.4] bg-brand-accent/20">
                      <StarRatingIcon className="h-2.5 w-2.5 text-brand-accent" />
                    </div>
                    <div className="flex h-5 w-5 items-center justify-center rounded-full border border-brand-accent/[0.4] bg-brand-accent/20">
                      <TagLabelIcon className="h-2.5 w-2.5 text-brand-accent" />
                    </div>
                  </div>
                  <span className="text-[11px] text-slate-400">{scenario.tellActions.length} attestation types</span>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.button>
        </div>

        {activeShowTell === "both" && (
          <motion.div
            className="relative z-10 mt-5 border-t border-brand-primary/[0.3] pt-4"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="mb-4 text-center">
              <div className="inline-flex items-center gap-2 rounded-full border border-brand-primary/[0.3] bg-brand-primary/15 px-3 py-1.5">
                <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-primary" />
                <p className="text-[10px] font-medium text-brand-primary">
                  When Show + Tell combine, real-world applications unlock
                </p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {scenario.applications.map((app, idx) => (
                <motion.div
                  key={idx}
                  className="group rounded-lg border border-slate-600/50 bg-slate-800/60 p-4 transition-colors hover:border-brand-primary/[0.5]"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 + idx * 0.1 }}
                  style={{ boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)" }}
                >
                  <div className="mb-2 flex items-center gap-2">
                    <div className="flex h-6 w-6 items-center justify-center rounded-md border border-brand-primary/[0.4] bg-brand-primary/20">
                      <NetworkWebIcon className="h-3 w-3 text-brand-primary" />
                    </div>
                    <h4 className="text-xs font-semibold text-white">{app.title}</h4>
                  </div>
                  <p className="text-[11px] leading-relaxed text-slate-400">{app.description}</p>
                </motion.div>
              ))}
            </div>

            <motion.div
              className="mt-6 border-t border-brand-primary/20 pt-5"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, type: "spring", stiffness: 300 }}
            >
              <div className="mb-2 flex items-center justify-center gap-2">
                <div className="h-1.5 w-1.5 rounded-full bg-amber-400/60" />
                <span className="text-[9px] font-medium uppercase tracking-widest text-amber-400/80">The Outcome</span>
                <div className="h-1.5 w-1.5 rounded-full bg-amber-400/60" />
              </div>
              <p className="mx-auto max-w-lg text-center text-sm leading-relaxed text-slate-300">
                {scenario.id === "social" &&
                  "Genuine connections compound. Alice discovered Bob through a friend's zap — now they're building together."}
                {scenario.id === "business" &&
                  "Trust reduces friction. The startup found a vetted agency through their network — shipped faster, paid in sats."}
                {scenario.id === "music" &&
                  "Discovery travels through trust. A friend's endorsement led to a new favorite artist — value flowed back to the creator."}
                {scenario.id === "recommendations" &&
                  "Quality surfaces organically. The foodie's recommendation became dinner — the restaurant earned a loyal regular."}
                {scenario.id === "wellness" &&
                  "Healing happens outside the system. When insurance gatekeepers said no, Marcus found Dr. Chen through someone who'd walked the same path — and got his life back."}
              </p>
              <div className="mt-4 flex justify-center">
                <img src="/nostr-ostrich.gif" alt="Ostrich running" className="h-7 w-7 object-contain" />
              </div>
            </motion.div>
          </motion.div>
        )}
      </motion.div>
    </motion.div>
  );
}
