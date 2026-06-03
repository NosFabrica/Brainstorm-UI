import { useState } from 'react';
import { motion } from 'framer-motion';

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
              <div className="text-center mb-8">
                <h2 
                  className="text-2xl font-bold text-white mb-2"
                  style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                >
                  Interactive Parameter Tuning
                </h2>
                <p className="text-sm text-slate-400">
                  See how different settings affect trust propagation
                </p>
              </div>

              <div 
                className="relative bg-gradient-to-br from-indigo-500/15 via-slate-900/95 to-violet-500/15 border border-indigo-500/40 rounded-2xl p-6 backdrop-blur-md max-w-3xl mx-auto overflow-hidden"
                style={{ 
                  boxShadow: '0 12px 48px rgba(99, 102, 241, 0.25), 0 24px 80px rgba(139, 92, 246, 0.15), 0 0 0 1px rgba(99, 102, 241, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.07)'
                }}
              >
                {/* Background effects */}
                <div className="absolute inset-0 bg-gradient-to-br from-slate-950/80 via-slate-950/60 to-slate-950/80" />
                <motion.div 
                  className="absolute -top-20 -right-20 w-48 h-48 bg-gradient-to-br from-emerald-500/20 to-cyan-500/15 rounded-full blur-3xl pointer-events-none"
                  animate={{ opacity: [0.3, 0.5, 0.3], scale: [1, 1.15, 1] }}
                  transition={{ duration: 5, repeat: Infinity }}
                />
                <motion.div 
                  className="absolute -bottom-16 -left-16 w-40 h-40 bg-gradient-to-br from-violet-500/15 to-indigo-500/20 rounded-full blur-3xl pointer-events-none"
                  animate={{ opacity: [0.3, 0.5, 0.3], scale: [1.1, 1, 1.1] }}
                  transition={{ duration: 5, repeat: Infinity, delay: 2.5 }}
                />
                
                {/* Top accent */}
                <motion.div 
                  className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-1 bg-gradient-to-r from-transparent via-emerald-500 to-transparent rounded-full"
                  animate={{ opacity: [0.4, 0.8, 0.4] }}
                  transition={{ duration: 2, repeat: Infinity }}
                />
                
                {/* Computation grid */}
                <div 
                  className="absolute inset-0 opacity-[0.04] pointer-events-none"
                  style={{
                    backgroundImage: 'linear-gradient(rgba(16, 185, 129, 0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(16, 185, 129, 0.5) 1px, transparent 1px)',
                    backgroundSize: '24px 24px'
                  }}
                />

                <div className="relative z-10">
                  {/* Brief smart explanation - dynamic */}
                  <div className="text-center mb-5">
                    <p className="text-[11px] text-slate-400 max-w-md mx-auto leading-relaxed">
                      Trust decays exponentially: each hop multiplies by <span className="font-mono text-emerald-400">α</span>. 
                      At <span className="font-mono text-emerald-400">α={attenuation.toFixed(2)}</span> over <span className="font-mono text-violet-400">{hops} hop{hops > 1 ? 's' : ''}</span>, 
                      {hops === 1 ? ' a direct friend' : hops === 2 ? ' a friend-of-friend' : ` a ${hops}-hop connection`} contributes <motion.span 
                        className="font-mono text-indigo-400"
                        key={`${attenuation}-${hops}`}
                        initial={{ opacity: 0.5 }}
                        animate={{ opacity: 1 }}
                      >{Math.round(Math.pow(attenuation, hops) * 100)}%</motion.span> of direct trust.
                    </p>
                  </div>
                  
                  {/* Compact controls row */}
                  <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center justify-center gap-3 sm:gap-6 mb-6">
                    {/* Attenuation control */}
                    <div className="flex items-center justify-between sm:justify-start gap-3 px-3 py-2 rounded-xl bg-slate-950/25 border border-slate-700/40" data-testid="control-attenuation">
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[10px] font-mono text-slate-500">α =</span>
                        <motion.span
                          className="text-lg font-mono font-bold text-emerald-400"
                          key={attenuation}
                          initial={{ scale: 1.2, color: '#34d399' }}
                          animate={{ scale: 1, color: '#34d399' }}
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
                        className="w-40 sm:w-24 h-2 bg-slate-700/70 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                        data-testid="range-attenuation"
                      />
                    </div>

                    {/* Hops control */}
                    <div className="flex items-center justify-between sm:justify-start gap-3 px-3 py-2 rounded-xl bg-slate-950/25 border border-slate-700/40" data-testid="control-hops">
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[10px] font-mono text-slate-500">d =</span>
                        <motion.span
                          className="text-lg font-mono font-bold text-violet-400"
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
                        className="w-40 sm:w-20 h-2 bg-slate-700/70 rounded-lg appearance-none cursor-pointer accent-violet-500"
                        data-testid="range-hops"
                      />
                    </div>
                  </div>

                  {/* Visual decay chain */}
                  <div className="flex items-center justify-center gap-1 mb-5 flex-wrap">
                    {Array.from({ length: hops + 1 }, (_, i) => {
                      const score = Math.pow(attenuation, i);
                      const size = 32 + (1 - i / Math.max(hops, 1)) * 10;
                      return (
                        <div key={i} className="flex items-center shrink-0">
                          <motion.div
                            className="flex flex-col items-center"
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: i * 0.08 }}
                          >
                            <motion.div 
                              className="rounded-full flex items-center justify-center font-mono text-[10px] font-bold border-2 relative overflow-hidden"
                              style={{ 
                                width: size, 
                                height: size,
                                borderColor: i === 0 ? 'rgba(52, 211, 153, 0.6)' : `rgba(139, 92, 246, ${0.6 - i * 0.1})`,
                                background: i === 0 
                                  ? 'linear-gradient(135deg, rgba(52, 211, 153, 0.2), rgba(16, 185, 129, 0.1))'
                                  : `linear-gradient(135deg, rgba(139, 92, 246, ${0.2 - i * 0.03}), rgba(99, 102, 241, ${0.1 - i * 0.02}))`
                              }}
                              animate={{ 
                                boxShadow: i === 0 
                                  ? ['0 0 12px rgba(52, 211, 153, 0.3)', '0 0 20px rgba(52, 211, 153, 0.5)', '0 0 12px rgba(52, 211, 153, 0.3)']
                                  : undefined
                              }}
                              transition={{ duration: 2, repeat: Infinity }}
                            >
                              <span className={i === 0 ? 'text-emerald-400' : 'text-violet-300'}>
                                {score.toFixed(2)}
                              </span>
                            </motion.div>
                            <span className="text-[8px] text-slate-500 mt-1">
                              {i === 0 ? 'you' : `h${i}`}
                            </span>
                          </motion.div>
                          {i < hops && (
                            <motion.div 
                              className="flex items-center mx-1"
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              transition={{ delay: i * 0.08 + 0.05 }}
                            >
                              <motion.div
                                className="w-4 h-px bg-gradient-to-r from-violet-500/60 to-violet-500/30"
                                animate={{ opacity: [0.4, 0.8, 0.4] }}
                                transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.2 }}
                              />
                              <span className="text-[8px] text-slate-600 mx-0.5">×α</span>
                              <motion.div
                                className="w-4 h-px bg-gradient-to-r from-violet-500/30 to-violet-500/60"
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
                  <div className="grid grid-cols-1 sm:flex sm:items-center sm:justify-center gap-2 sm:gap-4 pt-4 border-t border-slate-700/40">
                    <div className="flex items-center justify-between sm:justify-start gap-2 px-3 py-2 bg-slate-800/50 rounded-lg border border-slate-700/30">
                      <span className="text-[9px] text-slate-500">T(u) at d={hops}</span>
                      <motion.span
                        className="text-sm font-mono font-bold text-indigo-400"
                        key={`${attenuation}-${hops}`}
                        initial={{ color: '#818cf8' }}
                        animate={{ color: '#a5b4fc' }}
                        transition={{ duration: 0.3 }}
                      >
                        {Math.pow(attenuation, hops).toFixed(4)}
                      </motion.span>
                    </div>

                    <div className="hidden sm:block w-px h-4 bg-slate-700/50" />

                    <div className="flex items-center justify-between sm:justify-start gap-2 px-3 py-2 bg-slate-800/50 rounded-lg border border-slate-700/30">
                      <span className="text-[9px] text-slate-500">reach</span>
                      <span className="text-sm font-mono text-amber-400/80">
                        ~{Math.pow(150, hops).toLocaleString()}
                      </span>
                    </div>

                    <div className="hidden sm:block w-px h-4 bg-slate-700/50" />

                    <div className="flex items-center justify-between sm:justify-start gap-2 px-3 py-2 bg-slate-800/50 rounded-lg border border-slate-700/30 overflow-x-auto">
                      <span className="text-[9px] text-slate-500 shrink-0">formula</span>
                      <span className="text-[10px] font-mono text-slate-300 whitespace-nowrap">
                        α<sup>d</sup> = {attenuation}<sup>{hops}</sup>
                      </span>
                    </div>
                  </div>
                </div>
                
                {/* Bottom decorative element */}
                <motion.div 
                  className="absolute bottom-0 left-1/2 -translate-x-1/2 w-24 h-px bg-gradient-to-r from-transparent via-emerald-500/40 to-transparent"
                  animate={{ opacity: [0.3, 0.6, 0.3] }}
                  transition={{ duration: 2, repeat: Infinity }}
                />
              </div>
            </motion.div>
  );
}
