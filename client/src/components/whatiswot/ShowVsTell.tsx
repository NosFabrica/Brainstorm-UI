import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, Users, Briefcase, Music, Compass, Heart } from 'lucide-react';
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
} from '@/components/WotIcons';
import showTrustImage from '@assets/generated_images/show_trust_behavioral_proof_hands.png';
import tellTrustImage from '@assets/generated_images/tell_trust_attestation_speech_bubbles.png';
import { trustScenarios, type UserMode } from './data';

export function ShowVsTell({ mode }: { mode: UserMode }) {
  const [activeShowTell, setActiveShowTell] = useState<'show' | 'tell' | 'both' | null>(null);
  const [selectedScenario, setSelectedScenario] = useState(0);
  const [isComputing, setIsComputing] = useState(false);
  const [displayedScenario, setDisplayedScenario] = useState(0);
  const [computingCard, setComputingCard] = useState<'show' | 'tell' | 'both' | null>(null);

  const handleScenarioChange = (newIndex: number) => {
    if (newIndex === selectedScenario) return;
    setSelectedScenario(newIndex);
    setIsComputing(true);
    setComputingCard('both');
    setTimeout(() => {
      setDisplayedScenario(newIndex);
      setTimeout(() => {
        setIsComputing(false);
        setComputingCard(null);
      }, 400);
    }, 600);
  };

  const handleCardReveal = (card: 'show' | 'tell') => {
    if (computingCard) return;

    const isClosing = (card === 'show' && (activeShowTell === 'show' || activeShowTell === 'both')) ||
                      (card === 'tell' && (activeShowTell === 'tell' || activeShowTell === 'both'));

    if (isClosing) {
      if (card === 'show') {
        setActiveShowTell(activeShowTell === 'both' ? 'tell' : null);
      } else {
        setActiveShowTell(activeShowTell === 'both' ? 'show' : null);
      }
      return;
    }

    const willRevealBoth = (card === 'show' && activeShowTell === 'tell') || (card === 'tell' && activeShowTell === 'show');

    if (willRevealBoth) {
      setIsComputing(true);
      setComputingCard('both');
      setTimeout(() => {
        setActiveShowTell('both');
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
            <div className="text-center mb-8">
              <motion.div 
                className="inline-flex items-center gap-3 mb-4"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <motion.div 
                  className="flex items-center justify-center w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 overflow-hidden"
                  animate={{ scale: [1, 1.05, 1] }}
                  transition={{ duration: 2, repeat: Infinity, repeatDelay: 1 }}
                >
                  <img src={showTrustImage} alt="Show Trust" className="w-full h-full object-cover" />
                </motion.div>
                <h2 
                  className="text-2xl md:text-3xl lg:text-4xl font-bold text-white"
                  style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                >
                  Show <span className="text-slate-500 font-normal mx-1 md:mx-2">vs</span> Tell
                </h2>
                <motion.div 
                  className="flex items-center justify-center w-10 h-10 rounded-xl bg-violet-500/15 border border-violet-500/30 overflow-hidden"
                  animate={{ scale: [1, 1.05, 1] }}
                  transition={{ duration: 2, repeat: Infinity, repeatDelay: 1, delay: 0.5 }}
                >
                  <img src={tellTrustImage} alt="Tell Trust" className="w-full h-full object-cover" />
                </motion.div>
              </motion.div>
              <p className="text-sm text-slate-400 max-w-md mx-auto mb-3">
                {mode === 'normal' 
                  ? "Two fundamental ways to express trust in a decentralized network."
                  : "Implicit behavioral signals vs explicit semantic attestations."}
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2 mb-2">
                {activeShowTell !== 'both' && !computingCard && (
                  <motion.button
                    onClick={() => {
                      setIsComputing(true);
                      setComputingCard('both');
                      setTimeout(() => {
                        setActiveShowTell('both');
                        setTimeout(() => {
                          setIsComputing(false);
                          setComputingCard(null);
                        }, 400);
                      }, 600);
                    }}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-500/20 via-indigo-500/20 to-violet-500/20 border border-indigo-500/30 rounded-full hover:border-indigo-400/50 transition-all"
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.98 }}
                    animate={{ 
                      boxShadow: ['0 0 0 0 rgba(99, 102, 241, 0)', '0 0 12px rgba(99, 102, 241, 0.2)', '0 0 0 0 rgba(99, 102, 241, 0)']
                    }}
                    transition={{ duration: 2, repeat: Infinity }}
                  >
                    <CompareIcon className="w-4 h-4 text-indigo-400" />
                    <span className="text-[11px] font-medium text-white">Reveal Both</span>
                  </motion.button>
                )}
                {activeShowTell === 'both' && (
                  <motion.button
                    onClick={() => setActiveShowTell(null)}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800/60 border border-slate-600/50 rounded-full hover:border-slate-500/50 transition-all"
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
              className="relative bg-gradient-to-br from-slate-900 via-slate-950 to-indigo-950 border border-indigo-500/30 rounded-3xl p-8 backdrop-blur-xl max-w-3xl mx-auto overflow-hidden"
              initial={{ 
                boxShadow: '0 8px 40px rgba(99, 102, 241, 0.2), 0 0 80px rgba(139, 92, 246, 0.15), inset 0 1px 0 rgba(255,255,255,0.05)'
              }}
              whileHover={{ 
                boxShadow: '0 12px 50px rgba(99, 102, 241, 0.3), 0 0 100px rgba(139, 92, 246, 0.2), inset 0 1px 0 rgba(255,255,255,0.08)'
              }}
              transition={{ duration: 0.4 }}
            >
              {/* Deep space gradient overlay */}
              <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/20 via-violet-900/10 to-purple-900/20 pointer-events-none" />
              
              {/* Star field particles */}
              {[...Array(30)].map((_, i) => (
                <motion.div
                  key={i}
                  className="absolute w-0.5 h-0.5 bg-white rounded-full pointer-events-none"
                  style={{
                    left: `${(i * 37 + 10) % 100}%`,
                    top: `${(i * 23 + 5) % 100}%`,
                  }}
                  animate={{ 
                    opacity: [0.2, 0.8, 0.2],
                    scale: [0.8, 1.2, 0.8]
                  }}
                  transition={{ 
                    duration: 2 + (i % 3), 
                    repeat: Infinity, 
                    delay: i * 0.15,
                    ease: "easeInOut"
                  }}
                />
              ))}
              
              {/* Floating mathematical symbols */}
              {['∫', 'Σ', 'α', 'π', '∞', 'Δ', 'λ', '∂'].map((sym, i) => (
                <motion.span
                  key={i}
                  className="absolute text-indigo-400/20 font-mono pointer-events-none select-none"
                  style={{
                    left: `${10 + (i * 12)}%`,
                    top: `${15 + (i * 10) % 70}%`,
                    fontSize: `${12 + (i % 3) * 6}px`
                  }}
                  animate={{ 
                    opacity: [0.1, 0.3, 0.1],
                    y: [0, -8, 0],
                    rotate: [0, 5, 0]
                  }}
                  transition={{ 
                    duration: 6 + i, 
                    repeat: Infinity, 
                    delay: i * 0.8,
                    ease: "easeInOut"
                  }}
                >
                  {sym}
                </motion.span>
              ))}
              
              {/* Nebula glow orbs */}
              <motion.div 
                className="absolute -top-32 -right-32 w-72 h-72 bg-gradient-to-br from-violet-500/25 to-purple-600/20 rounded-full blur-3xl pointer-events-none"
                animate={{ opacity: [0.3, 0.6, 0.3], scale: [1, 1.2, 1], x: [0, 15, 0], y: [0, -15, 0] }}
                transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
              />
              <motion.div 
                className="absolute -bottom-32 -left-32 w-72 h-72 bg-gradient-to-br from-indigo-500/20 to-blue-600/25 rounded-full blur-3xl pointer-events-none"
                animate={{ opacity: [0.3, 0.6, 0.3], scale: [1, 1.2, 1], x: [0, -15, 0], y: [0, 15, 0] }}
                transition={{ duration: 8, repeat: Infinity, ease: "easeInOut", delay: 4 }}
              />
              <motion.div 
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-gradient-radial from-indigo-500/15 via-violet-500/10 to-transparent rounded-full blur-2xl pointer-events-none"
                animate={{ opacity: [0.2, 0.4, 0.2], scale: [0.9, 1.15, 0.9] }}
                transition={{ duration: 10, repeat: Infinity, ease: "easeInOut", delay: 2 }}
              />
              
              {/* Computation grid overlay */}
              <div 
                className="absolute inset-0 opacity-[0.06] pointer-events-none"
                style={{
                  backgroundImage: 'linear-gradient(rgba(139, 92, 246, 0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(139, 92, 246, 0.4) 1px, transparent 1px)',
                  backgroundSize: '30px 30px'
                }}
              />
              
              {/* Glowing edge lines */}
              <div className="absolute top-0 left-1/4 right-1/4 h-px bg-gradient-to-r from-transparent via-violet-400/50 to-transparent" />
              <div className="absolute bottom-0 left-1/3 right-1/3 h-px bg-gradient-to-r from-transparent via-indigo-400/40 to-transparent" />
              
              {/* Animated corner brackets */}
              <motion.div 
                className="absolute top-4 right-4 w-16 h-16 border-t-2 border-r-2 border-violet-400/40 rounded-tr-2xl pointer-events-none"
                animate={{ opacity: [0.3, 0.7, 0.3] }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
              />
              <motion.div 
                className="absolute bottom-4 left-4 w-16 h-16 border-b-2 border-l-2 border-indigo-400/40 rounded-bl-2xl pointer-events-none"
                animate={{ opacity: [0.3, 0.7, 0.3] }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut", delay: 2 }}
              />
              
              <div className="relative z-10 sm:flex sm:items-center sm:justify-center gap-2 mb-6">
                {/* Mobile: 3 on first row, 2 centered on second row */}
                <div className="grid grid-cols-3 gap-2 sm:hidden mb-2">
                  {trustScenarios.slice(0, 3).map((s, i) => {
                    const IconComponent = s.icon === 'users' ? Users : s.icon === 'briefcase' ? Briefcase : s.icon === 'music' ? Music : s.icon === 'heart' ? Heart : Compass;
                    const isActive = selectedScenario === i;
                    return (
                      <motion.button
                        key={s.id}
                        onClick={() => handleScenarioChange(i)}
                        className={`relative flex items-center justify-center gap-1.5 px-2 py-2 rounded-xl text-[10px] font-semibold transition-all ${
                          isActive 
                            ? 'bg-gradient-to-r from-violet-600 to-indigo-600 border border-violet-400/50 text-white shadow-lg shadow-violet-500/30' 
                            : 'bg-slate-800/60 border border-slate-600/50 text-slate-300 hover:text-white hover:border-violet-400/50 hover:bg-slate-700/60'
                        }`}
                        whileHover={{ scale: 1.05, y: -2 }}
                        whileTap={{ scale: 0.97 }}
                        style={isActive ? { boxShadow: '0 4px 20px rgba(139, 92, 246, 0.4), inset 0 1px 0 rgba(255,255,255,0.15)' } : { boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)' }}
                      >
                        {isActive && (
                          <motion.div 
                            className="absolute inset-0 rounded-xl bg-gradient-to-r from-violet-500/20 to-indigo-500/20"
                            layoutId="activeScenario"
                            transition={{ type: "spring", stiffness: 400, damping: 30 }}
                          />
                        )}
                        <IconComponent className={`w-3.5 h-3.5 relative z-10 ${isActive ? 'text-blue-100' : ''}`} />
                        <span className="relative z-10">{s.label}</span>
                      </motion.button>
                    );
                  })}
                </div>
                <div className="flex justify-center gap-2 sm:hidden">
                  {trustScenarios.slice(3).map((s, idx) => {
                    const i = idx + 3;
                    const IconComponent = s.icon === 'users' ? Users : s.icon === 'briefcase' ? Briefcase : s.icon === 'music' ? Music : s.icon === 'heart' ? Heart : Compass;
                    const isActive = selectedScenario === i;
                    return (
                      <motion.button
                        key={s.id}
                        onClick={() => handleScenarioChange(i)}
                        className={`relative flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-[10px] font-semibold transition-all ${
                          isActive 
                            ? 'bg-gradient-to-r from-violet-600 to-indigo-600 border border-violet-400/50 text-white shadow-lg shadow-violet-500/30' 
                            : 'bg-slate-800/60 border border-slate-600/50 text-slate-300 hover:text-white hover:border-violet-400/50 hover:bg-slate-700/60'
                        }`}
                        whileHover={{ scale: 1.05, y: -2 }}
                        whileTap={{ scale: 0.97 }}
                        style={isActive ? { boxShadow: '0 4px 20px rgba(139, 92, 246, 0.4), inset 0 1px 0 rgba(255,255,255,0.15)' } : { boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)' }}
                      >
                        {isActive && (
                          <motion.div 
                            className="absolute inset-0 rounded-xl bg-gradient-to-r from-violet-500/20 to-indigo-500/20"
                            layoutId="activeScenario"
                            transition={{ type: "spring", stiffness: 400, damping: 30 }}
                          />
                        )}
                        <IconComponent className={`w-3.5 h-3.5 relative z-10 ${isActive ? 'text-blue-100' : ''}`} />
                        <span className="relative z-10">{s.label}</span>
                      </motion.button>
                    );
                  })}
                </div>
                {/* Desktop: all in one row */}
                <div className="hidden sm:flex sm:items-center sm:justify-center gap-2">
                  {trustScenarios.map((s, i) => {
                    const IconComponent = s.icon === 'users' ? Users : s.icon === 'briefcase' ? Briefcase : s.icon === 'music' ? Music : s.icon === 'heart' ? Heart : Compass;
                    const isActive = selectedScenario === i;
                    return (
                      <motion.button
                        key={s.id}
                        onClick={() => handleScenarioChange(i)}
                        className={`relative flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                          isActive 
                            ? 'bg-gradient-to-r from-violet-600 to-indigo-600 border border-violet-400/50 text-white shadow-lg shadow-violet-500/30' 
                            : 'bg-slate-800/60 border border-slate-600/50 text-slate-300 hover:text-white hover:border-violet-400/50 hover:bg-slate-700/60'
                        }`}
                        whileHover={{ scale: 1.05, y: -2 }}
                        whileTap={{ scale: 0.97 }}
                        style={isActive ? { boxShadow: '0 4px 20px rgba(139, 92, 246, 0.4), inset 0 1px 0 rgba(255,255,255,0.15)' } : { boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)' }}
                      >
                        {isActive && (
                          <motion.div 
                            className="absolute inset-0 rounded-xl bg-gradient-to-r from-violet-500/20 to-indigo-500/20"
                            layoutId="activeScenario"
                            transition={{ type: "spring", stiffness: 400, damping: 30 }}
                          />
                        )}
                        <IconComponent className={`w-3.5 h-3.5 relative z-10 ${isActive ? 'text-blue-100' : ''}`} />
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
                  className="relative z-10 flex items-center justify-between sm:justify-center sm:gap-4 mb-4 sm:mb-6"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.3, ease: "easeOut" }}
                >
                  <motion.div 
                    className="flex-1 sm:flex-initial flex items-center gap-2 sm:gap-3 bg-slate-800/70 border border-slate-600/50 rounded-xl sm:rounded-2xl px-2.5 sm:px-4 py-2 sm:py-3"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 }}
                    style={{ boxShadow: '0 4px 16px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05)' }}
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
                        className="relative w-8 h-8 sm:w-10 sm:h-10 rounded-full border-2 border-emerald-400/80 object-cover shadow-lg shadow-emerald-500/30"
                      />
                      <motion.div 
                        className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 sm:w-3 sm:h-3 bg-gradient-to-br from-emerald-400 to-emerald-500 rounded-full border-2 border-slate-900"
                        animate={{ scale: [1, 1.2, 1] }}
                        transition={{ duration: 2, repeat: Infinity }}
                      />
                    </div>
                    <div className="text-left">
                      <p className="text-xs sm:text-sm font-semibold text-white">{scenario.personA.name}</p>
                      <p className="text-[9px] sm:text-[10px] text-emerald-400 font-medium">{scenario.personA.role}</p>
                    </div>
                  </motion.div>
                  
                  <motion.div 
                    className="hidden sm:flex flex-col items-center gap-1 px-4 flex-shrink-0"
                    initial={{ opacity: 0, scale: 0 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.2, type: "spring", stiffness: 300 }}
                  >
                    <div className="flex items-center gap-1">
                      <motion.div 
                        className="w-8 h-0.5 bg-gradient-to-r from-emerald-400/70 to-cyan-400/70 rounded-full"
                        animate={{ opacity: [0.5, 1, 0.5] }}
                        transition={{ duration: 2, repeat: Infinity }}
                      />
                      <motion.div 
                        className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500/30 to-indigo-500/30 border border-violet-400/50 flex items-center justify-center"
                        animate={{ rotate: [0, 360] }}
                        transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                        style={{ boxShadow: '0 0 20px rgba(139, 92, 246, 0.35)' }}
                      >
                        <NetworkWebIcon className="w-4 h-4 text-violet-400" />
                      </motion.div>
                      <motion.div 
                        className="w-8 h-0.5 bg-gradient-to-r from-indigo-400/70 to-violet-400/70 rounded-full"
                        animate={{ opacity: [0.5, 1, 0.5] }}
                        transition={{ duration: 2, repeat: Infinity, delay: 0.5 }}
                      />
                    </div>
                    <span className="text-[9px] text-slate-400 font-medium">trust network</span>
                  </motion.div>
                  <span className="text-slate-500 sm:hidden flex-shrink-0 px-1">→</span>
                  
                  <motion.div 
                    className="flex-1 sm:flex-initial flex items-center justify-end gap-2 sm:gap-3 bg-slate-800/70 border border-slate-600/50 rounded-xl sm:rounded-2xl px-2.5 sm:px-4 py-2 sm:py-3"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 }}
                    style={{ boxShadow: '0 4px 16px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05)' }}
                  >
                    <div className="text-right">
                      <p className="text-xs sm:text-sm font-semibold text-white">{scenario.personB.name}</p>
                      <p className="text-[9px] sm:text-[10px] text-violet-400 font-medium">{scenario.personB.role}</p>
                    </div>
                    <div className="relative flex-shrink-0">
                      <motion.div 
                        className="absolute inset-0 rounded-full bg-gradient-to-br from-violet-400/50 to-purple-400/40 blur-md"
                        animate={{ opacity: [0.5, 0.9, 0.5] }}
                        transition={{ duration: 3, repeat: Infinity, delay: 1.5 }}
                      />
                      <img 
                        src={scenario.personB.avatar} 
                        alt={scenario.personB.name} 
                        className="relative w-8 h-8 sm:w-10 sm:h-10 rounded-full border-2 border-violet-400/80 object-cover shadow-lg shadow-violet-500/30"
                      />
                      <motion.div 
                        className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 sm:w-3 sm:h-3 bg-gradient-to-br from-violet-400 to-violet-500 rounded-full border-2 border-slate-900"
                        animate={{ scale: [1, 1.2, 1] }}
                        transition={{ duration: 2, repeat: Infinity, delay: 0.5 }}
                      />
                    </div>
                  </motion.div>
                </motion.div>
              </AnimatePresence>

              <div className="relative z-10 grid md:grid-cols-2 gap-4">
                <AnimatePresence>
                  {isComputing && (
                    <motion.div
                      className="absolute inset-0 z-20 flex items-center justify-center bg-slate-900/95 backdrop-blur-sm rounded-xl"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.4, ease: "easeInOut" }}
                    >
                      <div className="flex flex-col items-center gap-3">
                        <div className="flex items-center gap-2">
                          {['Σ', '∫', 'α', '×', 'T(u)', '→'].map((sym, i) => (
                            <motion.span
                              key={i}
                              className="text-lg font-mono"
                              style={{ color: i % 2 === 0 ? '#a78bfa' : '#818cf8' }}
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: [0, 1, 1, 0], y: [10, 0, 0, -10] }}
                              transition={{ 
                                duration: 0.8, 
                                delay: i * 0.1,
                                times: [0, 0.2, 0.8, 1]
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
                            className="w-1.5 h-1.5 bg-violet-400 rounded-full"
                            animate={{ scale: [1, 1.5, 1], opacity: [0.5, 1, 0.5] }}
                            transition={{ duration: 0.4, repeat: 2 }}
                          />
                          <span className="text-[10px] text-slate-400 font-mono">recalculating trust scores...</span>
                        </motion.div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
                
                <motion.button
                  onClick={() => handleCardReveal('show')}
                  animate={{ 
                    opacity: (computingCard === 'show' || computingCard === 'both') ? 0.3 : 1, 
                    filter: (computingCard === 'show' || computingCard === 'both') ? 'blur(2px)' : 'blur(0px)' 
                  }}
                  transition={{ duration: 0.2 }}
                  className={`relative p-5 rounded-xl text-left transition-all overflow-hidden group ${
                    activeShowTell === 'show' || activeShowTell === 'both'
                      ? 'bg-emerald-900/30 border-2 border-emerald-400/50'
                      : 'bg-slate-800/50 border border-slate-600/50 hover:border-emerald-400/40 hover:bg-slate-800/70'
                  }`}
                  whileHover={{ scale: 1.02, y: -3 }}
                  whileTap={{ scale: 0.98 }}
                  style={{ 
                    boxShadow: activeShowTell === 'show' || activeShowTell === 'both' 
                      ? '0 4px 20px rgba(16, 185, 129, 0.25), inset 0 1px 0 rgba(255,255,255,0.05)' 
                      : 'inset 0 1px 0 rgba(255,255,255,0.03)' 
                  }}
                >
                  <AnimatePresence>
                    {computingCard === 'show' && (
                      <motion.div
                        className="absolute inset-0 z-20 flex items-center justify-center bg-slate-900/95 backdrop-blur-sm rounded-xl"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                      >
                        <div className="flex items-center gap-2">
                          {['Σ', '→', 'T(s)'].map((sym, i) => (
                            <motion.span
                              key={i}
                              className="text-base font-mono text-emerald-400"
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
                  {!(activeShowTell === 'show' || activeShowTell === 'both') && (
                    <motion.div 
                      className="absolute inset-0 rounded-xl pointer-events-none"
                      animate={{ 
                        boxShadow: ['inset 0 0 0 1px rgba(16, 185, 129, 0)', 'inset 0 0 0 2px rgba(16, 185, 129, 0.4)', 'inset 0 0 0 1px rgba(16, 185, 129, 0)']
                      }}
                      transition={{ duration: 2, repeat: Infinity, repeatDelay: 1 }}
                    />
                  )}
                  {(activeShowTell === 'show' || activeShowTell === 'both') && (
                    <motion.div 
                      className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-emerald-500 to-transparent"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                    />
                  )}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <motion.div 
                        className="w-9 h-9 rounded-lg bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center overflow-hidden"
                        animate={!(activeShowTell === 'show' || activeShowTell === 'both') ? { scale: [1, 1.08, 1] } : {}}
                        transition={{ duration: 1.5, repeat: Infinity, repeatDelay: 0.5 }}
                      >
                        <img src={showTrustImage} alt="Show Trust" className="w-full h-full object-cover" />
                      </motion.div>
                      <div>
                        <span className="text-sm font-semibold text-white block">Show Trust</span>
                        <span className="text-[10px] text-emerald-400">Behavioral signals</span>
                      </div>
                    </div>
                    {!(activeShowTell === 'show' || activeShowTell === 'both') && (
                      <motion.div
                        className="flex items-center gap-1 px-2 py-1 bg-emerald-500/15 border border-emerald-400/30 rounded-full"
                        animate={{ opacity: [0.7, 1, 0.7] }}
                        transition={{ duration: 1.5, repeat: Infinity }}
                      >
                        <span className="text-[9px] text-emerald-400 font-medium">Tap to reveal</span>
                        <ChevronRight className="w-3 h-3 text-emerald-400" />
                      </motion.div>
                    )}
                  </div>
                  <AnimatePresence mode="popLayout">
                    {(activeShowTell === 'show' || activeShowTell === 'both') ? (
                      <motion.div
                        key={`show-${scenario.id}`}
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="space-y-2.5"
                      >
                        {scenario.showActions.map((action, idx) => {
                          const IconComponent = action.icon === 'heart' ? FollowHeartIcon : action.icon === 'zap' ? ZapBoltIcon : RepostIcon;
                          const colorClass = action.color === 'emerald' ? 'text-emerald-400' : action.color === 'amber' ? 'text-amber-400' : 'text-sky-400';
                          return (
                            <div key={idx} className="flex items-center gap-2.5 text-xs text-slate-300">
                              <IconComponent className={`w-4 h-4 ${colorClass} flex-shrink-0`} />
                              <span>{action.text}</span>
                            </div>
                          );
                        })}
                        <div className="pt-3 mt-3 border-t border-emerald-500/30 flex items-start gap-2">
                          <ActionProofIcon className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                          <p className="text-[10px] text-slate-400 leading-relaxed">{scenario.showInsight}</p>
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
                          <div className="w-5 h-5 rounded-full bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center">
                            <FollowHeartIcon className="w-2.5 h-2.5 text-emerald-400" />
                          </div>
                          <div className="w-5 h-5 rounded-full bg-amber-500/20 border border-amber-400/40 flex items-center justify-center">
                            <ZapBoltIcon className="w-2.5 h-2.5 text-amber-400" />
                          </div>
                          <div className="w-5 h-5 rounded-full bg-sky-500/20 border border-sky-400/40 flex items-center justify-center">
                            <RepostIcon className="w-2.5 h-2.5 text-sky-400" />
                          </div>
                        </div>
                        <span className="text-[11px] text-slate-400">{scenario.showActions.length} action types</span>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.button>

                <motion.button
                  onClick={() => handleCardReveal('tell')}
                  animate={{ 
                    opacity: (computingCard === 'tell' || computingCard === 'both') ? 0.3 : 1, 
                    filter: (computingCard === 'tell' || computingCard === 'both') ? 'blur(2px)' : 'blur(0px)' 
                  }}
                  transition={{ duration: 0.2 }}
                  className={`relative p-5 rounded-xl text-left transition-all overflow-hidden group ${
                    activeShowTell === 'tell' || activeShowTell === 'both'
                      ? 'bg-violet-900/30 border-2 border-violet-400/50'
                      : 'bg-slate-800/50 border border-slate-600/50 hover:border-violet-400/40 hover:bg-slate-800/70'
                  }`}
                  whileHover={{ scale: 1.02, y: -3 }}
                  whileTap={{ scale: 0.98 }}
                  style={{ 
                    boxShadow: activeShowTell === 'tell' || activeShowTell === 'both' 
                      ? '0 4px 20px rgba(139, 92, 246, 0.25), inset 0 1px 0 rgba(255,255,255,0.05)' 
                      : 'inset 0 1px 0 rgba(255,255,255,0.03)' 
                  }}
                >
                  <AnimatePresence>
                    {computingCard === 'tell' && (
                      <motion.div
                        className="absolute inset-0 z-20 flex items-center justify-center bg-slate-900/95 backdrop-blur-sm rounded-xl"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                      >
                        <div className="flex items-center gap-2">
                          {['α', '×', 'A(t)'].map((sym, i) => (
                            <motion.span
                              key={i}
                              className="text-base font-mono text-violet-400"
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
                  {!(activeShowTell === 'tell' || activeShowTell === 'both') && (
                    <motion.div 
                      className="absolute inset-0 rounded-xl pointer-events-none"
                      animate={{ 
                        boxShadow: ['inset 0 0 0 1px rgba(139, 92, 246, 0)', 'inset 0 0 0 2px rgba(139, 92, 246, 0.4)', 'inset 0 0 0 1px rgba(139, 92, 246, 0)']
                      }}
                      transition={{ duration: 2, repeat: Infinity, repeatDelay: 1, delay: 0.5 }}
                    />
                  )}
                  {(activeShowTell === 'tell' || activeShowTell === 'both') && (
                    <motion.div 
                      className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-violet-500 to-transparent"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                    />
                  )}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <motion.div 
                        className="w-9 h-9 rounded-lg bg-violet-500/20 border border-violet-400/40 flex items-center justify-center overflow-hidden"
                        animate={!(activeShowTell === 'tell' || activeShowTell === 'both') ? { scale: [1, 1.08, 1] } : {}}
                        transition={{ duration: 1.5, repeat: Infinity, repeatDelay: 0.5, delay: 0.3 }}
                      >
                        <img src={tellTrustImage} alt="Tell Trust" className="w-full h-full object-cover" />
                      </motion.div>
                      <div>
                        <span className="text-sm font-semibold text-white block">Tell Trust</span>
                        <span className="text-[10px] text-violet-400">Explicit attestations</span>
                      </div>
                    </div>
                    {!(activeShowTell === 'tell' || activeShowTell === 'both') && (
                      <motion.div
                        className="flex items-center gap-1 px-2 py-1 bg-violet-500/15 border border-violet-400/30 rounded-full"
                        animate={{ opacity: [0.7, 1, 0.7] }}
                        transition={{ duration: 1.5, repeat: Infinity, delay: 0.3 }}
                      >
                        <span className="text-[9px] text-violet-400 font-medium">Tap to reveal</span>
                        <ChevronRight className="w-3 h-3 text-violet-400" />
                      </motion.div>
                    )}
                  </div>
                  <AnimatePresence mode="popLayout">
                    {(activeShowTell === 'tell' || activeShowTell === 'both') ? (
                      <motion.div
                        key={`tell-${scenario.id}`}
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="space-y-2.5"
                      >
                        {scenario.tellActions.map((action, idx) => {
                          const IconComponent = action.icon === 'quote' ? QuoteBubbleIcon : action.icon === 'star' ? StarRatingIcon : TagLabelIcon;
                          return (
                            <div key={idx} className="flex items-center gap-2.5 text-xs text-slate-300">
                              <IconComponent className="w-4 h-4 text-violet-400 flex-shrink-0" />
                              <span>{action.text}</span>
                            </div>
                          );
                        })}
                        <div className="pt-3 mt-3 border-t border-violet-500/30 flex items-start gap-2">
                          <ExplicitContextIcon className="w-4 h-4 text-violet-400 flex-shrink-0 mt-0.5" />
                          <p className="text-[10px] text-slate-400 leading-relaxed">{scenario.tellInsight}</p>
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
                          <div className="w-5 h-5 rounded-full bg-violet-500/20 border border-violet-400/40 flex items-center justify-center">
                            <QuoteBubbleIcon className="w-2.5 h-2.5 text-violet-400" />
                          </div>
                          <div className="w-5 h-5 rounded-full bg-violet-500/20 border border-violet-400/40 flex items-center justify-center">
                            <StarRatingIcon className="w-2.5 h-2.5 text-violet-400" />
                          </div>
                          <div className="w-5 h-5 rounded-full bg-violet-500/20 border border-violet-400/40 flex items-center justify-center">
                            <TagLabelIcon className="w-2.5 h-2.5 text-violet-400" />
                          </div>
                        </div>
                        <span className="text-[11px] text-slate-400">{scenario.tellActions.length} attestation types</span>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.button>
              </div>

              {activeShowTell === 'both' && (
                <motion.div 
                  className="relative z-10 mt-5 pt-4 border-t border-indigo-500/30"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <div className="text-center mb-4">
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-indigo-500/15 border border-indigo-400/30 rounded-full">
                      <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-pulse" />
                      <p className="text-[10px] text-indigo-300 font-medium">
                        When Show + Tell combine, real-world applications unlock
                      </p>
                    </div>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-3">
                    {scenario.applications.map((app, idx) => (
                      <motion.div
                        key={idx}
                        className="bg-slate-800/60 border border-slate-600/50 rounded-lg p-4 group hover:border-indigo-400/50 transition-colors"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 + idx * 0.1 }}
                        style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)' }}
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-6 h-6 rounded-md bg-indigo-500/20 border border-indigo-400/40 flex items-center justify-center">
                            <NetworkWebIcon className="w-3 h-3 text-indigo-400" />
                          </div>
                          <h4 className="text-xs font-semibold text-white">{app.title}</h4>
                        </div>
                        <p className="text-[11px] text-slate-400 leading-relaxed">{app.description}</p>
                      </motion.div>
                    ))}
                  </div>
                  
                  <motion.div 
                    className="mt-6 pt-5 border-t border-indigo-500/20"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4, type: "spring", stiffness: 300 }}
                  >
                    <div className="flex items-center justify-center gap-2 mb-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-amber-400/60" />
                      <span className="text-[9px] uppercase tracking-widest text-amber-400/80 font-medium">The Outcome</span>
                      <div className="w-1.5 h-1.5 rounded-full bg-amber-400/60" />
                    </div>
                    <p className="text-sm text-slate-300 text-center leading-relaxed max-w-lg mx-auto">
                      {scenario.id === 'social' && "Genuine connections compound. Alice discovered Bob through a friend's zap — now they're building together."}
                      {scenario.id === 'business' && "Trust reduces friction. The startup found a vetted agency through their network — shipped faster, paid in sats."}
                      {scenario.id === 'music' && "Discovery travels through trust. A friend's endorsement led to a new favorite artist — value flowed back to the creator."}
                      {scenario.id === 'recommendations' && "Quality surfaces organically. The foodie's recommendation became dinner — the restaurant earned a loyal regular."}
                      {scenario.id === 'wellness' && "Healing happens outside the system. When insurance gatekeepers said no, Marcus found Dr. Chen through someone who'd walked the same path — and got his life back."}
                    </p>
                    <div className="flex justify-center mt-4">
                      <img src="/nostr-ostrich.gif" alt="Ostrich running" className="w-7 h-7 object-contain" />
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </motion.div>
          </motion.div>
  );
}
