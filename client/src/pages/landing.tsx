import { useLocation } from 'wouter';
import { ArrowRight, Info } from 'lucide-react';
import { useState, useEffect } from 'react';
import { Footer } from '@/components/Footer';
import { ComputingBackground } from '@/components/ComputingBackground';
import { handleLogin } from '@/services/nostr';

const mathChars = "∑∏∫∂∇×÷±√∞≈≠≤≥αβγδεζηθλμπσφψω0123456789";
const algorithmWord = "algorithm";

function AlgorithmText() {
  const [displayText, setDisplayText] = useState(algorithmWord);
  const [isScrambling, setIsScrambling] = useState(false);
  
  useEffect(() => {
    const scrambleInterval = setInterval(() => {
      setIsScrambling(true);
      let iteration = 0;
      const maxIterations = 20;
      
      const scramble = setInterval(() => {
        setDisplayText(
          algorithmWord
            .split("")
            .map((char, index) => {
              if (iteration > index * 1.5) {
                return algorithmWord[index];
              }
              return mathChars[Math.floor(Math.random() * mathChars.length)];
            })
            .join("")
        );
        
        iteration += 1;
        if (iteration >= maxIterations) {
          clearInterval(scramble);
          setDisplayText(algorithmWord);
          setIsScrambling(false);
        }
      }, 120);
    }, 6000);
    
    return () => clearInterval(scrambleInterval);
  }, []);
  
  return (
    <span 
      className={`font-mono transition-all duration-200 ${
        isScrambling 
          ? "text-indigo-400" 
          : "text-slate-400"
      }`}
    >
      {displayText}
    </span>
  );
}

function FadingText() {
  const [isVisible, setIsVisible] = useState(true);
  
  useEffect(() => {
    const fadeInterval = setInterval(() => {
      setIsVisible(prev => !prev);
    }, 3500);
    
    return () => clearInterval(fadeInterval);
  }, []);
  
  return (
    <span 
      className={`transition-opacity duration-[2000ms] ease-in-out ${
        isVisible ? "opacity-100" : "opacity-0"
      }`}
    >
      you can't see.
    </span>
  );
}

