import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { useStore } from '@/lib/store';
import { 
  Shield, 
  Smartphone, 
  Key, 
  Globe, 
  ChevronDown, 
  ChevronUp, 
  Check, 
  Loader2,
  AlertCircle,
  ExternalLink,
  ArrowLeft,
  ArrowRight,
  Zap,
  Copy,
  Scan,
  X,
  Puzzle
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import QRCode from 'react-qr-code';

const floatingNodes = Array.from({ length: 12 }, (_, i) => ({
  id: i,
  x: 10 + Math.random() * 80,
  y: 10 + Math.random() * 80,
  size: Math.random() * 3 + 2,
  duration: Math.random() * 20 + 15,
  delay: Math.random() * 5,
}));

const connectionPairs = [
  [0, 3], [1, 4], [2, 5], [3, 6], [4, 7], [5, 8], [6, 9], [7, 10], [8, 11], [0, 6], [2, 8], [4, 10]
];

const calculations = [
  "npub1qx3f...verified",
  "trust_score: 0.94",
  "follows: 847",
  "wot_rank: #127",
  "relay: wss://nos.lol",
  "kind:3 → follows",
  "sig: schnorr✓",
  "hops: 2 → 0.73",
];

export default function SignIn() {
  const [location, setLocation] = useLocation();
  const { signInWithNpub } = useStore();
  
  // State for the UI mockup
  // 'default' = Initial state
  // 'consent' = User clicked Authenticate, showing consent
  // 'no-extension' = No extension found
  // 'signing-in' = Loading state
  const [uiState, setUiState] = useState<'default' | 'consent' | 'no-extension' | 'signing-in'>('default');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [consentGiven, setConsentGiven] = useState(false);
  const [showTrustedAssertions, setShowTrustedAssertions] = useState(false);
  const [infoPanel, setInfoPanel] = useState<null | 'why' | 'next'>(null);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [trustedAssertionsPanel, setTrustedAssertionsPanel] = useState<'provider' | 'ta'>('provider');
  const [showRemoteSigner, setShowRemoteSigner] = useState(false);
  const [activeTab, setActiveTab] = useState('remote-signer');

  const initialMode = (() => {
    try {
      const search = location.split('?')[1] || '';
      return new URLSearchParams(search).get('mode');
    } catch {
      return null;
    }
  })();

  useEffect(() => {
    // Landing page Sign In should take users directly to Login modal
    // (also default behavior if user lands here directly)
    setShowRemoteSigner(true);
    setActiveTab('extension');
  }, []);

  // Auto-expand advanced options if no extension
  useEffect(() => {
    if (uiState === 'no-extension') {
      setAdvancedOpen(true);
    }
  }, [uiState]);

  const handleAuthenticateClick = () => {
    if (uiState === 'no-extension') return;
    setShowRemoteSigner(true);
  };

  const handleModalClose = () => {
    setShowRemoteSigner(false);
    setUiState('consent');
    setConsentGiven(true);
  };

  const handleComputeNow = () => {
    if (!consentGiven) return;
    
    setUiState('signing-in');
    
    // Simulate network delay
    setTimeout(() => {
      // Use a fake npub for the mockup
      const fakeNpub = 'npub1sg6plzptd64u62a878hep2kev88swjh3tw00gjsfl8f237lmu63q0uf63m';
      signInWithNpub(fakeNpub);
      useStore.getState().initializeNetwork();
      setLocation('/dashboard');
    }, 2000);
  };

  const handleSignIn = () => {
    // Legacy handler kept for reference or direct calls
    handleAuthenticateClick();
  };

  // Mock function to toggle states for testing/demo purposes
  // In a real app, this would be determined by window.nostr check
  const toggleState = () => {
    setUiState(current => 
      current === 'default' ? 'no-extension' : 'default'
    );
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col relative overflow-hidden font-sans">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-indigo-900/20 via-slate-950 to-slate-950" />
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff03_1px,transparent_1px),linear-gradient(to_bottom,#ffffff03_1px,transparent_1px)] bg-[size:32px_32px]" />
      <motion.div
        className="absolute top-[10%] left-[15%] w-64 h-64 rounded-full bg-indigo-600/5 blur-3xl"
        animate={{
          opacity: [0.3, 0.6, 0.3],
          scale: [1, 1.2, 1],
          x: [0, 20, 0],
        }}
        transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute bottom-[20%] right-[10%] w-48 h-48 rounded-full bg-violet-600/5 blur-3xl"
        animate={{
          opacity: [0.2, 0.5, 0.2],
          scale: [1, 1.3, 1],
          y: [0, -15, 0],
        }}
        transition={{ duration: 15, repeat: Infinity, ease: "easeInOut", delay: 3 }}
      />
      <motion.div
        className="absolute top-[50%] right-[25%] w-32 h-32 rounded-full bg-blue-500/5 blur-2xl"
        animate={{
          opacity: [0.1, 0.4, 0.1],
          scale: [1, 1.4, 1],
        }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut", delay: 5 }}
      />
      <svg className="absolute inset-0 w-full h-full pointer-events-none">
        {connectionPairs.map(([a, b], i) => (
          <motion.line
            key={i}
            x1={`${floatingNodes[a].x}%`}
            y1={`${floatingNodes[a].y}%`}
            x2={`${floatingNodes[b].x}%`}
            y2={`${floatingNodes[b].y}%`}
            stroke="url(#lineGradient)"
            strokeWidth="0.5"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: [0, 0.3, 0] }}
            transition={{
              duration: 8,
              repeat: Infinity,
              delay: i * 0.8,
              ease: "easeInOut",
            }}
          />
        ))}
        <defs>
          <linearGradient id="lineGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#6366f1" />
            <stop offset="100%" stopColor="#8b5cf6" />
          </linearGradient>
        </defs>
      </svg>
      {floatingNodes.map((node) => (
        <motion.div
          key={node.id}
          className="absolute rounded-full bg-indigo-400"
          style={{
            left: `${node.x}%`,
            top: `${node.y}%`,
            width: node.size + 2,
            height: node.size + 2,
          }}
          animate={{
            y: [0, -40, 0],
            opacity: [0.2, 0.7, 0.2],
            scale: [1, 1.5, 1],
          }}
          transition={{
            duration: node.duration,
            repeat: Infinity,
            delay: node.delay,
            ease: "easeInOut",
          }}
        />
      ))}
      {calculations.map((calc, i) => (
        <motion.div
          key={i}
          className="absolute text-xs font-mono text-indigo-400 pointer-events-none select-none hidden md:block"
          style={{
            left: `${5 + (i % 4) * 25}%`,
            top: `${10 + Math.floor(i / 4) * 70}%`,
          }}
          animate={{
            opacity: [0, 0.4, 0],
            y: [0, -15, 0],
          }}
          transition={{
            duration: 6,
            repeat: Infinity,
            delay: i * 1.2,
            ease: "easeInOut",
          }}
        >
          {calc}
        </motion.div>
      ))}
      {/* Header */}
      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center justify-center p-4 relative z-10 pb-6 min-h-[calc(100dvh-72px)] sm:min-h-0">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
          className="w-full max-w-[500px] my-auto"
        >
          {/* Glass Card */}
          <div className="relative bg-slate-900/60 backdrop-blur-2xl border border-white/10 rounded-3xl p-8 shadow-[0_0_50px_-12px_rgba(79,70,229,0.3)] overflow-hidden isolate group/card w-full max-w-[420px] mx-auto">
            {/* Flare effects */}
            <div className="absolute -top-40 -left-40 w-80 h-80 bg-indigo-500/10 rounded-full blur-[60px] pointer-events-none group-hover/card:bg-indigo-500/20 transition-colors duration-700" />
            <div className="absolute -bottom-40 -right-40 w-80 h-80 bg-violet-500/10 rounded-full blur-[60px] pointer-events-none group-hover/card:bg-violet-500/20 transition-colors duration-700" />
            
            {/* Top highlight line */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-[300px] h-[1px] bg-gradient-to-r from-transparent via-indigo-400/50 to-transparent opacity-50 group-hover/card:opacity-100 group-hover/card:max-w-[400px] transition-all duration-700" />
            
            {/* Branding - Moved inside card */}
            <motion.div 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center justify-center group/brand relative mb-8"
            >
              {/* Compact Glow */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 bg-indigo-500/10 blur-[30px] rounded-full pointer-events-none -z-10 group-hover/brand:bg-indigo-500/20 transition-all duration-700" />
              
              <motion.div 
                className="flex flex-col items-center gap-3 cursor-pointer"
                whileHover={{ scale: 1.02 }}
                transition={{ type: "spring", stiffness: 400, damping: 25 }}
                onClick={() => setLocation('/')}
              >
                {/* Logo & Title Lockup */}
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <div className="absolute inset-0 bg-indigo-500/30 blur-xl rounded-full scale-110 opacity-0 group-hover/brand:opacity-50 transition-all duration-500" />
                    <motion.svg 
                      width="36" 
                      height="36" 
                      viewBox="0 0 24 24" 
                      fill="none" 
                      className="relative text-white drop-shadow-[0_0_10px_rgba(129,140,248,0.3)]"
                    >
                       <g clipPath="url(#clip0_signin)">
                        <path d="M13.75 10C14.3023 10 14.75 9.55228 14.75 9C14.75 8.44772 14.3023 8 13.75 8C13.1977 8 12.75 8.44772 12.75 9C12.75 9.55228 13.1977 10 13.75 10Z" stroke="currentColor" strokeMiterlimit="10" />
                        <path d="M10.25 10C10.8 10 11.25 9.55 11.25 9C11.25 8.45 10.8 8 10.25 8" stroke="currentColor" strokeMiterlimit="10" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M15.5 13C16.0523 13 16.5 12.5523 16.5 12C16.5 11.4477 16.0523 11 15.5 11C14.9477 11 14.5 11.4477 14.5 12C14.5 12.5523 14.9477 13 15.5 13Z" stroke="currentColor" strokeMiterlimit="10" />
                        <path d="M17.1504 9.75C17.5646 9.75 17.9004 9.41421 17.9004 9C17.9004 8.58579 17.5646 8.25 17.1504 8.25C16.7362 8.25 16.4004 8.58579 16.4004 9C16.4004 9.41421 16.7362 9.75 17.1504 9.75Z" stroke="currentColor" strokeMiterlimit="10" />
                        <path d="M17.1504 15.75C17.5646 15.75 17.9004 15.4142 17.9004 15C17.9004 14.5858 17.5646 14.25 17.1504 14.25C16.7362 14.25 16.4004 14.5858 16.4004 15C16.4004 15.4142 16.7362 15.75 17.1504 15.75Z" stroke="currentColor" strokeMiterlimit="10" />
                        <path d="M19.75 12.75C20.1642 12.75 20.5 12.4142 20.5 12C20.5 11.5858 20.1642 11.25 19.75 11.25C19.3358 11.25 19 11.5858 19 12C19 12.4142 19.3358 12.75 19.75 12.75Z" stroke="currentColor" strokeMiterlimit="10" />
                        <path d="M6.80078 9.75C7.21499 9.75 7.55078 9.41421 7.55078 9C7.55078 8.58579 7.21499 8.25 6.80078 8.25C6.38657 8.25 6.05078 8.58579 6.05078 9C6.05078 9.41421 6.38657 9.75 6.80078 9.75Z" stroke="currentColor" strokeMiterlimit="10" />
                        <path d="M6.80078 15.75C7.21499 15.75 7.55078 15.4142 7.55078 15C7.55078 14.5858 7.21499 14.25 6.80078 14.25C6.38657 14.25 6.05078 14.5858 6.05078 15C6.05078 15.4142 6.38657 15.75 6.80078 15.75Z" stroke="currentColor" strokeMiterlimit="10" />
                        <path d="M4.19922 12.75C4.61343 12.75 4.94922 12.4142 4.94922 12C4.94922 11.5858 4.61343 11.25 4.19922 11.25C3.78501 11.25 3.44922 11.5858 3.44922 12C3.44922 12.4142 3.78501 12.75 4.19922 12.75Z" stroke="currentColor" strokeMiterlimit="10" />
                        <path d="M15.9004 5.94922C16.3146 5.94922 16.6504 5.61343 16.6504 5.19922C16.6504 4.78501 16.3146 4.44922 15.9004 4.44922C15.4862 4.44922 15.1504 4.78501 15.1504 5.19922C15.1504 5.61343 15.4862 5.94922 15.9004 5.94922Z" stroke="currentColor" strokeMiterlimit="10" />
                        <path d="M8.09961 5.94922C8.51382 5.94922 8.84961 5.61343 8.84961 5.19922C8.84961 4.78501 8.51382 4.44922 8.09961 4.44922C7.6854 4.44922 7.34961 4.78501 7.34961 5.19922C7.34961 5.61343 7.6854 5.94922 8.09961 5.94922Z" stroke="currentColor" strokeMiterlimit="10" />
                        <path d="M12.0508 6.75C12.465 6.75 12.8008 6.41421 12.8008 6C12.8008 5.58579 12.465 5.25 12.0508 5.25C11.6366 5.25 11.3008 5.58579 11.3008 6C11.3008 6.41421 11.6366 6.75 12.0508 6.75Z" stroke="currentColor" strokeMiterlimit="10" />
                        <path d="M15.9004 19.75C16.3146 19.75 16.6504 19.4142 16.6504 19C16.6504 18.5858 16.3146 18.25 15.9004 18.25C15.4862 18.25 15.1504 18.5858 15.1504 19C15.1504 19.4142 15.4862 19.75 15.9004 19.75Z" stroke="currentColor" strokeMiterlimit="10" />
                        <path d="M8.84961 19C8.84961 19.41 8.50961 19.75 8.09961 19.75C7.68961 19.75 7.34961 19.41 7.34961 19" stroke="currentColor" strokeMiterlimit="10" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M12.0508 18.9492C12.465 18.9492 12.8008 18.6134 12.8008 18.1992C12.8008 17.785 12.465 17.4492 12.0508 17.4492C11.6366 17.4492 11.3008 17.785 11.3008 18.1992C11.3008 18.6134 11.6366 18.9492 12.0508 18.9492Z" stroke="currentColor" strokeMiterlimit="10" />
                        <path d="M8.5 13C9.05228 13 9.5 12.5523 9.5 12C9.5 11.4477 9.05228 11 8.5 11C7.94772 11 7.5 11.4477 7.5 12C7.5 12.5523 7.94772 13 8.5 13Z" stroke="currentColor" strokeMiterlimit="10" />
                        <path d="M10.25 16C10.8023 16 11.25 15.5523 11.25 15C11.25 14.4477 10.8023 14 10.25 14C9.69772 14 9.25 14.4477 9.25 15C9.25 15.5523 9.69772 16 10.25 16Z" stroke="currentColor" strokeMiterlimit="10" />
                        <path d="M14.75 15C14.75 14.45 14.3 14 13.75 14C13.2 14 12.75 14.45 12.75 15" stroke="currentColor" strokeMiterlimit="10" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M11.9492 2.5V2.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M17.4492 2.90039V2.90039" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M17.4492 21.25V21.25" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M19.9492 16.5508V16.5508" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M19.9492 7.05078V7.05078" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M3.94922 16.5508V16.5508" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M3.94922 7.05078V7.05078" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M6.44922 2.90039V2.90039" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M6.44922 21.25V21.25" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M11.9492 21.5508V21.5508" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M1.5 12.0508V12.0508" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M22.4492 12.0508V12.0508" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </g>
                      <defs>
                        <clipPath id="clip0_signin">
                          <rect width="24" height="24" fill="white"/>
                        </clipPath>
                      </defs>
                    </motion.svg>
                  </div>
                  
                  <h1 
                    className="text-4xl font-bold bg-gradient-to-br from-white via-indigo-100 to-indigo-200/50 bg-clip-text text-transparent leading-none tracking-tight pb-1"
                    style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                  >
                    Brainstorm
                  </h1>
                </div>

                {/* Compact Tagline */}
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900/40 border border-white/5 backdrop-blur-sm mt-2 shadow-sm">
                  <span className="text-indigo-400 font-serif text-[10px]">∑</span>
                  <span className="text-[10px] text-slate-400 tracking-wider font-medium uppercase">Computational Trust</span>
                  <div className="w-px h-3 bg-white/10" />
                  <span className="text-[10px] text-slate-500 tracking-wider font-medium uppercase">DIGITAL CLARITY</span>
                </div>
              </motion.div>
            </motion.div>

            <AnimatePresence mode="wait">
              {uiState === 'default' || uiState === 'no-extension' ? (
                <motion.div
                  key="step-authenticate"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, height: 0 }}
                >
                  {/* Primary Action Button */}
                  <div className="space-y-3">
                    <motion.button
                      onClick={handleAuthenticateClick}
                      className={`
                        group relative w-full h-[52px] rounded-md font-semibold text-sm tracking-wide uppercase text-white transition-all duration-300
                        flex items-center justify-center gap-2 overflow-hidden shadow-lg shadow-indigo-500/20
                        ${uiState === 'no-extension' 
                          ? 'bg-slate-800 cursor-default border border-slate-700' 
                          : 'bg-indigo-600 hover:bg-white hover:text-indigo-900'
                        }
                      `}
                      whileHover={uiState !== 'no-extension' ? { scale: 1.01 } : {}}
                      whileTap={uiState !== 'no-extension' ? { scale: 0.99 } : {}}
                    >
                      {uiState === 'no-extension' ? (
                        <>
                          <AlertCircle className="h-4 w-4 text-amber-500" />
                          <span className="text-slate-300 text-xs">Install Extension</span>
                        </>
                      ) : (
                        <>
                          <span className="absolute inset-0 bg-gradient-to-r from-indigo-400/0 via-indigo-400/10 to-indigo-400/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
                          <span className="relative">Authenticate</span>
                          <ArrowRight className="h-4 w-4 relative group-hover:translate-x-0.5 transition-transform" />
                          <img 
                            src="/nostr-ostrich.gif" 
                            alt="Nostr" 
                            className="absolute right-16 top-1/2 -translate-y-1/2 h-7 w-auto opacity-0 group-hover:opacity-100 transition-all duration-300" 
                          />
                        </>
                      )}
                    </motion.button>
                    
                    {/* Trusted Assertions Link - Moved here as secondary action */}
                    <button
                      onClick={() => setShowTrustedAssertions(true)}
                      className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md bg-white/5 hover:bg-white border border-white/10 hover:border-white transition-all group/link shadow-sm"
                    >
                      <div className="h-3.5 w-3.5 opacity-60 group-hover/link:opacity-100 transition-opacity">
                         <svg viewBox="0 0 24 24" fill="none" className="w-full h-full text-indigo-300 group-hover/link:text-indigo-600 transition-colors">
                          <g clipPath="url(#clip0_signin_link_2)">
                            <path d="M13.75 10C14.3023 10 14.75 9.55228 14.75 9C14.75 8.44772 14.3023 8 13.75 8C13.1977 8 12.75 8.44772 12.75 9C12.75 9.55228 13.1977 10 13.75 10Z" stroke="currentColor" strokeMiterlimit="10" />
                            <path d="M10.25 10C10.8 10 11.25 9.55 11.25 9C11.25 8.45 10.8 8 10.25 8" stroke="currentColor" strokeMiterlimit="10" strokeLinecap="round" strokeLinejoin="round" />
                            <path d="M15.5 13C16.0523 13 16.5 12.5523 16.5 12C16.5 11.4477 16.0523 11 15.5 11C14.9477 11 14.5 11.4477 14.5 12C14.5 12.5523 14.9477 13 15.5 13Z" stroke="currentColor" strokeMiterlimit="10" />
                            <path d="M17.1504 9.75C17.5646 9.75 17.9004 9.41421 17.9004 9C17.9004 8.58579 17.5646 8.25 17.1504 8.25C16.7362 8.25 16.4004 8.58579 16.4004 9C16.4004 9.41421 16.7362 9.75 17.1504 9.75Z" stroke="currentColor" strokeMiterlimit="10" />
                            <path d="M17.1504 15.75C17.5646 15.75 17.9004 15.4142 17.9004 15C17.9004 14.5858 17.5646 14.25 17.1504 14.25C16.7362 14.25 16.4004 14.5858 16.4004 15C16.4004 15.4142 16.7362 15.75 17.1504 15.75Z" stroke="currentColor" strokeMiterlimit="10" />
                            <path d="M19.75 12.75C20.1642 12.75 20.5 12.4142 20.5 12C20.5 11.5858 20.1642 11.25 19.75 11.25C19.3358 11.25 19 11.5858 19 12C19 12.4142 19.3358 12.75 19.75 12.75Z" stroke="currentColor" strokeMiterlimit="10" />
                            <path d="M6.80078 9.75C7.21499 9.75 7.55078 9.41421 7.55078 9C7.55078 8.58579 7.21499 8.25 6.80078 8.25C6.38657 8.25 6.05078 8.58579 6.05078 9C6.05078 9.41421 6.38657 9.75 6.80078 9.75Z" stroke="currentColor" strokeMiterlimit="10" />
                            <path d="M6.80078 15.75C7.21499 15.75 7.55078 15.4142 7.55078 15C7.55078 14.5858 7.21499 14.25 6.80078 14.25C6.38657 14.25 6.05078 14.5858 6.05078 15C6.05078 15.4142 6.38657 15.75 6.80078 15.75Z" stroke="currentColor" strokeMiterlimit="10" />
                            <path d="M4.19922 12.75C4.61343 12.75 4.94922 12.4142 4.94922 12C4.94922 11.5858 4.61343 11.25 4.19922 11.25C3.78501 11.25 3.44922 11.5858 3.44922 12C3.44922 12.4142 3.78501 12.75 4.19922 12.75Z" stroke="currentColor" strokeMiterlimit="10" />
                            <path d="M15.9004 5.94922C16.3146 5.94922 16.6504 5.61343 16.6504 5.19922C16.6504 4.78501 16.3146 4.44922 15.9004 4.44922C15.4862 4.44922 15.1504 4.78501 15.1504 5.19922C15.1504 5.61343 15.4862 5.94922 15.9004 5.94922Z" stroke="currentColor" strokeMiterlimit="10" />
                            <path d="M8.09961 5.94922C8.51382 5.94922 8.84961 5.61343 8.84961 5.19922C8.84961 4.78501 8.51382 4.44922 8.09961 4.44922C7.6854 4.44922 7.34961 4.78501 7.34961 5.19922C7.34961 5.61343 7.6854 5.94922 8.09961 5.94922Z" stroke="currentColor" strokeMiterlimit="10" />
                            <path d="M12.0508 6.75C12.465 6.75 12.8008 6.41421 12.8008 6C12.8008 5.58579 12.465 5.25 12.0508 5.25C11.6366 5.25 11.3008 5.58579 11.3008 6C11.3008 6.41421 11.6366 6.75 12.0508 6.75Z" stroke="currentColor" strokeMiterlimit="10" />
                            <path d="M15.9004 19.75C16.3146 19.75 16.6504 19.4142 16.6504 19C16.6504 18.5858 16.3146 18.25 15.9004 18.25C15.4862 18.25 15.1504 18.5858 15.1504 19C15.1504 19.4142 15.4862 19.75 15.9004 19.75Z" stroke="currentColor" strokeMiterlimit="10" />
                            <path d="M8.84961 19C8.84961 19.41 8.50961 19.75 8.09961 19.75C7.68961 19.75 7.34961 19.41 7.34961 19" stroke="currentColor" strokeMiterlimit="10" strokeLinecap="round" strokeLinejoin="round" />
                            <path d="M12.0508 18.9492C12.465 18.9492 12.8008 18.6134 12.8008 18.1992C12.8008 17.785 12.465 17.4492 12.0508 17.4492C11.6366 17.4492 11.3008 17.785 11.3008 18.1992C11.3008 18.6134 11.6366 18.9492 12.0508 18.9492Z" stroke="currentColor" strokeMiterlimit="10" />
                            <path d="M8.5 13C9.05228 13 9.5 12.5523 9.5 12C9.5 11.4477 9.05228 11 8.5 11C7.94772 11 7.5 11.4477 7.5 12C7.5 12.5523 7.94772 13 8.5 13Z" stroke="currentColor" strokeMiterlimit="10" />
                            <path d="M10.25 16C10.8023 16 11.25 15.5523 11.25 15C11.25 14.4477 10.8023 14 10.25 14C9.69772 14 9.25 14.4477 9.25 15C9.25 15.5523 9.69772 16 10.25 16Z" stroke="currentColor" strokeMiterlimit="10" />
                            <path d="M14.75 15C14.75 14.45 14.3 14 13.75 14C13.2 14 12.75 14.45 12.75 15" stroke="currentColor" strokeMiterlimit="10" strokeLinecap="round" strokeLinejoin="round" />
                            <path d="M11.9492 2.5V2.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            <path d="M17.4492 2.90039V2.90039" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                            <path d="M17.4492 21.25V21.25" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                            <path d="M19.9492 16.5508V16.5508" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                            <path d="M19.9492 7.05078V7.05078" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                            <path d="M3.94922 16.5508V16.5508" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                            <path d="M3.94922 7.05078V7.05078" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                            <path d="M6.44922 2.90039V2.90039" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                            <path d="M6.44922 21.25V21.25" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                            <path d="M11.9492 21.5508V21.5508" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            <path d="M1.5 12.0508V12.0508" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            <path d="M22.4492 12.0508V12.0508" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          </g>
                          <defs>
                            <clipPath id="clip0_signin_link_2">
                              <rect width="24" height="24" fill="white"/>
                            </clipPath>
                          </defs>
                        </svg>
                      </div>
                      <span className="text-[11px] font-medium text-slate-400 group-hover/link:text-indigo-950 transition-colors">About Trusted Assertions</span>
                      <ExternalLink className="h-3 w-3 text-slate-500 group-hover/link:text-indigo-400 transition-colors ml-0.5" />
                    </button>

                    {/* Status Message */}
                    <AnimatePresence mode="wait">
                      {uiState === 'no-extension' && (
                        <motion.div
                          key="no-extension"
                          initial={{ opacity: 0, y: -5 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0 }}
                          className="h-6 flex items-center justify-center"
                        >
                          <p className="text-amber-500/80 text-[10px] font-medium flex items-center justify-center gap-1.5 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                            <AlertCircle className="h-3 w-3" />
                            No Nostr extension found
                          </p>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="step-consent"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-3"
                >



                  {/* Consent Toggle */}
                  <div className="space-y-1.5">
                    <div 
                      className={`flex items-center justify-between gap-4 p-4 rounded-xl bg-slate-800/40 border cursor-pointer transition-all group/toggle
                        ${consentGiven ? 'border-indigo-500/30 bg-gradient-to-r from-indigo-500/10 via-violet-500/5 to-transparent shadow-[0_18px_58px_-40px_rgba(99,102,241,0.45)]' : 'border-slate-700/50 hover:border-indigo-500/30 hover:bg-slate-800/55'}
                      `}
                      onClick={() => setConsentGiven(!consentGiven)}
                      data-testid="toggle-authorize-local-calculation"
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setConsentGiven(!consentGiven);
                        }
                      }}
                    >
                      <div className="min-w-0 flex-1 text-left">
                        <h3 className={`text-[15px] font-semibold tracking-[-0.01em] transition-colors ${consentGiven ? 'text-white' : 'text-slate-200 group-hover/toggle:text-white'}`} data-testid="text-toggle-service-provider-title">
                          Select Brainstorm as your Web of Trust Service Provider
                        </h3>
                        <button
                          type="button"
                          className="mt-1 inline-flex items-center gap-1.5 text-xs text-indigo-300/90 hover:text-indigo-200 transition-colors underline underline-offset-4 decoration-indigo-400/30 hover:decoration-indigo-300/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/40 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 rounded-sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setTrustedAssertionsPanel('provider');
                            setShowTrustedAssertions(true);
                          }}
                          data-testid="button-what-does-this-mean-inline"
                        >
                          What does this mean?
                          <span className="text-indigo-300/70" aria-hidden="true">↗</span>
                        </button>

                      </div>

                      <div className={`
                        relative w-12 h-6 rounded-full transition-colors duration-300 ease-in-out shrink-0
                        ${consentGiven ? 'bg-indigo-500 shadow-[0_0_18px_rgba(99,102,241,0.55)]' : 'bg-slate-700'}
                      `}>
                        <div className={`
                          absolute top-0.5 left-0.5 bg-white w-5 h-5 rounded-full shadow-sm transition-transform duration-300 ease-in-out
                          ${consentGiven ? 'translate-x-6' : 'translate-x-0'}
                        `} />
                      </div>
                    </div>

                  </div>

                  {/* Compute Now Button */}
                  <motion.button
                    onClick={handleComputeNow}
                    disabled={!consentGiven || uiState === 'signing-in'}
                    animate={{ 
                      opacity: consentGiven ? 1 : 0.5,
                      y: consentGiven ? 0 : 5
                    }}
                    className={`
                      w-full h-[52px] rounded-md font-semibold text-sm tracking-wide uppercase transition-all duration-300
                      flex items-center justify-center gap-2 overflow-hidden shadow-lg
                      ${consentGiven && uiState !== 'signing-in'
                        ? 'bg-white text-indigo-950 shadow-[0_0_20px_rgba(255,255,255,0.3)] hover:shadow-[0_0_25px_rgba(255,255,255,0.5)] cursor-pointer hover:scale-[1.02]' 
                        : 'bg-slate-800 cursor-not-allowed text-slate-500'
                      }
                    `}
                    whileHover={consentGiven && uiState !== 'signing-in' ? { scale: 1.01 } : {}}
                    whileTap={consentGiven && uiState !== 'signing-in' ? { scale: 0.99 } : {}}
                    data-testid="button-calculate-score"
                  >
                    {uiState === 'signing-in' ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin text-slate-500" />
                        <span className="text-slate-600 text-xs" data-testid="text-calculating-status">Computing Trust Graph...</span>
                      </>
                    ) : (
                      <>
                        <span className="relative" data-testid="text-calculate-score">Calculate my score </span>
                        {/* Custom SVG Icon */}
                        <div className="flex items-center justify-center" data-testid="icon-calculate-score">
                          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 64 64" fill="currentColor" className={consentGiven ? '' : 'opacity-50'}>
                          <g>
                            <path d="M61,27c0-6.1-4.9-11-11-11c-0.8,0-1.5,0.1-2.2,0.2C46.4,8.6,39.9,3,32,3S17.6,8.6,16.2,16.2C15.5,16.1,14.8,16,14,16 C7.9,16,3,20.9,3,27c0,4.6,2.8,8.6,7,10.2V39c0,0.6,0.4,1,1,1h4c0.6,0,1-0.4,1-1v-1h3v1.4c-0.8,0.9-1.2,2.1-0.9,3.3 c0.3,1.6,1.6,3,3.2,3.2c1.2,0.2,2.4-0.1,3.3-0.9c0.9-0.8,1.4-1.9,1.4-3.1c0-1-0.4-1.9-1-2.6V38h4v16.4c-0.8,0.9-1.2,2.1-0.9,3.3 c0.3,1.6,1.6,3,3.2,3.2c0.2,0,0.5,0.1,0.7,0.1c0.9,0,1.9-0.3,2.6-0.9c0.9-0.8,1.4-1.9,1.4-3.1c0-1-0.4-1.9-1-2.6V46h3 c0.6,0,1,0.4,1,1v3.4c-0.8,0.9-1.2,2.1-0.9,3.3c0.3,1.6,1.6,3,3.2,3.2c1.2,0.2,2.4-0.1,3.3-0.9c0.9-0.8,1.4-1.9,1.4-3.1 c0-1-0.4-1.9-1-2.6V47c0-3.9-3.1-7-7-7h-3v-2h13v2h-2c-0.4,0-0.7,0.2-0.9,0.6c-0.2,0.4-0.1,0.8,0.1,1.1l5,6 c0.2,0.2,0.5,0.4,0.8,0.4s0.6-0.1,0.8-0.4l5-6c0.2-0.3,0.3-0.7,0.1-1.1C56.7,40.2,56.4,40,56,40h-2v-2.8C58.2,35.6,61,31.6,61,27z M14,38h-2V27c0-0.6-0.4-1-1-1h-0.9l2.9-3.4l2.9,3.4H15c-0.6,0-1,0.4-1,1V38z M25,36v-1c0-0.6,0.4-1,1-1h3v2H25z M38,42 c2.8,0,5,2.2,5,5v3.8c0,0.3,0.1,0.6,0.3,0.7c0.4,0.4,0.7,0.9,0.7,1.5c0,0.6-0.3,1.1-0.7,1.5c-0.5,0.4-1,0.5-1.7,0.4 c-0.8-0.1-1.5-0.8-1.6-1.6c-0.1-0.7,0.1-1.4,0.6-1.8c0.2-0.2,0.3-0.5,0.3-0.7V47c0-1.7-1.3-3-3-3h-4c-0.6,0-1,0.4-1,1v9.8 c0,0.3,0.1,0.6,0.3,0.7c0.4,0.4,0.7,0.9,0.7,1.5c0,0.6-0.3,1.1-0.7,1.5c-0.5,0.4-1,0.5-1.7,0.4c-0.8-0.1-1.5-0.8-1.6-1.6 c-0.1-0.7,0.1-1.4,0.6-1.8c0.2-0.2,0.3-0.5,0.3-0.7V33c0-0.6-0.4-1-1-1h-4c-1.7,0-3,1.3-3,3v4.8c0,0.3,0.1,0.6,0.3,0.7 c0.4,0.4,0.7,0.9,0.7,1.5c0,0.6-0.3,1.1-0.7,1.5c-0.5,0.4-1,0.5-1.7,0.4c-0.8-0.1-1.5-0.8-1.6-1.6c-0.1-0.7,0.1-1.4,0.6-1.8 c0.2-0.2,0.3-0.5,0.3-0.7V35c0-2.8,2.2-5,5-5h4c0.6,0,1-0.4,1-1v-4.1c0.3,0,0.7,0.1,1,0.1s0.7,0,1-0.1V41c0,0.6,0.4,1,1,1H38z M32,23c-2.8,0-5-2.2-5-5s2.2-5,5-5s5,2.2,5,5S34.8,23,32,23z M35,36V24.3c2.4-1.1,4-3.5,4-6.3c0-3.9-3.1-7-7-7s-7,3.1-7,7 c0,2.8,1.6,5.2,4,6.3V28h-3c-3.9,0-7,3.1-7,7v1h-3v-8h2c0.4,0,0.7-0.2,0.9-0.6c0.2-0.4,0.1-0.8-0.1-1.1l-5-6 c-0.4-0.5-1.2-0.5-1.5,0l-5,6c-0.2,0.3-0.3,0.7-0.1,1.1C7.3,27.8,7.6,28,8,28h2v7.1c-3-1.5-5-4.6-5-8.1c0-5,4-9,9-9 ..." />
                          </g>
                        </svg>
                        </div>
                      </>
                    )}
                  </motion.button>

                  <div className="mt-3 flex justify-center" data-testid="row-info-links-wrap">
                    <div
                      className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/5 px-2 py-1.5 shadow-[0_12px_40px_-24px_rgba(99,102,241,0.7)]"
                      data-testid="row-info-links"
                    >
                      <button
                        type="button"
                        className="group inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-medium text-slate-300/80 transition-colors hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/40 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
                        onClick={(e) => {
                          e.stopPropagation();
                          setInfoPanel('why');
                          setShowInfoModal(true);
                        }}
                        data-testid="button-why-left"
                      >
                        <span className="underline underline-offset-4 decoration-white/10 group-hover:decoration-white/25">Why?</span>
                      </button>

                    <div
                      className="mx-1 h-4 w-px bg-gradient-to-b from-transparent via-white/15 to-transparent"
                      aria-hidden="true"
                      data-testid="divider-info-links"
                    />

                    <button
                      type="button"
                      className="group inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-medium text-slate-300/80 transition-colors hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/40 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
                      onClick={(e) => {
                        e.stopPropagation();
                        setInfoPanel('next');
                        setShowInfoModal(true);
                      }}
                      data-testid="button-why-right"
                    >
                      <span className="underline underline-offset-4 decoration-white/10 group-hover:decoration-white/25">What will happen next?</span>
                    </button>
                    </div>
                  </div>

                  <AnimatePresence>
                    {showInfoModal && infoPanel !== null && (
                      <div className="fixed inset-0 z-50 grid place-items-center p-4 isolate" data-testid="modal-info-overlay">
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          onClick={() => {
                            setShowInfoModal(false);
                            setInfoPanel(null);
                          }}
                          className="absolute inset-0 bg-slate-950/70"
                          data-testid="modal-info-backdrop"
                        />

                        <motion.div
                          initial={{ opacity: 0, scale: 0.98, y: 8 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.98, y: 8 }}
                          transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                          className="relative w-full max-w-lg max-h-[80svh] overflow-hidden rounded-2xl border border-white/10 bg-slate-900/60 shadow-[0_28px_120px_rgba(0,0,0,0.65)] backdrop-blur-xl"
                          role="dialog"
                          aria-modal="true"
                          aria-label={infoPanel === 'why' ? 'Why' : 'What will happen next'}
                          data-testid="modal-info"
                        >
                          <div className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-inset ring-white/5" />
                          <div className="pointer-events-none absolute -inset-px rounded-2xl bg-[radial-gradient(100%_120%_at_10%_0%,rgba(124,134,255,0.18),transparent_60%),radial-gradient(90%_120%_at_90%_10%,rgba(167,139,250,0.14),transparent_55%)]" />

                          <div className="relative p-5 sm:p-6" data-testid="modal-info-inner">
                            <button
                              type="button"
                              onClick={() => {
                                setShowInfoModal(false);
                                setInfoPanel(null);
                              }}
                              className="absolute top-3.5 right-3.5 grid h-9 w-9 place-items-center rounded-full text-slate-400/80 hover:text-white hover:bg-white/10 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/40"
                              data-testid="button-close-info-modal"
                              aria-label="Close"
                            >
                              <X className="h-4 w-4" />
                            </button>

                            <div className="flex items-start gap-3 pr-10" data-testid="modal-info-header">
                              <div className="min-w-0">
                                <h3 className="mt-0.5 text-[15px] sm:text-base font-semibold tracking-[-0.01em] text-white" data-testid="text-info-modal-title">
                                  {infoPanel === 'why' ? 'Why this matters' : 'What happens next '}
                                </h3>
                              </div>
                            </div>

                            <motion.div
                              initial={{ opacity: 0, y: 6 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: 6 }}
                              transition={{ duration: 0.18, ease: "easeOut" }}
                              className="mt-3.5 relative max-h-[70svh] overflow-auto pr-1 text-[13px] sm:text-sm leading-relaxed text-slate-200/80"
                              data-testid="modal-info-content"
                            >
                            {infoPanel === 'why' ? (
                              <div className="mt-3" data-testid="panel-info-why">
                                <p className="text-[13px] sm:text-sm text-slate-300 leading-relaxed" data-testid="text-why-body">
                                  Harness your extended and trusted nostr community to help you eliminate spam and find the content that best suits your interests and values. Take control over your time and attention. Steer clear of the information gatekeepers and the advertisers who only see you as their product!
                                </p>
                              </div>
                            ) : (
                              <div className="mt-3 space-y-3" data-testid="panel-info-next">
                                <p className="text-[13px] sm:text-sm text-slate-300 leading-relaxed" data-testid="text-next-body">
                                  We will calculate trust scores for your entire nostr network, entirely from <span className="text-slate-100 font-semibold">YOUR</span> perspective, using standard nostr follows, mutes, and reports. This usually takes <span className="text-slate-100 font-medium">5–10 minutes</span>.
                                </p>
                                <p className="text-[13px] sm:text-sm text-slate-300 leading-relaxed" data-testid="text-next-body-2">
                                  We next publish those scores as nostr notes (called <span className="text-slate-100 font-medium">Trusted Assertions</span>) which makes them available for use by clients and apps throughout the nostr network.
                                </p>
                                <p className="text-[13px] sm:text-sm text-slate-300 leading-relaxed" data-testid="text-next-body-2-learn-more">
                                  <span className="text-slate-400">Learn more about </span>
                                  <a
                                    href="https://github.com/nostr-protocol/nips/blob/master/85.md"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-indigo-300 hover:text-indigo-200 underline underline-offset-4 decoration-indigo-400/40 hover:decoration-indigo-300/70 transition-colors"
                                    data-testid="link-trusted-assertions-next"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    NIP-85: Trusted Assertions
                                  </a>
                                  <span className="text-slate-400">.</span>
                                </p>
                              </div>
                            )}

                          </motion.div>
                        </div>
                      </motion.div>
                      </div>
                    )}
                  </AnimatePresence>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Footer Actions - Advanced Options */}
            <div className="mt-2 pt-2 border-t border-white/5 flex flex-col items-center gap-2 w-full">
              
              {/* Advanced Options Content - Expanded */}
              <AnimatePresence>
                {advancedOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2, ease: "easeInOut" }}
                    className="w-full overflow-hidden"
                  >
                    <div className="pt-0 px-2 pb-0 space-y-2">
                      <button 
                        onClick={() => {
                          setShowRemoteSigner(true);
                          setActiveTab('extension');
                        }}
                        className="w-full flex items-center justify-between p-1.5 rounded-md bg-slate-800/30 border border-slate-700/20 hover:bg-slate-800/50 hover:border-slate-600/40 transition-all group"
                      >
                        <div className="flex items-center gap-2">
                          <div className="p-1 rounded bg-slate-800 text-slate-400 group-hover:text-indigo-400 transition-colors">
                            <Puzzle className="h-3 w-3" />
                          </div>
                          <div className="text-left">
                            <div className="text-[10px] font-medium text-slate-300 group-hover:text-white">Browser extension</div>
                          </div>
                        </div>
                        <ChevronDown className="h-3 w-3 text-slate-600 -rotate-90 group-hover:text-slate-500" />
                      </button>

                      <button 
                        onClick={() => {
                          setShowRemoteSigner(true);
                          setActiveTab('remote-signer');
                        }}
                        className="w-full flex items-center justify-between p-1.5 rounded-md bg-slate-800/30 border border-slate-700/20 hover:bg-slate-800/50 hover:border-slate-600/40 transition-all group"
                      >
                        <div className="flex items-center gap-2">
                          <div className="p-1 rounded bg-slate-800 text-slate-400 group-hover:text-indigo-400 transition-colors">
                            <Globe className="h-3 w-3" />
                          </div>
                          <div className="text-left">
                            <div className="text-[10px] font-medium text-slate-300 group-hover:text-white">Remote signer</div>
                          </div>
                        </div>
                        <ChevronDown className="h-3 w-3 text-slate-600 -rotate-90 group-hover:text-slate-500" />
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

            </div>
            
          </div>


        </motion.div>
      </main>
      {/* Footer */}
      <motion.footer 
        className="relative z-20 px-6 pb-4 pt-3 sm:px-8"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
      >
        <div className="max-w-4xl mx-auto">
          {/* Desktop Footer - Condensed single row */}
          <div className="hidden sm:block">
            <div className="h-px bg-gradient-to-r from-transparent via-slate-700/50 to-transparent mb-5" />
            
            <div className="flex items-center justify-center gap-5">
              <motion.a 
                href="https://nosfabrica.com/" 
                target="_blank" 
                rel="noopener noreferrer"
                className="group"
                data-testid="link-nosfabrica"
                whileHover={{ y: -6, scale: 1.1 }}
                transition={{ type: "spring", stiffness: 400, damping: 20 }}
              >
                <img 
                  src="/nosfabrica-logo.png" 
                  alt="Nosfabrica" 
                  className="h-5 w-auto rounded opacity-50 group-hover:opacity-100 transition-all duration-300 group-hover:drop-shadow-[0_0_12px_rgba(255,255,255,0.5)]"
                />
              </motion.a>
              
              <div className="w-px h-4 bg-slate-700/40" />
              
              <motion.a 
                href="https://nostr.how/en/what-is-nostr" 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-[10px] text-slate-500 group cursor-pointer"
                whileHover={{ y: -6, scale: 1.1 }}
                transition={{ type: "spring", stiffness: 400, damping: 20 }}
              >
                <img src="/nostr-ostrich.gif" alt="Nostr" className="h-5 w-auto" />
                <span className="text-slate-500 group-hover:text-violet-400 transition-all duration-200">Nostr</span>
              </motion.a>
              
              <div className="w-px h-4 bg-slate-700/40" />
              
              <motion.div 
                className="flex items-center gap-1.5 text-[10px] text-slate-600"
              >
                <div className="w-1 h-1 rounded-full bg-violet-500/60 animate-pulse" />
                <span>Clarity in a fragmented world</span>
              </motion.div>
              
              <div className="w-px h-4 bg-slate-700/40" />
              
              <motion.button 
                className="relative text-indigo-400 hover:text-white text-xs font-medium flex items-center gap-1.5 transition-colors group"
                onClick={() => setLocation('/')}
                data-testid="button-back-home"
                whileHover={{ scale: 1.05 }}
                transition={{ type: "spring", stiffness: 400, damping: 20 }}
              >
                <ArrowLeft className="h-3 w-3 group-hover:-translate-x-0.5 transition-transform duration-300" />
                <span>Home</span>
              </motion.button>
              
              <div className="w-px h-4 bg-slate-700/40" />
              
              <span className="text-[9px] text-slate-700 font-mono">v0.1.0-alpha</span>
              
              <div className="w-px h-4 bg-slate-700/40" />
              
              <motion.a 
                href="https://megistus.xyz/" 
                target="_blank" 
                rel="noopener noreferrer"
                className="group relative"
                data-testid="link-megistus"
                whileHover={{ y: -6, scale: 1.1 }}
                transition={{ type: "spring", stiffness: 400, damping: 20 }}
              >
                <div className="absolute inset-0 pointer-events-none overflow-visible opacity-0 group-hover:opacity-100">
                  <motion.div 
                    className="absolute left-1/2 -translate-x-1/2 bottom-1/2 w-0.5 bg-gradient-to-t from-white via-white to-transparent"
                    initial={{ height: 0, opacity: 0 }}
                    whileHover={{ height: 30, opacity: [0, 1, 0] }}
                    transition={{ duration: 0.4, ease: "easeOut" }}
                  />
                  {[
                    { x: '50%', y: -25, delay: 0.15, size: 'w-1 h-1' },
                    { x: '30%', y: -18, delay: 0.2, size: 'w-0.5 h-0.5' },
                    { x: '70%', y: -18, delay: 0.2, size: 'w-0.5 h-0.5' },
                  ].map((spark, i) => (
                    <motion.div
                      key={i}
                      className={`absolute ${spark.size} rounded-full bg-white shadow-[0_0_4px_1px_rgba(255,255,255,0.6)]`}
                      style={{ left: spark.x, bottom: '50%' }}
                      initial={{ y: 0, opacity: 0, scale: 0 }}
                      whileHover={{ y: spark.y, opacity: [0, 1, 0], scale: [0, 1.2, 0] }}
                      transition={{ duration: 0.5, delay: spark.delay, ease: "easeOut" }}
                    />
                  ))}
                </div>
                <img 
                  src="/megistus-icon-white.png" 
                  alt="Megistus" 
                  className="h-8 w-auto opacity-50 group-hover:opacity-100 transition-all duration-300 group-hover:drop-shadow-[0_0_16px_rgba(255,255,255,0.7)] relative z-10"
                />
              </motion.a>
            </div>
            
            <div className="mt-4 text-center">
              <p className="text-[10px] text-slate-600 max-w-lg mx-auto leading-relaxed">
                Brainstorm is a client for the Nostr protocol. Your keys and data are yours alone—we do not store or have access to your private key.
              </p>
            </div>
          </div>
          
          {/* Mobile Footer */}
          <div className="sm:hidden">
            <div className="h-px bg-gradient-to-r from-transparent via-slate-700/50 to-transparent mb-6" />
            
            <motion.button 
              className="w-full mb-6 py-3 px-4 bg-gradient-to-r from-indigo-500/10 via-violet-500/10 to-purple-500/10 border border-indigo-500/30 rounded-xl flex items-center justify-center gap-3 group"
              onClick={() => setLocation('/')}
              data-testid="button-back-home-mobile"
              whileTap={{ scale: 0.98 }}
            >
              <ArrowLeft className="h-4 w-4 text-indigo-400" />
              <span className="text-sm font-medium text-indigo-300">Back to Home</span>
            </motion.button>
            
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
            
            <div className="text-center mt-4 mb-2 px-4">
              <p className="text-[10px] text-slate-600 leading-relaxed">
                Brainstorm is a client for the Nostr protocol. Your keys and data are yours alone—we do not store or have access to your private key.
              </p>
            </div>
            
            <div className="text-center mt-1">
              <span className="text-[9px] text-slate-700 font-mono">v0.1.0-beta</span>
            </div>
          </div>
        </div>
      </motion.footer>
      {/* Trusted Assertions Modal */}
      <AnimatePresence>
        {showTrustedAssertions && (
          <div className="fixed inset-0 z-50 grid place-items-center p-4 isolate" data-testid="modal-trusted-assertions" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowTrustedAssertions(false)}
              className="absolute inset-0 bg-slate-950/70"
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.98, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: 8 }}
              transition={{ type: 'spring', stiffness: 420, damping: 34 }}
              className="relative w-full max-w-lg max-h-[80svh] overflow-hidden rounded-2xl border border-white/10 bg-slate-900/60 shadow-[0_28px_120px_rgba(0,0,0,0.65)] backdrop-blur-xl"
              role="dialog"
              aria-modal="true"
              aria-label="Trusted Assertions info"
            >
              <div className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-inset ring-white/5" />
              <div className="pointer-events-none absolute -inset-px rounded-2xl bg-[radial-gradient(100%_120%_at_10%_0%,rgba(124,134,255,0.18),transparent_60%),radial-gradient(90%_120%_at_90%_10%,rgba(167,139,250,0.14),transparent_55%)]" />

              <div className="relative p-5 sm:p-6">
                <button
                  onClick={() => setShowTrustedAssertions(false)}
                  className="absolute top-3.5 right-3.5 grid h-9 w-9 place-items-center rounded-full text-slate-400/80 hover:text-white hover:bg-white/10 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/40"
                  aria-label="Close"
                  data-testid="button-close-trusted-assertions"
                >
                  <X className="h-4 w-4" />
                </button>

                <div className="flex items-start gap-3 pr-10">
                  <div className="min-w-0">
                    <h2 className="text-[15px] sm:text-base font-semibold tracking-[-0.01em] text-white" data-testid="text-trusted-assertions-title">
                      {trustedAssertionsPanel === 'provider' ? 'What does this mean?' : 'What will happen next?'}
                    </h2>
                  </div>
                </div>

                <div className="mt-3.5 space-y-3.5 max-h-[62svh] overflow-auto pr-1 text-[13px] sm:text-sm leading-relaxed text-slate-200/80" data-testid="trusted-assertions-content">
                  {trustedAssertionsPanel === 'provider' ? (
                    <>
                      <p data-testid="text-service-provider-body">
                        Selecting <span className="text-slate-100 font-semibold">Brainstorm</span> as your Service Provider signs a nostr note (kind <span className="text-slate-100 font-medium">10040</span>) that tells compatible clients where to find the scores we publish on your behalf.
                      </p>
                      <a
                        href="https://github.com/nostr-protocol/nips/blob/master/85.md"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-indigo-200/90 hover:text-indigo-200 underline underline-offset-4 decoration-indigo-400/40 hover:decoration-indigo-300/70 transition-colors"
                        data-testid="link-nip85-more-info"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Learn more in NIP-85: Trusted Assertions.
                      </a>
                    </>
                  ) : (
                    <>
                      <p data-testid="text-what-will-happen-next-body">
                        We will calculate trust scores for your entire nostr network, entirely from <span className="text-slate-100 font-semibold">YOUR</span> perspective, using standard nostr follows, mutes, and reports. This usually takes <span className="text-slate-100 font-medium">6-8 minutes</span>.
                      </p>
                      <p data-testid="text-what-will-happen-next-body-2">
                        We next publish those scores as nostr notes (called <span className="text-slate-100 font-medium">Trusted Assertions</span>) which makes them available for use by clients and apps throughout the nostr network.
                      </p>
                    </>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* Remote Signer Modal */}
      <AnimatePresence>
        {showRemoteSigner && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 isolate">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={handleModalClose}
              className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative w-full max-w-2xl bg-slate-900 border border-indigo-500/20 rounded-2xl shadow-2xl shadow-indigo-500/10 overflow-hidden flex flex-col"
            >
              {/* Header with Tabs */}
              <div className="bg-slate-950/50 border-b border-white/5 p-4 pb-0 relative overflow-hidden">
                {/* Background glow for header */}
                <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-r from-indigo-500/5 via-violet-500/5 to-transparent pointer-events-none" />
                
                <div className="flex items-center justify-between mb-4 relative z-10">
                  <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
                    Login to Brainstorm
                  </h2>
                  <button 
                    onClick={() => {
                      handleModalClose();
                      setLocation('/');
                    }}
                    className="p-1 text-slate-500 hover:text-white rounded-full hover:bg-white/10 transition-colors"
                    data-testid="button-close-sign-in"
                    aria-label="Close"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                
                <div className="flex items-center gap-6 overflow-x-auto no-scrollbar relative z-10">
                  {[
                    { id: 'extension', label: 'Browser Extension' },
                    { id: 'remote-signer', label: 'Remote Signer' }
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`
                        pb-3 text-sm font-medium transition-colors relative whitespace-nowrap
                        ${activeTab === tab.id ? 'text-indigo-400' : 'text-slate-400 hover:text-slate-200'}
                      `}
                    >
                      {tab.label}
                      {activeTab === tab.id && (
                        <motion.div 
                          layoutId="activeTab"
                          className="absolute bottom-0 left-0 w-full h-0.5 bg-indigo-500 rounded-full shadow-[0_0_8px_rgba(99,102,241,0.6)]"
                        />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Content Area */}
              <div className="p-8 bg-slate-900 min-h-[400px] flex items-center justify-center relative overflow-hidden">
                {/* Ambient background effects */}
                <div className="absolute top-1/2 left-1/4 w-64 h-64 bg-indigo-500/5 blur-[80px] rounded-full pointer-events-none" />
                <div className="absolute bottom-0 right-0 w-80 h-80 bg-violet-500/5 blur-[100px] rounded-full pointer-events-none" />

                {/* Mathematical Computation Animations (Background) */}
                <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-80">
                  <svg className="absolute inset-0 w-full h-full">
                    <defs>
                      <linearGradient id="modalLineGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#6366f1" stopOpacity="0.4" />
                        <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.4" />
                      </linearGradient>
                    </defs>
                    {connectionPairs.slice(0, 8).map(([a, b], i) => (
                      <motion.line
                        key={`modal-line-${i}`}
                        x1={`${floatingNodes[a].x}%`}
                        y1={`${floatingNodes[a].y}%`}
                        x2={`${floatingNodes[b].x}%`}
                        y2={`${floatingNodes[b].y}%`}
                        stroke="url(#modalLineGradient)"
                        strokeWidth="1"
                        initial={{ pathLength: 0, opacity: 0 }}
                        animate={{ pathLength: 1, opacity: [0, 0.4, 0] }}
                        transition={{
                          duration: 8,
                          repeat: Infinity,
                          delay: i * 0.8,
                          ease: "easeInOut",
                        }}
                      />
                    ))}
                  </svg>
                  {floatingNodes.slice(0, 8).map((node) => (
                    <motion.div
                      key={`modal-node-${node.id}`}
                      className="absolute rounded-full bg-indigo-400/30"
                      style={{
                        left: `${node.x}%`,
                        top: `${node.y}%`,
                        width: node.size + 2,
                        height: node.size + 2,
                      }}
                      animate={{
                        y: [0, -30, 0],
                        opacity: [0.2, 0.6, 0.2],
                        scale: [1, 1.3, 1],
                      }}
                      transition={{
                        duration: node.duration,
                        repeat: Infinity,
                        delay: node.delay,
                        ease: "easeInOut",
                      }}
                    />
                  ))}
                   {calculations.slice(0, 4).map((calc, i) => (
                    <motion.div
                      key={`modal-calc-${i}`}
                      className="absolute text-[11px] font-mono text-indigo-400/30 pointer-events-none select-none"
                      style={{
                        left: `${10 + (i % 3) * 30}%`,
                        top: `${20 + Math.floor(i / 3) * 60}%`,
                      }}
                      animate={{
                        opacity: [0, 0.5, 0],
                        y: [0, -10, 0],
                      }}
                      transition={{
                        duration: 7,
                        repeat: Infinity,
                        delay: i * 1.5,
                        ease: "easeInOut",
                      }}
                    >
                      {calc}
                    </motion.div>
                  ))}
                </div>

                <AnimatePresence mode="wait">
                  {activeTab === 'extension' ? (
                    <motion.div 
                      key="extension"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ duration: 0.3 }}
                      className="flex flex-col md:flex-row items-center gap-10 w-full max-w-3xl relative z-10"
                    >
                      {/* Puzzle Piece Graphic */}
                      <div className="group relative shrink-0">
                        <div className="absolute -inset-4 bg-gradient-to-r from-indigo-500/30 to-violet-500/30 rounded-full blur-xl opacity-0 group-hover:opacity-100 transition duration-700" />
                        
                        <div className="relative w-48 h-48 bg-slate-800/50 rounded-3xl border border-white/5 flex items-center justify-center backdrop-blur-sm overflow-hidden group-hover:border-indigo-500/30 transition-colors duration-500">
                          {/* Inner grid pattern */}
                          <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:16px_16px]" />
                          
                          {/* Running Ostrich */}
                          <motion.div
                            animate={{ 
                              x: [-5, 5, -5],
                              y: [0, -5, 0],
                            }}
                            transition={{ 
                              duration: 4, 
                              repeat: Infinity, 
                              ease: "easeInOut" 
                            }}
                            className="relative z-10"
                          >
                             <img 
                               src="/nostr-ostrich.gif" 
                               alt="Running Ostrich" 
                               className="w-24 h-auto drop-shadow-2xl opacity-80 group-hover:opacity-100 transition-opacity duration-500"
                             />
                          </motion.div>
                          
                          {/* Speed lines effect behind */}
                          <motion.div 
                            className="absolute inset-0 z-0 opacity-0 group-hover:opacity-30 transition-opacity duration-700"
                            animate={{ x: [-100, 100] }}
                            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                          >
                            <div className="w-full h-[1px] bg-white/20 absolute top-1/3" />
                            <div className="w-full h-[1px] bg-white/10 absolute top-1/2" />
                            <div className="w-full h-[1px] bg-white/30 absolute top-2/3" />
                          </motion.div>
                        </div>
                      </div>

                      {/* Content */}
                      <div className="flex flex-col gap-6 text-left w-full max-w-sm">
                        <div className="space-y-3">
                          <h3 className="text-2xl font-semibold text-white">Browser Extension</h3>
                          <p className="text-slate-400 text-sm leading-relaxed">
                            Login using a browser extension like <span className="text-indigo-400 font-medium hover:text-indigo-300 cursor-pointer transition-colors">nos2x</span> or <span className="text-indigo-400 font-medium hover:text-indigo-300 cursor-pointer transition-colors">Alby</span> to securely sign events without sharing your private key.
                          </p>
                        </div>

                        <div className="pt-2">
                          <motion.button
                            onClick={handleModalClose}
                            className="group relative w-full h-[48px] rounded-lg font-semibold text-sm tracking-wide text-white transition-all duration-300 flex items-center justify-center gap-2 overflow-hidden bg-indigo-600 hover:bg-indigo-500 shadow-lg shadow-indigo-500/25"
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                          >
                            <span className="absolute inset-0 bg-gradient-to-r from-indigo-400/0 via-indigo-400/20 to-indigo-400/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
                            <span className="relative">Login Now</span>
                            <ArrowRight className="h-4 w-4 relative group-hover:translate-x-1 transition-transform" />
                          </motion.button>
                        </div>
                      </div>
                    </motion.div>
                  ) : (
                    <motion.div 
                      key="remote-signer"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ duration: 0.3 }}
                      className="flex flex-col md:flex-row items-center gap-8 w-full max-w-3xl relative z-10"
                    >
                      {/* QR Code */}
                      <div className="group relative">
                        <div className="absolute -inset-0.5 bg-gradient-to-r from-indigo-500 to-violet-500 rounded-xl blur opacity-30 group-hover:opacity-75 transition duration-500" />
                        <div className="relative bg-white p-4 rounded-xl shadow-2xl shadow-black/50 shrink-0">
                          <div className="w-48 h-48 bg-white flex items-center justify-center overflow-hidden relative">
                             {/* Subtle corner accents */}
                             <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-indigo-500/30 rounded-tl-lg z-10" />
                             <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-indigo-500/30 rounded-tr-lg z-10" />
                             <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-indigo-500/30 rounded-bl-lg z-10" />
                             <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-indigo-500/30 rounded-br-lg z-10" />
                             
                             {/* Soft ambient pulse */}
                             <motion.div 
                               className="absolute inset-0 bg-indigo-500/5 z-10 pointer-events-none mix-blend-overlay"
                               animate={{ opacity: [0, 0.2, 0] }}
                               transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                             />
                             <QRCode 
                              value="nostrconnect://bunker-relay?secret=123456" 
                              size={192}
                              style={{ height: "auto", maxWidth: "100%", width: "100%" }}
                              viewBox={`0 0 256 256`}
                              level="M"
                            />
                          </div>
                          <div className="mt-3 flex items-center justify-center gap-2 text-[10px] font-mono text-slate-400 uppercase tracking-widest">
                            <Scan className="h-3 w-3 text-indigo-500" />
                            Scan with Bunker
                          </div>
                        </div>
                      </div>

                      {/* Instructions */}
                      <div className="flex flex-col gap-6 text-left w-full">
                        <div className="space-y-2">
                          <h3 className="text-xl font-medium text-white flex items-center gap-2">
                            Login with Remote Signer
                            <span className="px-2 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-[10px] text-indigo-400 font-bold tracking-wide uppercase">Secure</span>
                          </h3>
                          <p className="text-slate-400 text-sm leading-relaxed">
                            Scan the QR code with your signing device (like <span className="text-indigo-300">Amber</span>, <span className="text-indigo-300">Nostr Connect</span>, or other bunker-enabled apps) to securely authenticate without exposing your private key.
                          </p>
                        </div>

                        <div className="space-y-3">
                           <div className="flex items-center justify-between text-xs text-slate-500 uppercase tracking-wider font-medium">
                              <span>Connection String</span>
                              <span className="text-[10px] text-indigo-400/70 animate-pulse">Waiting for connection...</span>
                           </div>
                           <div className="relative group/copy">
                              <div className="bg-slate-950/80 border border-white/10 group-hover/copy:border-indigo-500/30 rounded-lg p-3 pr-12 font-mono text-xs text-slate-300 truncate font-light transition-colors">
                                nostrconnect://bunker-relay?secret=...
                              </div>
                              <button className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-md transition-colors" title="Copy">
                                <Copy className="h-4 w-4" />
                              </button>
                           </div>
                        </div>

                        <div className="pt-2">
                          <button className="text-indigo-400 hover:text-indigo-300 text-sm font-medium transition-colors flex items-center gap-2 hover:underline decoration-indigo-500/30 underline-offset-4 group/manual">
                            <span>Or, enter Bunker URL manually</span>
                            <ArrowRight className="h-3 w-3 group-hover/manual:translate-x-0.5 transition-transform" />
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
