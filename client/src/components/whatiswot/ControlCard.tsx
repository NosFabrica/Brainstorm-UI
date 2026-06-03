import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight } from 'lucide-react';
import { KeyControlIcon, ShowEyeIcon, NetworkWebIcon, TunerIcon } from '@/components/WotIcons';
import networkBg from '@assets/generated_images/abstract_network_web_background.png';
import { trustNodeInfo, type UserMode } from './data';

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
              className="relative bg-gradient-to-br from-indigo-500/15 via-slate-900/95 to-violet-500/15 border border-indigo-500/40 rounded-2xl p-6 backdrop-blur-md max-w-3xl mx-auto overflow-hidden"
              style={{ 
                boxShadow: '0 12px 48px rgba(99, 102, 241, 0.25), 0 24px 80px rgba(139, 92, 246, 0.15), 0 0 0 1px rgba(99, 102, 241, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.07)'
              }}
            >
              <div 
                className="absolute inset-0 opacity-20"
                style={{ 
                  backgroundImage: `url(${networkBg})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                }}
              />
              <div className="absolute inset-0 bg-gradient-to-br from-slate-950/80 via-slate-950/60 to-slate-950/80" />
              <motion.div 
                className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-1 bg-gradient-to-r from-transparent via-indigo-500 to-transparent rounded-full"
                initial={{ opacity: 0.4 }}
                animate={{ opacity: (selectedTrustNode !== null || selectedFeature !== null) ? 1 : 0.4 }}
                transition={{ duration: 0.3 }}
              />
              
              <div className="relative z-10 text-center mb-4">
                <h2 className="font-bold text-white mb-2 text-[24px]" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                  You Are In Control
                </h2>
                <p className="text-xs text-slate-400 max-w-md mx-auto">
                  {mode === 'normal'
                    ? "You decide how trust flows. Closer connections = more trust."
                    : "Algorithmic sovereignty: inspect, adjust, and export every parameter."}
                </p>
              </div>

              {mode === 'normal' ? (
                <div className="relative z-10">
                  <div className="flex items-center justify-center gap-2 sm:gap-3 py-4">
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
                            animate={{ x: selectedTrustNode === null ? [0, 3, 0] : 0, opacity: selectedTrustNode !== null && selectedTrustNode < i ? 0.2 : 1 }}
                            transition={{ duration: 1.5, repeat: selectedTrustNode === null ? Infinity : 0, delay: i * 0.2 }}
                          >
                            <ChevronRight className={`w-3 h-3 ${node.textColor} opacity-40`} />
                          </motion.div>
                        )}
                        <motion.div 
                          className={`flex flex-col items-center group cursor-pointer ${selectedTrustNode === i ? 'z-10' : ''}`}
                          onMouseEnter={() => setSelectedTrustNode(i)}
                          onMouseLeave={() => setSelectedTrustNode(null)}
                          whileHover={{ scale: 1.15, y: -4 }}
                          animate={{ 
                            opacity: selectedTrustNode !== null && selectedTrustNode !== i ? 0.4 : 1
                          }}
                        >
                          <motion.div 
                            className={`${node.size} rounded-full overflow-hidden shadow-lg ${node.glow} transition-all relative`}
                            animate={{ 
                              boxShadow: selectedTrustNode === i ? '0 0 25px rgba(99, 102, 241, 0.6)' : undefined
                            }}
                          >
                            <AnimatePresence mode="wait">
                              {selectedTrustNode === i ? (
                                <motion.img
                                  key="image"
                                  src={node.image}
                                  alt={node.label}
                                  className={`w-full h-full object-cover border-2 ${node.borderColor} rounded-full`}
                                  initial={{ opacity: 0, scale: 1.2 }}
                                  animate={{ opacity: 1, scale: 1 }}
                                  exit={{ opacity: 0, scale: 0.8 }}
                                  transition={{ duration: 0.2 }}
                                />
                              ) : (
                                <motion.div
                                  key="label"
                                  className={`w-full h-full bg-gradient-to-br ${node.color} flex items-center justify-center text-white font-semibold text-[10px]`}
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
                          <span className={`text-[9px] ${node.textColor} mt-1 opacity-70 group-hover:opacity-100 transition-opacity`}>{node.trust}</span>
                        </motion.div>
                      </motion.div>
                    ))}
                  </div>
                  
                  <div className="h-20 flex flex-col items-center justify-center mt-1 mb-2 mx-4">
                    <AnimatePresence mode="wait">
                      {selectedTrustNode !== null ? (
                        <motion.div
                          key={selectedTrustNode}
                          initial={{ opacity: 0, scale: 0.9, y: -10 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.9, y: -10 }}
                          transition={{ duration: 0.2, type: "spring", stiffness: 400, damping: 25 }}
                          className="text-center max-w-sm px-4 py-2 bg-slate-800/95 backdrop-blur-sm rounded-lg border border-indigo-500/20"
                          style={{ 
                            boxShadow: '0 0 15px rgba(99, 102, 241, 0.15)'
                          }}
                        >
                          <p className="text-xs text-slate-200 leading-relaxed">
                            {trustNodeInfo[selectedTrustNode].explanation}
                          </p>
                          <p className="text-[10px] text-indigo-400 mt-1 font-medium">
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
                          <KeyControlIcon className="w-6 h-6 text-indigo-400/60" />
                          <p className="text-[10px] text-slate-500">
                            <span className="text-indigo-400/80 hidden sm:inline">Hover</span><span className="text-indigo-400/80 sm:hidden">Tap</span> to explore trust decay
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
                      { label: 'T(u)', sub: 'Score', color: 'indigo', expanded: 'Final trust score for user u — computed recursively from your graph\'s edge structure. Aggregates weighted contributions from all connected paths.', insight: 'Output range [0,1] normalized via softmax' },
                      { label: '=', color: 'slate', isOperator: true },
                      { label: 'Σ', sub: 'paths', color: 'violet', expanded: 'Summation over all valid paths from you to target user. Handles cycles via convergence bounds and path deduplication.', insight: 'Max path depth configurable (default: 6 hops)' },
                      { label: '×', color: 'slate', isOperator: true },
                      { label: 'α^d', sub: 'decay', color: 'emerald', expanded: 'Attenuation factor α raised to hop depth d. Each hop multiplies trust by α, so distant connections contribute less. You control α.', insight: 'Typical values: 0.5 (strict) to 0.85 (trusting)' },
                      { label: '×', color: 'slate', isOperator: true },
                      { label: 'w_ij', sub: 'weight', color: 'amber', expanded: 'Edge weight between nodes i→j. Derived from explicit attestations (follows, endorsements) plus implicit behavioral signals (interactions, replies).', insight: 'Weights stored as signed events on relays' },
                    ].map((item, i) => {
                      const formulaIndex = item.isOperator ? -1 : [0, 1, 2, 3].filter((_, idx) => idx === Math.floor(i / 2))[0];
                      const actualIndex = i === 0 ? 0 : i === 2 ? 1 : i === 4 ? 2 : i === 6 ? 3 : -1;
                      return item.isOperator ? (
                        <span key={i} className="text-slate-500 text-sm px-0.5">{item.label}</span>
                      ) : (
                        <motion.div 
                          key={i}
                          className={`rounded-lg px-2.5 py-1.5 text-center relative cursor-pointer transition-all ${
                            selectedFormula === actualIndex 
                              ? `bg-${item.color}-500/25 border border-${item.color}-400/50` 
                              : `bg-${item.color}-500/20 border border-${item.color}-500/30 hover:bg-${item.color}-500/25`
                          }`}
                          onMouseEnter={() => setSelectedFormula(actualIndex)}
                          onMouseLeave={() => setSelectedFormula(null)}
                          whileHover={{ scale: 1.08, y: -2 }}
                          animate={{ 
                            opacity: selectedFormula !== null && selectedFormula !== actualIndex ? 0.5 : 1
                          }}
                        >
                          <motion.span 
                            className={`text-sm font-mono font-bold text-${item.color}-400`}
                            animate={{ 
                              scale: selectedFormula === actualIndex ? [1, 1.1, 1] : 1
                            }}
                            transition={{ duration: 0.3 }}
                          >
                            {item.label}
                          </motion.span>
                          {item.sub && <span className="text-[9px] text-slate-500 block">{item.sub}</span>}
                        </motion.div>
                      );
                    })}
                  </div>
                  
                  {/* Expanded formula explanation */}
                  <div className="relative z-10 min-h-[4.5rem] flex items-center justify-center mt-1 mb-2 mx-4">
                    <AnimatePresence mode="wait">
                      {selectedFormula !== null ? (
                        <motion.div
                          key={selectedFormula}
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          transition={{ duration: 0.2 }}
                          className="text-center max-w-md px-4 py-2.5 bg-slate-800/95 backdrop-blur-sm rounded-lg border border-indigo-500/20"
                          style={{ 
                            boxShadow: '0 0 15px rgba(99, 102, 241, 0.15)'
                          }}
                        >
                          <p className="text-xs text-slate-200 leading-relaxed">
                            {[
                              { expanded: 'Final trust score for user u — computed recursively from your graph\'s edge structure. Aggregates weighted contributions from all connected paths.', insight: 'Output range [0,1] normalized via softmax' },
                              { expanded: 'Summation over all valid paths from you to target user. Handles cycles via convergence bounds and path deduplication.', insight: 'Max path depth configurable (default: 6 hops)' },
                              { expanded: 'Attenuation factor α raised to hop depth d. Each hop multiplies trust by α, so distant connections contribute less. You control α.', insight: 'Typical values: 0.5 (strict) to 0.85 (trusting)' },
                              { expanded: 'Edge weight between nodes i→j. Derived from explicit attestations (follows, endorsements) plus implicit behavioral signals.', insight: 'Weights stored as signed events on relays' },
                            ][selectedFormula].expanded}
                          </p>
                          <p className="text-[10px] text-indigo-400 mt-1.5 font-medium">
                            ✦ {[
                              { insight: 'Output range [0,1] normalized via softmax' },
                              { insight: 'Max path depth configurable (default: 6 hops)' },
                              { insight: 'Typical values: 0.5 (strict) to 0.85 (trusting)' },
                              { insight: 'Weights stored as signed events on relays' },
                            ][selectedFormula].insight}
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
                          <KeyControlIcon className="w-6 h-6 text-indigo-400/60" />
                          <p className="text-[10px] text-slate-500">
                            <span className="text-indigo-400/80 hidden sm:inline">Hover</span><span className="text-indigo-400/80 sm:hidden">Tap</span> to explore the formula
                          </p>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </>
              )}

              <div className="relative z-10 grid grid-cols-3 gap-2 pt-3 border-t border-slate-700/30">
                {[
                  { 
                    Icon: ShowEyeIcon, 
                    label: 'Transparent', 
                    desc: 'See exactly how scores are calculated',
                    expanded: mode === 'normal' 
                      ? "No black boxes. Every trust score shows its path: who vouched for whom, at what strength, through how many hops. You can trace exactly why someone has a 0.72 or a 0.31."
                      : "Full computation audit trail via NIP-XX. Export your score derivations as JSON. Verify calculations locally with open-source reference implementation."
                  },
                  { 
                    Icon: TunerIcon, 
                    label: 'Adjustable', 
                    desc: 'Tune settings to match your style',
                    expanded: mode === 'normal'
                      ? "Cautious by nature? Increase decay. Trust freely? Lower it. Your graph, your rules. Different contexts can have different settings — strict for finance, relaxed for music."
                      : "Configure hop decay factor (α), maximum path depth, attestation weighting curves, and context-specific trust domains. All parameters stored in your local profile."
                  },
                  { 
                    Icon: NetworkWebIcon, 
                    label: 'Portable', 
                    desc: 'Take your trust graph anywhere',
                    expanded: mode === 'normal'
                      ? "Your trust network isn't locked in one app. Export it, import it elsewhere, or let multiple apps read from the same source. Your reputation travels with you."
                      : "Standards-based export via NIP-XX. Interoperable with any compliant Nostr client. Your social graph lives on relays you control, not corporate servers."
                  },
                ].map((item, i) => (
                  <motion.div
                    key={i}
                    className={`flex flex-col items-center text-center cursor-pointer transition-all rounded-xl px-2 py-2 ${
                      selectedFeature === i 
                        ? 'bg-indigo-500/15 border border-indigo-400/40' 
                        : 'hover:bg-slate-800/40'
                    }`}
                    onMouseEnter={() => setSelectedFeature(i)}
                    onMouseLeave={() => setSelectedFeature(null)}
                    whileHover={{ scale: 1.03, y: -2 }}
                    animate={{ 
                      opacity: selectedFeature !== null && selectedFeature !== i ? 0.5 : 1
                    }}
                  >
                    <motion.div
                      animate={{ 
                        scale: selectedFeature === i ? [1, 1.15, 1] : 1
                      }}
                      transition={{ duration: 0.3 }}
                    >
                      <item.Icon className={`w-4 h-4 mb-1 transition-colors ${selectedFeature === i ? 'text-indigo-300' : 'text-indigo-400'}`} />
                    </motion.div>
                    <span className={`text-[11px] font-medium transition-colors ${selectedFeature === i ? 'text-white' : 'text-slate-300'}`}>{item.label}</span>
                    <span className="text-[9px] text-slate-500 leading-tight mt-0.5">{item.desc}</span>
                  </motion.div>
                ))}
              </div>
              
              {/* Expanded feature explanation */}
              <div className="relative z-10 h-16 flex items-center justify-center mt-2 mx-4">
                <AnimatePresence mode="wait">
                  {selectedFeature !== null ? (
                    <motion.div
                      key={selectedFeature}
                      initial={{ opacity: 0, scale: 0.9, y: -10 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.9, y: -10 }}
                      transition={{ duration: 0.2, type: "spring", stiffness: 400, damping: 25 }}
                      className="text-center max-w-sm px-4 py-2 bg-slate-800/95 backdrop-blur-sm rounded-lg border border-indigo-500/20"
                      style={{ 
                        boxShadow: '0 0 15px rgba(99, 102, 241, 0.15)'
                      }}
                    >
                      <p className="text-xs text-slate-200 leading-relaxed">
                        {[
                          { 
                            expanded: mode === 'normal' 
                              ? "Every trust score shows its path: who vouched, at what strength, through how many hops."
                              : "Full audit trail via NIP-XX. Export derivations as JSON. Verify locally."
                          },
                          { 
                            expanded: mode === 'normal'
                              ? "Cautious? Increase decay. Trust freely? Lower it. Different contexts, different settings."
                              : "Configure decay factor, path depth, and weighting curves. Stored in your profile."
                          },
                          { 
                            expanded: mode === 'normal'
                              ? "Export your trust network, import elsewhere. Your reputation travels with you."
                              : "Standards-based export. Your graph lives on relays you control."
                          },
                        ][selectedFeature].expanded}
                      </p>
                    </motion.div>
                  ) : (
                    <motion.p 
                      className="text-[10px] text-slate-500"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: [0.4, 0.7, 0.4] }}
                      transition={{ duration: 2, repeat: Infinity }}
                    >
                      <span className="hidden sm:inline">Hover</span><span className="sm:hidden">Tap</span> to explore features
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
  );
}