export default function Landing() {
  const [, setLocation] = useLocation();
  const [signingIn, setSigningIn] = useState(false);

  const onSignIn = async () => {
    if (signingIn) return;
    setSigningIn(true);
    try {
      await handleLogin();
      setLocation('/dashboard');
    } catch {
      setSigningIn(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col relative overflow-hidden">
      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>

      <div className="flex-1 flex items-center justify-center p-4 sm:p-6 relative">
        <ComputingBackground />
        
        <div 
          className="max-w-4xl w-full relative z-10 px-6"
          style={{ animation: 'fadeIn 0.4s ease-out' }}
        >
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
            <div 
              className="text-center lg:text-left"
              style={{ animation: 'fadeInUp 0.5s ease-out 0.1s both' }}
            >
              <div 
                className="flex flex-col sm:flex-row items-center lg:items-start gap-4 sm:gap-5 group/brand cursor-pointer relative transition-transform duration-300 hover:scale-[1.02]"
              >
                <div className="absolute -inset-8 bg-gradient-to-r from-indigo-500/0 via-violet-500/0 to-indigo-500/0 group-hover/brand:from-indigo-500/10 group-hover/brand:via-violet-500/15 group-hover/brand:to-indigo-500/10 blur-3xl rounded-full opacity-0 group-hover/brand:opacity-100 transition-all duration-700 pointer-events-none" />
                
                <div className="relative flex-shrink-0">
                  <div className="absolute inset-0 bg-indigo-500/20 blur-3xl rounded-full scale-[2] group-hover/brand:scale-[3] group-hover/brand:bg-indigo-400/30 transition-all duration-700" />
                  <div className="absolute inset-0 bg-violet-500/10 blur-2xl rounded-full scale-150 group-hover/brand:scale-[2] group-hover/brand:bg-violet-400/20 transition-all duration-500" />
                  <svg 
                    xmlns="http://www.w3.org/2000/svg" 
                    width="72" 
                    height="72" 
                    viewBox="0 0 24 24" 
                    fill="none" 
                    className="relative group-hover/brand:drop-shadow-[0_0_20px_rgba(129,140,248,0.6)] transition-all duration-500"
                  >
                    <g clipPath="url(#clip0_4418_4042)">
                      <path d="M13.75 10C14.3023 10 14.75 9.55228 14.75 9C14.75 8.44772 14.3023 8 13.75 8C13.1977 8 12.75 8.44772 12.75 9C12.75 9.55228 13.1977 10 13.75 10Z" stroke="#fff" strokeMiterlimit="10" />
                      <path d="M10.25 10C10.8 10 11.25 9.55 11.25 9C11.25 8.45 10.8 8 10.25 8" stroke="#fff" strokeMiterlimit="10" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M15.5 13C16.0523 13 16.5 12.5523 16.5 12C16.5 11.4477 16.0523 11 15.5 11C14.9477 11 14.5 11.4477 14.5 12C14.5 12.5523 14.9477 13 15.5 13Z" stroke="#fff" strokeMiterlimit="10" />
                      <path d="M17.1504 9.75C17.5646 9.75 17.9004 9.41421 17.9004 9C17.9004 8.58579 17.5646 8.25 17.1504 8.25C16.7362 8.25 16.4004 8.58579 16.4004 9C16.4004 9.41421 16.7362 9.75 17.1504 9.75Z" stroke="#fff" strokeMiterlimit="10" />
                      <path d="M17.1504 15.75C17.5646 15.75 17.9004 15.4142 17.9004 15C17.9004 14.5858 17.5646 14.25 17.1504 14.25C16.7362 14.25 16.4004 14.5858 16.4004 15C16.4004 15.4142 16.7362 15.75 17.1504 15.75Z" stroke="#fff" strokeMiterlimit="10" />
                      <path d="M19.75 12.75C20.1642 12.75 20.5 12.4142 20.5 12C20.5 11.5858 20.1642 11.25 19.75 11.25C19.3358 11.25 19 11.5858 19 12C19 12.4142 19.3358 12.75 19.75 12.75Z" stroke="#fff" strokeMiterlimit="10" />
                      <path d="M6.80078 9.75C7.21499 9.75 7.55078 9.41421 7.55078 9C7.55078 8.58579 7.21499 8.25 6.80078 8.25C6.38657 8.25 6.05078 8.58579 6.05078 9C6.05078 9.41421 6.38657 9.75 6.80078 9.75Z" stroke="#fff" strokeMiterlimit="10" />
                      <path d="M6.80078 15.75C7.21499 15.75 7.55078 15.4142 7.55078 15C7.55078 14.5858 7.21499 14.25 6.80078 14.25C6.38657 14.25 6.05078 14.5858 6.05078 15C6.05078 15.4142 6.38657 15.75 6.80078 15.75Z" stroke="#fff" strokeMiterlimit="10" />
                      <path d="M4.19922 12.75C4.61343 12.75 4.94922 12.4142 4.94922 12C4.94922 11.5858 4.61343 11.25 4.19922 11.25C3.78501 11.25 3.44922 11.5858 3.44922 12C3.44922 12.4142 3.78501 12.75 4.19922 12.75Z" stroke="#fff" strokeMiterlimit="10" />
                      <path d="M15.9004 5.94922C16.3146 5.94922 16.6504 5.61343 16.6504 5.19922C16.6504 4.78501 16.3146 4.44922 15.9004 4.44922C15.4862 4.44922 15.1504 4.78501 15.1504 5.19922C15.1504 5.61343 15.4862 5.94922 15.9004 5.94922Z" stroke="#fff" strokeMiterlimit="10" />
                      <path d="M8.09961 5.94922C8.51382 5.94922 8.84961 5.61343 8.84961 5.19922C8.84961 4.78501 8.51382 4.44922 8.09961 4.44922C7.6854 4.44922 7.34961 4.78501 7.34961 5.19922C7.34961 5.61343 7.6854 5.94922 8.09961 5.94922Z" stroke="#fff" strokeMiterlimit="10" />
                      <path d="M12.0508 6.75C12.465 6.75 12.8008 6.41421 12.8008 6C12.8008 5.58579 12.465 5.25 12.0508 5.25C11.6366 5.25 11.3008 5.58579 11.3008 6C11.3008 6.41421 11.6366 6.75 12.0508 6.75Z" stroke="#fff" strokeMiterlimit="10" />
                      <path d="M15.9004 19.75C16.3146 19.75 16.6504 19.4142 16.6504 19C16.6504 18.5858 16.3146 18.25 15.9004 18.25C15.4862 18.25 15.1504 18.5858 15.1504 19C15.1504 19.4142 15.4862 19.75 15.9004 19.75Z" stroke="#fff" strokeMiterlimit="10" />
                      <path d="M8.84961 19C8.84961 19.41 8.50961 19.75 8.09961 19.75C7.68961 19.75 7.34961 19.41 7.34961 19" stroke="#fff" strokeMiterlimit="10" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M12.0508 18.9492C12.465 18.9492 12.8008 18.6134 12.8008 18.1992C12.8008 17.785 12.465 17.4492 12.0508 17.4492C11.6366 17.4492 11.3008 17.785 11.3008 18.1992C11.3008 18.6134 11.6366 18.9492 12.0508 18.9492Z" stroke="#fff" strokeMiterlimit="10" />
                      <path d="M8.5 13C9.05228 13 9.5 12.5523 9.5 12C9.5 11.4477 9.05228 11 8.5 11C7.94772 11 7.5 11.4477 7.5 12C7.5 12.5523 7.94772 13 8.5 13Z" stroke="#fff" strokeMiterlimit="10" />
                      <path d="M10.25 16C10.8023 16 11.25 15.5523 11.25 15C11.25 14.4477 10.8023 14 10.25 14C9.69772 14 9.25 14.4477 9.25 15C9.25 15.5523 9.69772 16 10.25 16Z" stroke="#fff" strokeMiterlimit="10" />
                      <path d="M14.75 15C14.75 14.45 14.3 14 13.75 14C13.2 14 12.75 14.45 12.75 15" stroke="#fff" strokeMiterlimit="10" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M11.9492 2.5V2.5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M17.4492 2.90039V2.90039" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M17.4492 21.25V21.25" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M19.9492 16.5508V16.5508" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M19.9492 7.05078V7.05078" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M3.94922 16.5508V16.5508" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M3.94922 7.05078V7.05078" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M6.44922 2.90039V2.90039" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M6.44922 21.25V21.25" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M11.9492 21.5508V21.5508" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M1.5 12.0508V12.0508" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M22.4492 12.0508V12.0508" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </g>
                    <defs>
                      <clipPath id="clip0_4418_4042">
                        <rect width="24" height="24" fill="white"/>
                      </clipPath>
                    </defs>
                  </svg>
                </div>
                <div className="flex flex-col items-center sm:items-start lg:items-start">
                  <h1 
                    className="text-4xl sm:text-5xl lg:text-6xl font-bold bg-gradient-to-r from-white via-indigo-200 to-violet-300 bg-clip-text text-transparent leading-none drop-shadow-[0_0_25px_rgba(129,140,248,0.3)]"
                    data-testid="text-title"
                    style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                  >
                    Brainstorm
                  </h1>
                  <p className="text-slate-300 font-medium tracking-wide uppercase mt-2 text-sm sm:text-base lg:text-[18px]">
                    Web of Trust for Nostr
                  </p>
                  <div className="flex flex-col items-center sm:items-start gap-2 mt-4">
                    <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                      <div className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-slate-800/50 border border-slate-700/40 rounded-full text-[10px] text-slate-400">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-indigo-400">
                          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
                          <circle cx="9" cy="7" r="4"/>
                          <path d="M22 21v-2a4 4 0 0 0-3-3.87"/>
                          <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                        </svg>
                        <span className="tabular-nums font-medium" data-testid="text-identity-count">12,453</span>
                      </div>
                      <div className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-slate-800/50 border border-slate-700/40 rounded-full text-[10px] text-slate-400">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-violet-400">
                          <rect width="20" height="8" x="2" y="2" rx="2" ry="2"/>
                          <rect width="20" height="8" x="2" y="14" rx="2" ry="2"/>
                          <line x1="6" x2="6.01" y1="6" y2="6"/>
                          <line x1="6" x2="6.01" y1="18" y2="18"/>
                        </svg>
                        <span className="tabular-nums font-medium" data-testid="text-relay-count">847</span>
                      </div>
                      <div className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-slate-800/50 border border-slate-700/40 rounded-full text-[10px] text-slate-400">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-400">
                          <circle cx="12" cy="12" r="1"/>
                          <circle cx="12" cy="5" r="1"/>
                          <circle cx="12" cy="19" r="1"/>
                          <circle cx="5" cy="12" r="1"/>
                          <circle cx="19" cy="12" r="1"/>
                          <line x1="12" y1="6" x2="12" y2="11"/>
                          <line x1="12" y1="13" x2="12" y2="18"/>
                          <line x1="6" y1="12" x2="11" y2="12"/>
                          <line x1="13" y1="12" x2="18" y2="12"/>
                        </svg>
                        <span className="tabular-nums font-medium" data-testid="text-connection-count">2.1M</span>
                      </div>
                    </div>
                    <div className="opacity-0 group-hover/brand:opacity-100 transition-all duration-500 delay-200 pointer-events-none mt-1 text-center sm:text-center">
                      <p className="text-[9px] text-slate-500 italic tracking-wide inline-flex items-center gap-1.5">
                        <span className="text-indigo-400 not-italic">∑</span> Mathematical computation → digital clarity
                        <svg 
                          width="12" 
                          height="12" 
                          viewBox="0 0 24 24" 
                          fill="none" 
                          className="inline-block drop-shadow-[0_0_4px_rgba(129,140,248,0.6)] animate-pulse"
                          style={{ animationDuration: '3s' }}
                        >
                          <circle cx="12" cy="12" r="4" stroke="#818cf8" strokeWidth="1.5"/>
                          <circle cx="12" cy="6" r="1.5" stroke="#818cf8" strokeWidth="1"/>
                          <circle cx="12" cy="18" r="1.5" stroke="#818cf8" strokeWidth="1"/>
                          <circle cx="6" cy="12" r="1.5" stroke="#818cf8" strokeWidth="1"/>
                          <circle cx="18" cy="12" r="1.5" stroke="#818cf8" strokeWidth="1"/>
                          <line x1="12" y1="8" x2="12" y2="7.5" stroke="#818cf8" strokeWidth="1"/>
                          <line x1="12" y1="16.5" x2="12" y2="16" stroke="#818cf8" strokeWidth="1"/>
                          <line x1="8" y1="12" x2="7.5" y2="12" stroke="#818cf8" strokeWidth="1"/>
                          <line x1="16.5" y1="12" x2="16" y2="12" stroke="#818cf8" strokeWidth="1"/>
                        </svg>
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div 
              className="relative bg-slate-900/70 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-6 sm:p-8 shadow-2xl shadow-indigo-500/20 ring-1 ring-indigo-500/10 w-full max-w-md mx-auto lg:mx-0 group/card transition-transform duration-300 hover:scale-[1.01]"
              style={{ animation: 'fadeInUp 0.5s ease-out 0.2s both' }}
            >
              <div className="absolute -inset-2 bg-gradient-to-r from-indigo-500/0 via-violet-500/0 to-indigo-500/0 group-hover/card:from-indigo-500/10 group-hover/card:via-violet-500/15 group-hover/card:to-indigo-500/10 blur-xl rounded-3xl opacity-0 group-hover/card:opacity-100 transition-all duration-700 pointer-events-none -z-10" />
              <h2 
                className="text-3xl sm:text-4xl font-bold text-white mb-3 leading-tight"
                data-testid="text-headline"
                style={{ fontFamily: "'Space Grotesk', sans-serif" }}
              >
                Your Network.<br /><span className="text-indigo-400">Your Rules.</span>
              </h2>
              <button
                onClick={() => setLocation('/what-is-wot')}
                className="absolute top-5 right-5 sm:top-7 sm:right-7 px-2.5 py-1 text-[11px] font-medium text-slate-400 hover:text-indigo-300 bg-slate-800/50 hover:bg-slate-700/70 border border-slate-700/50 hover:border-indigo-500/30 rounded-md opacity-0 group-hover/card:opacity-100 transition-all duration-300 cursor-pointer flex items-center gap-1.5 backdrop-blur-sm"
                data-testid="button-what-is-wot-tooltip"
              >
                <Info className="h-3 w-3" />
                <span>WoT?</span>
              </button>
              <p 
                className="text-base text-slate-400 leading-relaxed mb-6"
                data-testid="text-description"
              >
                Build trust scores from your own connections — not an <AlgorithmText /> <FadingText />
              </p>

              <div className="flex flex-col gap-3 group/signin">
                <button
                  className="relative px-6 py-3 text-base font-medium text-white bg-indigo-600 hover:bg-indigo-100 hover:text-indigo-900 rounded-lg transition-all duration-300 inline-flex items-center justify-center gap-2 w-full overflow-hidden group cursor-pointer active:scale-[0.98] disabled:opacity-50"
                  onClick={onSignIn}
                  disabled={signingIn}
                  data-testid="button-sign-in-hero"
                >
                  <span className="absolute inset-0 bg-gradient-to-r from-indigo-400/0 via-indigo-400/30 to-indigo-400/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
                  <span className="relative">{signingIn ? 'Signing In...' : 'Sign In'}</span>
                  <ArrowRight className="h-5 w-5 relative group-hover:translate-x-0.5 transition-transform" />
                  <img 
                    src="/nostr-ostrich.gif" 
                    alt="Nostr" 
                    className="absolute right-14 top-1/2 -translate-y-1/2 h-7 w-auto opacity-0 group-hover:opacity-100 transition-all duration-300" 
                  />
                </button>
                
                <div className="h-0 opacity-0 group-hover/card:h-8 group-hover/card:opacity-100 transition-all duration-300 ease-out overflow-hidden flex items-center justify-center">
                  <button
                    onClick={() => setLocation('/what-is-wot')}
                    className="text-sm font-medium text-indigo-400 hover:text-indigo-300 flex items-center gap-2 transition-colors cursor-pointer"
                    data-testid="button-what-is-wot-card"
                  >
                    <Info className="h-4 w-4" />
                    What is Web of Trust?
                  </button>
                </div>
              </div>

              <p className="text-xs text-slate-500 text-center mt-5">
                No password required. <span className="text-slate-300">Just your <a href="https://nostr.how/en/what-is-nostr" target="_blank" rel="noopener noreferrer" className="group-hover/card:text-violet-400 hover:underline transition-colors duration-300 cursor-pointer" data-testid="link-nostr-info">Nostr</a> access.</span>
              </p>
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
