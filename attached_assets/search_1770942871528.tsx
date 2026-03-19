import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '@/lib/store';
import { 
  Search as SearchIcon, 
  ArrowLeft, 
  Key, 
  Database,
  Eye,
  Hash,
  User,
  Shield,
  Heart,
  Github,
  Info,
  Sparkles,
  ChevronRight,
  Menu,
  Home,
  Network,
  Settings,
  Download,
  LogOut,
  X,
  Copy
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BrainLogo } from '@/components/BrainLogo';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Add Mobile Navigation Component
const MobileNavigation = ({ currentUser, handleSignOut, handleExport, setLocation }: { 
  currentUser: any, 
  handleSignOut: () => void, 
  handleExport: () => void,
  setLocation: (path: string) => void 
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const avatarUrl = currentUser?.avatar;
  const displayName = currentUser?.displayName || 'Anon';
  const npubShort = currentUser?.npub ? `${currentUser.npub.slice(0, 8)}...` : '';

  return (
    <>
      <nav className="bg-slate-950 border-b border-white/10 sticky top-0 z-50 lg:hidden">
        <div className="px-4 py-2.5">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setMobileMenuOpen(true)}
              className="h-11 w-11 p-0 rounded-2xl text-slate-200/80 hover:text-white hover:bg-white/10"
              aria-label="Open menu"
              data-testid="button-open-mobile-menu"
            >
              <Menu className="h-6 w-6" />
            </Button>

            <button
              type="button"
              className="flex items-center gap-3 min-w-0 flex-1"
              onClick={() => setLocation('/dashboard')}
              data-testid="button-mobile-brand"
            >
              <div className="h-9 w-9 rounded-2xl bg-white/5 border border-white/10 shadow-[0_12px_30px_-18px_rgba(0,0,0,0.8)] flex items-center justify-center shrink-0">
                <BrainLogo size={20} className="text-indigo-200" />
              </div>
              <div className="leading-tight text-left min-w-0">
                <p
                  className="text-[10px] font-semibold tracking-[0.22em] uppercase text-indigo-300/80"
                  data-testid="text-mobile-nav-kicker"
                >
                  Brainstorm
                </p>
                <p
                  className="text-sm font-bold text-white"
                  style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                  data-testid="text-mobile-nav-title"
                >
                  Search
                </p>
              </div>
            </button>

            <div className="ml-auto flex items-center justify-end" data-testid="container-mobile-profile">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <div
                    className="flex items-center gap-3 cursor-pointer hover:opacity-90 transition-opacity p-1 rounded-full hover:bg-white/5"
                    data-testid="button-mobile-profile-menu"
                    role="button"
                    tabIndex={0}
                  >
                    <Avatar className="h-9 w-9 border-2 border-white ring-2 ring-white/20 shadow-md" data-testid="img-mobile-avatar">
                      <AvatarImage src={avatarUrl} alt={displayName} className="object-cover" />
                      <AvatarFallback className="bg-indigo-100 text-indigo-700 font-bold">
                        {(displayName?.charAt(0) || 'U')}
                      </AvatarFallback>
                    </Avatar>
                    <div className="hidden sm:flex flex-col items-start mr-1 max-w-[140px]" data-testid="text-mobile-profile-meta">
                      <span className="text-sm font-bold text-white leading-none mb-0.5 truncate" data-testid="text-mobile-profile-name">
                        {displayName}
                      </span>
                      <span className="text-[10px] text-indigo-300 font-mono leading-none truncate" data-testid="text-mobile-profile-npub">
                        {npubShort}
                      </span>
                    </div>
                  </div>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="w-56 bg-white/95 backdrop-blur-xl border-[#7c86ff]/20"
                  data-testid="menu-mobile-profile"
                >
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-medium leading-none text-slate-900" data-testid="text-mobile-menu-name">{displayName}</p>
                      <p className="text-xs leading-none text-slate-500" data-testid="text-mobile-menu-npub">{currentUser?.npub ? `${currentUser.npub.slice(0, 16)}...` : ''}</p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator className="bg-indigo-100" />
                  <DropdownMenuItem
                    className="cursor-pointer focus:bg-indigo-50 text-slate-700 focus:text-indigo-700"
                    onClick={() => setLocation('/settings')}
                    data-testid="dropdown-mobile-settings"
                  >
                    <Settings className="mr-2 h-4 w-4 text-indigo-500" />
                    <span>Settings</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="bg-indigo-100" />
                  <DropdownMenuItem
                    className="cursor-pointer text-red-600 focus:bg-red-50 focus:text-red-700"
                    onClick={() => {
                      handleSignOut();
                      setLocation('/');
                    }}
                    data-testid="dropdown-mobile-signout"
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>Sign out</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </nav>

      <AnimatePresence>
        {mobileMenuOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 z-50 lg:hidden backdrop-blur-sm"
              onClick={() => setMobileMenuOpen(false)}
            />
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 26, stiffness: 210 }}
              className="fixed top-0 left-0 bottom-0 w-[84%] max-w-sm z-50 lg:hidden shadow-[0_40px_120px_-40px_rgba(51,50,134,0.55)] flex flex-col overflow-hidden border-r border-white/10 bg-gradient-to-b from-slate-950 via-slate-950 to-indigo-950"
              data-testid="panel-mobile-menu"
            >
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute -top-32 -right-32 h-[420px] w-[420px] rounded-full bg-[#7c86ff]/20 blur-[90px]" />
                <div className="absolute -bottom-40 -left-40 h-[520px] w-[520px] rounded-full bg-[#333286]/18 blur-[110px]" />
                <div
                  className="absolute inset-0 opacity-[0.08] mix-blend-overlay"
                  style={{ backgroundImage: "url('https://grainy-gradients.vercel.app/noise.svg')" }}
                />
                <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.06)_1px,transparent_1px)] bg-[size:28px_28px] opacity-20" />
              </div>

              <div className="relative p-4 border-b border-white/10 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-2xl bg-white/5 border border-white/10 shadow-[0_12px_30px_-18px_rgba(0,0,0,0.8)] flex items-center justify-center">
                    <BrainLogo size={22} className="text-indigo-200" />
                  </div>
                  <div className="leading-tight">
                    <p
                      className="text-[10px] font-semibold tracking-[0.22em] uppercase text-indigo-300/80"
                      data-testid="text-mobile-menu-kicker"
                    >
                      Brainstorm
                    </p>
                    <h2
                      className="text-lg font-bold text-white tracking-tight"
                      style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                      data-testid="text-mobile-menu-title"
                    >
                      Menu
                    </h2>
                  </div>
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setMobileMenuOpen(false)}
                  className="text-slate-200/80 hover:text-white hover:bg-white/10"
                  data-testid="button-close-mobile-menu"
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>

              <div className="relative flex-1 overflow-y-auto py-4 px-3 space-y-6">
                <div className="space-y-2">
                  <p
                    className="px-3 text-[10px] font-semibold text-slate-300/70 uppercase tracking-[0.22em]"
                    data-testid="text-mobile-menu-section-nav"
                  >
                    Navigation
                  </p>

                  <Button
                    variant="ghost"
                    className="w-full justify-start gap-3 h-12 text-[15px] font-semibold text-white bg-white/10 border border-white/10 rounded-2xl shadow-[0_12px_26px_-18px_rgba(124,134,255,0.35)]"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      setLocation('/dashboard');
                    }}
                    data-testid="button-mobile-nav-dashboard"
                  >
                    <Home className="h-5 w-5 text-indigo-200" />
                    Dashboard
                  </Button>


                  <Button
                    variant="ghost"
                    className="w-full justify-start gap-3 h-12 text-[15px] font-medium text-white bg-white/10 border border-white/10 rounded-2xl"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      setLocation('/search');
                    }}
                    data-testid="button-mobile-nav-search"
                  >
                    <SearchIcon className="h-5 w-5 text-indigo-200" />
                    Search
                  </Button>

                  <Button
                    variant="ghost"
                    className="w-full justify-start gap-3 h-12 text-[15px] font-medium text-slate-200/90 hover:text-white hover:bg-white/10 border border-transparent hover:border-white/10 rounded-2xl"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      setLocation('/settings');
                    }}
                    data-testid="button-mobile-nav-settings"
                  >
                    <Settings className="h-5 w-5 text-slate-200/80" />
                    Settings
                  </Button>
                </div>

              </div>

              <div className="relative p-4 border-t border-white/10 bg-white/[0.04]">
                <div className="flex items-center gap-3 mb-4" data-testid="row-mobile-menu-user">
                  <div className="w-10 h-10 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-white font-bold text-lg shadow-[0_12px_30px_-18px_rgba(0,0,0,0.8)]">
                    {currentUser?.npub.slice(0, 1).toUpperCase() || 'U'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white truncate" data-testid="text-mobile-menu-user-label">
                      Current User
                    </p>
                    <p className="text-xs text-slate-300/70 font-mono truncate" data-testid="text-mobile-menu-user-npub">
                      {currentUser?.npub || 'Not signed in'}
                    </p>
                  </div>
                </div>

                <Button
                  variant="outline"
                  className="w-full justify-center gap-2 text-red-200 hover:text-white hover:bg-red-500/10 border-red-500/30 bg-transparent rounded-2xl"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    handleSignOut();
                  }}
                  data-testid="button-mobile-sign-out"
                >
                  <LogOut className="h-4 w-4" />
                  Sign Out
                </Button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
};

const ComputingBackground = () => {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden select-none">
      {/* Grid Pattern */}
      <div 
        className="absolute inset-0 opacity-[0.05]" 
        style={{ 
          backgroundImage: 'linear-gradient(to right, #6366f1 1px, transparent 1px), linear-gradient(to bottom, #6366f1 1px, transparent 1px)',
          backgroundSize: '40px 40px'
        }} 
      />
      
      {/* Floating Math Symbols */}
      {[
        { char: '∑', x: '15%', y: '20%', d: 2 },
        { char: '∫', x: '85%', y: '15%', d: 4 },
        { char: '∂', x: '10%', y: '80%', d: 3 },
        { char: '∆', x: '90%', y: '75%', d: 2.5 },
        { char: 'π', x: '25%', y: '85%', d: 5 },
        { char: '∞', x: '75%', y: '80%', d: 3.5 },
        { char: 'ƒ(x)', x: '80%', y: '30%', d: 4.5 },
      ].map((item, i) => (
        <motion.div
          key={i}
          className="absolute text-indigo-400/20 font-mono font-bold text-xl"
          initial={{ opacity: 0, y: 10 }}
          animate={{ 
            opacity: [0.1, 0.3, 0.1], 
            y: [0, -15, 0],
            x: [0, Math.sin(i) * 10, 0]
          }}
          transition={{ 
            duration: item.d + 2, 
            repeat: Infinity, 
            ease: "easeInOut" 
          }}
          style={{ left: item.x, top: item.y }}
        >
          {item.char}
        </motion.div>
      ))}

      {/* Graph Network Lines - SVG */}
      <svg className="absolute inset-0 w-full h-full opacity-20">
         <motion.path 
            d="M0,60 Q100,20 200,60 T400,60 T600,60 T800,60"
            fill="none"
            stroke="url(#gradient-line-1)"
            strokeWidth="1.5"
            strokeDasharray="5 5"
            animate={{ strokeDashoffset: [0, 100] }}
            transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
         />
         <motion.path 
            d="M0,140 Q150,180 300,140 T600,140 T900,140"
            fill="none"
            stroke="url(#gradient-line-2)"
            strokeWidth="1.5"
            strokeDasharray="8 8"
            animate={{ strokeDashoffset: [100, 0] }}
            transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
         />
         <defs>
            <linearGradient id="gradient-line-1" x1="0%" y1="0%" x2="100%" y2="0%">
               <stop offset="0%" stopColor="#6366f1" stopOpacity="0" />
               <stop offset="50%" stopColor="#6366f1" stopOpacity="1" />
               <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="gradient-line-2" x1="0%" y1="0%" x2="100%" y2="0%">
               <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0" />
               <stop offset="50%" stopColor="#8b5cf6" stopOpacity="1" />
               <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0" />
            </linearGradient>
         </defs>
      </svg>
    </div>
  )
}

const EnterpriseSearchIcon = ({ className }: { className?: string }) => (
  <svg 
    viewBox="0 0 24 24" 
    fill="none" 
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <g clipPath="url(#clip0_search)">
      <path d="M12 22.75C6.07 22.75 1.25 17.93 1.25 12C1.25 6.07 6.07 1.25 12 1.25C17.93 1.25 22.75 6.07 22.75 12C22.75 12.41 22.41 12.75 22 12.75C21.59 12.75 21.25 12.41 21.25 12C21.25 6.9 17.1 2.75 12 2.75C6.9 2.75 2.75 6.9 2.75 12C2.75 17.1 6.9 21.25 12 21.25C12.41 21.25 12.75 21.59 12.75 22C12.75 22.41 12.41 22.75 12 22.75Z" fill="currentColor"/>
      <path d="M9.00024 21.75H8.00024C7.59024 21.75 7.25024 21.41 7.25024 21C7.25024 20.59 7.57023 20.26 7.98023 20.25C6.41023 14.89 6.41023 9.11 7.98023 3.75C7.58023 3.74 7.25024 3.41 7.25024 3C7.25024 2.59 7.59024 2.25 8.00024 2.25H9.00024C9.24024 2.25 9.47024 2.37 9.61024 2.56C9.75024 2.76 9.79025 3.00999 9.71025 3.23999C7.83025 8.88999 7.83025 15.12 9.71025 20.77C9.79025 21 9.75024 21.25 9.61024 21.45C9.47024 21.65 9.24024 21.75 9.00024 21.75Z" fill="currentColor"/>
      <path d="M16.46 12.7505C16.05 12.7505 15.71 12.4105 15.71 12.0005C15.71 9.02045 15.2299 6.07044 14.2899 3.24044C14.1599 2.85044 14.3699 2.42043 14.7599 2.29043C15.1499 2.16043 15.58 2.37046 15.71 2.76046C16.7 5.74046 17.21 8.85045 17.21 12.0005C17.21 12.4105 16.87 12.7505 16.46 12.7505Z" fill="currentColor"/>
      <path d="M12 17.2108C9.2 17.2108 6.43 16.8108 3.75 16.0208C3.74 16.4208 3.41 16.7508 3 16.7508C2.59 16.7508 2.25 16.4108 2.25 16.0008V15.0008C2.25 14.7608 2.37 14.5308 2.56 14.3908C2.76 14.2508 3.01001 14.2108 3.24001 14.2908C6.07001 15.2308 9.02 15.7108 12 15.7108C12.41 15.7108 12.75 16.0508 12.75 16.4608C12.75 16.8708 12.41 17.2108 12 17.2108Z" fill="currentColor"/>
      <path d="M21.0002 9.7494C20.9202 9.7494 20.8402 9.73942 20.7602 9.70942C15.1102 7.82942 8.88018 7.82942 3.23018 9.70942C2.84018 9.83942 2.41018 9.62939 2.28018 9.23939C2.15018 8.84939 2.36018 8.41938 2.75018 8.28938C8.71018 6.29938 15.2702 6.29938 21.2202 8.28938C21.6102 8.41938 21.8202 8.84939 21.6902 9.23939C21.6102 9.54939 21.3102 9.7494 21.0002 9.7494Z" fill="currentColor"/>
      <path d="M18.2 22.15C16.02 22.15 14.25 20.38 14.25 18.2C14.25 16.02 16.02 14.25 18.2 14.25C20.38 14.25 22.15 16.02 22.15 18.2C22.15 20.38 20.38 22.15 18.2 22.15ZM18.2 15.75C16.85 15.75 15.75 16.85 15.75 18.2C15.75 19.55 16.85 20.65 18.2 20.65C19.55 20.65 20.65 19.55 20.65 18.2C20.65 16.85 19.55 15.75 18.2 15.75Z" fill="currentColor"/>
      <path d="M21.9999 22.7495C21.8099 22.7495 21.6199 22.6795 21.4699 22.5295L20.4699 21.5295C20.1799 21.2395 20.1799 20.7595 20.4699 20.4695C20.7599 20.1795 21.2399 20.1795 21.5299 20.4695L22.5299 21.4695C22.8199 21.7595 22.8199 22.2395 22.5299 22.5295C22.3799 22.6795 22.1899 22.7495 21.9999 22.7495Z" fill="currentColor"/>
    </g>
    <defs>
      <clipPath id="clip0_search">
        <rect width="24" height="24" fill="white"/>
      </clipPath>
    </defs>
  </svg>
);

const EnterpriseGraphIcon = ({ className }: { className?: string }) => (
  <svg 
    viewBox="0 0 24 24" 
    fill="none" 
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <g clipPath="url(#clip0_graph)">
      <path d="M5 9V16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5.25 8.5C7.04493 8.5 8.5 7.04493 8.5 5.25C8.5 3.45507 7.04493 2 5.25 2C3.45507 2 2 3.45507 2 5.25C2 7.04493 3.45507 8.5 5.25 8.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 22C6.65685 22 8 20.6569 8 19C8 17.3431 6.65685 16 5 16C3.34315 16 2 17.3431 2 19C2 20.6569 3.34315 22 5 22Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M19 22C20.6569 22 22 20.6569 22 19C22 17.3431 20.6569 16 19 16C17.3431 16 16 17.3431 16 19C16 20.6569 17.3431 22 19 22Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5.13 9C5.58 10.75 7.18 12.05 9.07 12.04L12.5 12.03C15.12 12.02 17.35 13.7 18.17 16.04" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </g>
    <defs>
      <clipPath id="clip0_graph">
        <rect width="24" height="24" fill="white"/>
      </clipPath>
    </defs>
  </svg>
);

const EnterpriseEyeIcon = ({ className }: { className?: string }) => (
  <svg 
    viewBox="0 0 512 512" 
    fill="currentColor" 
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    version="1.1"
  >
    <g id="SVGRepo_bgCarrier" strokeWidth="0"></g>
    <g id="SVGRepo_tracerCarrier" strokeLinecap="round" strokeLinejoin="round"></g>
    <g id="SVGRepo_iconCarrier">
      <g>
        <g>
          <g>
            <path d="M504.176,239.489l-95.424-78.08C319.89,88.718,192.11,88.718,103.25,161.408L7.824,239.489 c-10.432,8.536-10.431,24.488,0.002,33.023l96.491,78.933c88.241,72.199,215.126,72.199,303.369-0.001l96.489-78.932 C514.608,263.977,514.609,248.026,504.176,239.489z M380.668,318.421c-72.527,59.342-176.81,59.342-249.335,0.001l-76.31-62.424 l75.243-61.567c73.143-59.832,178.323-59.832,251.468,0.002l75.241,61.566L380.668,318.421z"></path>
            <path d="M256,170.667c-47.131,0-85.333,38.202-85.333,85.333s38.202,85.333,85.333,85.333s85.333-38.202,85.333-85.333 S303.131,170.667,256,170.667z M256,298.667c-23.567,0-42.667-19.099-42.667-42.667s19.099-42.667,42.667-42.667 s42.667,19.099,42.667,42.667S279.567,298.667,256,298.667z"></path>
            <path d="M228.418,79.085L256,51.503l27.582,27.582c8.331,8.331,21.839,8.331,30.17,0c8.331-8.331,8.331-21.839,0-30.17 L271.085,6.248c-8.331-8.331-21.839-8.331-30.17,0l-42.667,42.667c-8.331,8.331-8.331,21.839,0,30.17 C206.58,87.416,220.087,87.416,228.418,79.085z"></path>
            <path d="M283.582,432.915L256,460.497l-27.582-27.582c-8.331-8.331-21.839-8.331-30.17,0c-8.331,8.331-8.331,21.839,0,30.17 l42.667,42.667c8.331,8.331,21.839,8.331,30.17,0l42.667-42.667c8.331-8.331,8.331-21.839,0-30.17 C305.42,424.584,291.913,424.584,283.582,432.915z"></path>
          </g>
        </g>
      </g>
    </g>
  </svg>
);

const EnterprisePrivacyIcon = ({ className }: { className?: string }) => (
  <svg 
    viewBox="0 0 24 24" 
    fill="none" 
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <g clipPath="url(#clip0_eye)">
      <path d="M12 4.74937C11.9 4.74937 11.8 4.73937 11.71 4.71937C11.61 4.69937 11.52 4.66936 11.43 4.63936C11.34 4.59936 11.25 4.54937 11.17 4.49937C11.09 4.43937 11.01 4.37936 10.94 4.30936C10.66 4.02936 10.5 3.64937 10.5 3.24937C10.5 2.84937 10.66 2.46937 10.94 2.18937C11.01 2.11937 11.09 2.05937 11.17 1.99937C11.25 1.94937 11.34 1.89936 11.43 1.86936C11.52 1.82936 11.61 1.79936 11.71 1.77936C12.19 1.67936 12.71 1.83937 13.06 2.18937C13.34 2.46937 13.5 2.84937 13.5 3.24937C13.5 3.64937 13.34 4.02936 13.06 4.30936C12.78 4.58936 12.39 4.74937 12 4.74937Z" fill="currentColor"/>
      <path d="M12 9.25C11.9 9.25 11.8 9.24 11.71 9.22C11.61 9.2 11.52 9.17 11.43 9.14C11.34 9.1 11.25 9.05 11.17 9C11.09 8.94 11.01 8.88 10.94 8.81C10.66 8.53 10.5 8.15 10.5 7.75C10.5 7.35 10.66 6.97 10.94 6.69C11.01 6.62 11.09 6.56 11.17 6.5C11.25 6.45 11.34 6.4 11.43 6.37C11.52 6.33 11.61 6.3 11.71 6.28C11.9 6.24 12.1 6.24 12.29 6.28C12.39 6.3 12.48 6.33 12.57 6.37C12.66 6.4 12.75 6.45 12.83 6.5C12.91 6.56 12.99 6.62 13.06 6.69C13.34 6.97 13.5 7.35 13.5 7.75C13.5 8.15 13.34 8.53 13.06 8.81C12.99 8.88 12.91 8.94 12.83 9C12.75 9.05 12.66 9.1 12.57 9.14C12.48 9.17 12.39 9.2 12.29 9.22C12.2 9.24 12.1 9.25 12 9.25Z" fill="currentColor"/>
      <path d="M12 13.2494C11.9 13.2494 11.8 13.2394 11.71 13.2194C11.61 13.1994 11.52 13.1694 11.43 13.1394C11.34 13.0994 11.25 13.0494 11.17 12.9994C11.09 12.9394 11.01 12.8794 10.94 12.8094C10.87 12.7394 10.81 12.6694 10.75 12.5794C10.7 12.4994 10.65 12.4094 10.61 12.3194C10.58 12.2294 10.55 12.1394 10.53 12.0394C10.51 11.9494 10.5 11.8494 10.5 11.7494C10.5 11.3494 10.66 10.9694 10.94 10.6894C11.01 10.6194 11.09 10.5594 11.17 10.4994C11.25 10.4494 11.34 10.3994 11.43 10.3594C11.52 10.3294 11.61 10.2994 11.71 10.2794C12.19 10.1794 12.71 10.3394 13.06 10.6894C13.34 10.9694 13.5 11.3494 13.5 11.7494C13.5 11.8494 13.49 11.9494 13.47 12.0394C13.45 12.1394 13.42 12.2294 13.38 12.3194C13.35 12.4094 13.3 12.4994 13.25 12.5794C13.19 12.6694 13.13 12.7394 13.06 12.8094C12.99 12.8794 12.91 12.9394 12.83 12.9994C12.75 13.0494 12.66 13.0994 12.57 13.1394C12.48 13.1694 12.39 13.1994 12.29 13.2194C12.2 13.2394 12.1 13.2494 12 13.2494Z" fill="currentColor"/>
      <path d="M12 16.751C11.74 16.751 11.48 16.641 11.29 16.461C11.11 16.271 11 16.011 11 15.751C11 15.491 11.11 15.231 11.29 15.041C11.52 14.811 11.87 14.711 12.19 14.771C12.26 14.781 12.32 14.801 12.38 14.831C12.44 14.851 12.5 14.881 12.55 14.921C12.61 14.961 12.66 15.001 12.71 15.041C12.89 15.231 13 15.491 13 15.751C13 16.011 12.89 16.271 12.71 16.461C12.66 16.501 12.61 16.541 12.55 16.581C12.5 16.621 12.44 16.651 12.38 16.671C12.32 16.701 12.26 16.721 12.19 16.731C12.13 16.741 12.06 16.751 12 16.751Z" fill="currentColor"/>
      <path d="M12 20C11.9 20 11.8 19.98 11.71 19.94C11.62 19.9 11.54 19.85 11.47 19.78C11.4 19.71 11.34 19.63 11.31 19.54C11.27 19.45 11.25 19.35 11.25 19.25C11.25 19.05 11.33 18.86 11.47 18.72C11.54 18.65 11.62 18.6 11.71 18.56C11.9 18.48 12.1 18.48 12.29 18.56C12.38 18.6 12.46 18.65 12.53 18.72C12.6 18.79 12.65 18.87 12.69 18.96C12.73 19.05 12.75 19.15 12.75 19.25C12.75 19.35 12.73 19.45 12.69 19.54C12.65 19.63 12.6 19.71 12.53 19.78C12.46 19.85 12.38 19.9 12.29 19.94C12.19 19.98 12.1 20 12 20Z" fill="currentColor"/>
      <path d="M12 22.0706C11.87 22.0706 11.74 22.0206 11.65 21.9206C11.55 21.8306 11.5 21.7006 11.5 21.5706C11.5 21.4406 11.55 21.3106 11.65 21.2206C11.83 21.0306 12.17 21.0306 12.35 21.2206C12.45 21.3106 12.5 21.4406 12.5 21.5706C12.5 21.7006 12.45 21.8306 12.35 21.9206C12.26 22.0206 12.13 22.0706 12 22.0706Z" fill="currentColor"/>
      <path d="M3.5 9.24953C3.1 9.24953 2.72 9.08953 2.44 8.80953C2.16 8.52953 2 8.14953 2 7.74953C2 7.35953 2.16 6.96953 2.44 6.68953C2.99 6.12953 4 6.12953 4.56 6.68953C4.84 6.96953 5 7.35953 5 7.74953C5 8.14953 4.84 8.52953 4.56 8.80953C4.49 8.87953 4.41002 8.93953 4.33002 8.99953C4.25002 9.04953 4.16001 9.09953 4.07001 9.12953C3.98001 9.16953 3.88998 9.19953 3.78998 9.21953C3.69998 9.23953 3.6 9.24953 3.5 9.24953Z" fill="currentColor"/>
      <path d="M20.5 9.25C20.11 9.25 19.72 9.09 19.44 8.81C19.16 8.53 19 8.14 19 7.75C19 7.65 19.01 7.55001 19.03 7.46001C19.05 7.36001 19.08 7.26999 19.11 7.17999C19.15 7.08999 19.2 7 19.25 6.92C19.31 6.84 19.37 6.76 19.44 6.69C19.51 6.62 19.59 6.56 19.67 6.5C19.75 6.45 19.84 6.4 19.93 6.37C20.02 6.33 20.11 6.3 20.21 6.28C20.4 6.24 20.6 6.24 20.79 6.28C20.89 6.3 20.98 6.33 21.07 6.37C21.16 6.4 21.25 6.45 21.33 6.5C21.41 6.56 21.49 6.62 21.56 6.69C21.63 6.76 21.69 6.84 21.75 6.92C21.8 7 21.85 7.08999 21.88 7.17999C21.92 7.26999 21.95 7.36001 21.97 7.46001C21.99 7.55001 22 7.65 22 7.75C22 8.15 21.84 8.53 21.56 8.81C21.49 8.88 21.41 8.94 21.33 9C21.25 9.05 21.16 9.1 21.07 9.14C20.98 9.17 20.89 9.2 20.79 9.22C20.69 9.24 20.6 9.25 20.5 9.25Z" fill="currentColor"/>
      <path d="M20.5 12.7505C20.44 12.7505 20.37 12.7405 20.31 12.7305C20.24 12.7205 20.18 12.7005 20.12 12.6705C20.06 12.6505 20 12.6205 19.94 12.5805C19.89 12.5505 19.84 12.5005 19.79 12.4605C19.75 12.4105 19.7 12.3605 19.67 12.3105C19.63 12.2505 19.6 12.1905 19.58 12.1305C19.55 12.0705 19.53 12.0105 19.52 11.9505C19.51 11.8805 19.5 11.8205 19.5 11.7505C19.5 11.4905 19.61 11.2305 19.79 11.0405C19.84 11.0005 19.89 10.9605 19.94 10.9205C20 10.8805 20.06 10.8505 20.12 10.8305C20.18 10.8005 20.24 10.7805 20.31 10.7705C20.43 10.7405 20.56 10.7405 20.69 10.7705C20.76 10.7805 20.82 10.8005 20.88 10.8305C20.94 10.8505 21 10.8805 21.05 10.9205C21.11 10.9605 21.16 11.0005 21.21 11.0405C21.39 11.2305 21.5 11.4905 21.5 11.7505C21.5 11.8205 21.49 11.8805 21.48 11.9505C21.47 12.0105 21.45 12.0705 21.42 12.1305C21.4 12.1905 21.37 12.2505 21.33 12.3105C21.29 12.3605 21.25 12.4105 21.21 12.4605C21.16 12.5005 21.11 12.5505 21.05 12.5805C21 12.6205 20.94 12.6505 20.88 12.6705C20.82 12.7005 20.76 12.7205 20.69 12.7305C20.63 12.7405 20.56 12.7505 20.5 12.7505Z" fill="currentColor"/>
      <path d="M3.5 12.7508C3.24 12.7508 2.97998 12.6408 2.78998 12.4608C2.60998 12.2708 2.5 12.0108 2.5 11.7508C2.5 11.4908 2.60998 11.2308 2.78998 11.0408C3.06998 10.7608 3.51 10.6708 3.88 10.8308C4.01 10.8808 4.11002 10.9508 4.21002 11.0408C4.39002 11.2308 4.5 11.4908 4.5 11.7508C4.5 12.0108 4.39002 12.2708 4.21002 12.4608C4.02002 12.6408 3.76 12.7508 3.5 12.7508Z" fill="currentColor"/>
      <path d="M20.5 15.5005C20.3 15.5005 20.11 15.4205 19.97 15.2805C19.83 15.1405 19.75 14.9505 19.75 14.7505C19.75 14.6505 19.77 14.5605 19.81 14.4605C19.85 14.3705 19.9 14.2905 19.97 14.2205C20.18 14.0105 20.51 13.9405 20.79 14.0605C20.88 14.1005 20.96 14.1505 21.03 14.2205C21.1 14.2905 21.15 14.3705 21.19 14.4605C21.23 14.5605 21.25 14.6505 21.25 14.7505C21.25 14.9505 21.17 15.1405 21.03 15.2805C20.96 15.3505 20.88 15.4005 20.79 15.4405C20.69 15.4805 20.6 15.5005 20.5 15.5005Z" fill="currentColor"/>
      <path d="M3.5 15.4998C3.3 15.4998 3.10997 15.4198 2.96997 15.2798C2.89997 15.2098 2.84 15.1298 2.81 15.0398C2.77 14.9498 2.75 14.8498 2.75 14.7498C2.75 14.6498 2.77 14.5598 2.81 14.4598C2.84 14.3698 2.89997 14.2898 2.96997 14.2198C3.23997 13.9398 3.75003 13.9398 4.03003 14.2198C4.10003 14.2898 4.15 14.3698 4.19 14.4598C4.23 14.5598 4.25 14.6498 4.25 14.7498C4.25 14.8498 4.23 14.9498 4.19 15.0398C4.15 15.1298 4.10003 15.2098 4.03003 15.2798C3.89003 15.4198 3.7 15.4998 3.5 15.4998Z" fill="currentColor"/>
      <path d="M20.5 18.0003C20.43 18.0003 20.37 17.9903 20.31 17.9603C20.25 17.9403 20.19 17.9003 20.15 17.8503C20.05 17.7603 20 17.6303 20 17.5003C20 17.3703 20.05 17.2403 20.15 17.1503C20.33 16.9603 20.67 16.9603 20.85 17.1503C20.95 17.2403 21 17.3703 21 17.5003C21 17.6303 20.95 17.7603 20.85 17.8503C20.76 17.9503 20.63 18.0003 20.5 18.0003Z" fill="currentColor"/>
      <path d="M3.5 18.0003C3.37 18.0003 3.24002 17.9503 3.15002 17.8503C3.05002 17.7603 3 17.6303 3 17.5003C3 17.3703 3.05002 17.2403 3.15002 17.1503C3.33002 16.9603 3.66998 16.9603 3.84998 17.1503C3.94998 17.2403 4 17.3703 4 17.5003C4 17.6303 3.94998 17.7603 3.84998 17.8503C3.75998 17.9503 3.63 18.0003 3.5 18.0003Z" fill="currentColor"/>
      <path d="M7.75 6.99953C7.65 6.99953 7.55002 6.98953 7.46002 6.96953C7.36002 6.94953 7.26999 6.91953 7.17999 6.87953C7.07999 6.84953 6.99998 6.79953 6.91998 6.74953C6.82998 6.68953 6.76 6.62953 6.69 6.55953C6.41 6.27953 6.25 5.88953 6.25 5.49953C6.25 5.10953 6.41 4.71953 6.69 4.43953C7.25 3.87953 8.25 3.87953 8.81 4.43953C9.09 4.71953 9.25 5.09953 9.25 5.49953C9.25 5.89953 9.09 6.27953 8.81 6.55953C8.74 6.62953 8.66002 6.68953 8.58002 6.74953C8.50002 6.79953 8.41001 6.84953 8.32001 6.87953C8.23001 6.91953 8.13998 6.94953 8.03998 6.96953C7.94998 6.98953 7.85 6.99953 7.75 6.99953Z" fill="currentColor"/>
      <path d="M16.25 7C16.15 7 16.05 6.99 15.96 6.97C15.86 6.95 15.77 6.92001 15.68 6.88001C15.59 6.85001 15.5 6.8 15.42 6.75C15.34 6.69 15.26 6.63 15.19 6.56C15.12 6.49 15.06 6.41 15 6.33C14.95 6.25 14.9 6.16001 14.86 6.07001C14.83 5.98001 14.8 5.88999 14.78 5.78999C14.76 5.69999 14.75 5.6 14.75 5.5C14.75 5.11 14.91 4.72 15.19 4.44C15.26 4.37 15.34 4.31 15.42 4.25C15.5 4.2 15.59 4.15 15.68 4.12C15.77 4.08 15.86 4.05 15.96 4.03C16.15 3.99 16.35 3.99 16.54 4.03C16.64 4.05 16.73 4.08 16.82 4.12C16.91 4.15 17 4.2 17.08 4.25C17.16 4.31 17.24 4.37 17.31 4.44C17.59 4.72 17.75 5.11 17.75 5.5C17.75 5.6 17.74 5.69999 17.72 5.78999C17.7 5.88999 17.67 5.98001 17.64 6.07001C17.6 6.16001 17.55 6.25 17.5 6.33C17.44 6.41 17.38 6.49 17.31 6.56C17.24 6.63 17.16 6.69 17.08 6.75C17 6.8 16.91 6.85001 16.82 6.88001C16.73 6.92001 16.64 6.95 16.54 6.97C16.45 6.99 16.35 7 16.25 7Z" fill="currentColor"/>
      <path d="M7.75 11.2495C7.65 11.2495 7.55002 11.2395 7.46002 11.2195C7.36002 11.1995 7.26999 11.1695 7.17999 11.1395C7.08999 11.0995 6.99998 11.0495 6.91998 10.9995C6.82998 10.9395 6.76 10.8795 6.69 10.8095C6.41 10.5295 6.25 10.1395 6.25 9.74953C6.25 9.34953 6.41 8.96953 6.69 8.68953C7.25 8.12953 8.25 8.12953 8.81 8.68953C9.09 8.96953 9.25 9.34953 9.25 9.74953C9.25 10.1495 9.09 10.5295 8.81 10.8095C8.53 11.0895 8.14 11.2495 7.75 11.2495Z" fill="currentColor"/>
      <path d="M16.25 11.25C16.15 11.25 16.05 11.24 15.96 11.22C15.86 11.2 15.77 11.17 15.68 11.13C15.59 11.1 15.5 11.05 15.42 11C15.34 10.94 15.26 10.88 15.19 10.81C15.12 10.74 15.06 10.66 15 10.58C14.95 10.5 14.9 10.41 14.86 10.32C14.83 10.23 14.8 10.14 14.78 10.04C14.76 9.94999 14.75 9.85 14.75 9.75C14.75 9.36 14.91 8.97 15.19 8.69C15.26 8.62 15.34 8.56 15.42 8.5C15.5 8.45 15.59 8.4 15.68 8.37C15.77 8.33 15.86 8.3 15.96 8.28C16.15 8.24 16.35 8.24 16.54 8.28C16.64 8.3 16.73 8.33 16.82 8.37C16.91 8.4 17 8.45 17.08 8.5C17.16 8.56 17.24 8.62 17.31 8.69C17.59 8.97 17.75 9.36 17.75 9.75C17.75 9.85 17.74 9.94999 17.72 10.04C17.7 10.14 17.67 10.23 17.64 10.32C17.6 10.41 17.55 10.5 17.5 10.58C17.44 10.66 17.38 10.74 17.31 10.81C17.24 10.88 17.16 10.94 17.08 11C17 11.05 16.91 11.1 16.82 11.13C16.73 11.17 16.64 11.2 16.54 11.22C16.45 11.24 16.35 11.25 16.25 11.25Z" fill="currentColor"/>
      <path d="M7.75 14.7492C7.62 14.7492 7.49 14.7192 7.37 14.6692C7.24 14.6192 7.12998 14.5492 7.03998 14.4592C6.94998 14.3592 6.88002 14.2492 6.83002 14.1292C6.78002 14.0092 6.75 13.8792 6.75 13.7492C6.75 13.4892 6.85998 13.2292 7.03998 13.0392C7.40998 12.6692 8.09002 12.6692 8.46002 13.0392C8.64002 13.2292 8.75 13.4892 8.75 13.7492C8.75 13.8792 8.71998 14.0092 8.66998 14.1292C8.61998 14.2492 8.55002 14.3592 8.46002 14.4592C8.27002 14.6392 8.01 14.7492 7.75 14.7492Z" fill="currentColor"/>
      <path d="M16.25 14.7492C15.99 14.7492 15.73 14.6392 15.54 14.4592C15.36 14.2692 15.25 14.0092 15.25 13.7492C15.25 13.4892 15.36 13.2292 15.54 13.0392C15.91 12.6692 16.58 12.6692 16.96 13.0392C17.14 13.2292 17.25 13.4892 17.25 13.7492C17.25 13.8192 17.24 13.8792 17.23 13.9492C17.22 14.0092 17.2 14.0692 17.17 14.1292C17.15 14.1892 17.12 14.2492 17.08 14.2992C17.04 14.3592 17 14.4092 16.96 14.4592C16.77 14.6392 16.51 14.7492 16.25 14.7492Z" fill="currentColor"/>
      <path d="M7.75 17.75C7.55 17.75 7.35997 17.67 7.21997 17.53C7.14997 17.46 7.1 17.38 7.06 17.29C7.02 17.2 7 17.1 7 17C7 16.9 7.02 16.81 7.06 16.71C7.1 16.62 7.14997 16.54 7.21997 16.47C7.28997 16.4 7.37002 16.35 7.46002 16.31C7.64002 16.23 7.84998 16.23 8.03998 16.31C8.12998 16.35 8.21003 16.4 8.28003 16.47C8.42003 16.61 8.5 16.8 8.5 17C8.5 17.1 8.48 17.2 8.44 17.29C8.4 17.38 8.35003 17.46 8.28003 17.53C8.14003 17.67 7.95 17.75 7.75 17.75Z" fill="currentColor"/>
      <path d="M16.25 17.75C16.15 17.75 16.05 17.73 15.96 17.69C15.87 17.65 15.79 17.6 15.72 17.53C15.65 17.46 15.59 17.38 15.56 17.29C15.52 17.2 15.5 17.1 15.5 17C15.5 16.9 15.52 16.8 15.56 16.71C15.6 16.62 15.65 16.54 15.72 16.47C15.79 16.4 15.87 16.35 15.96 16.31C16.14 16.23 16.35 16.23 16.54 16.31C16.63 16.35 16.71 16.4 16.78 16.47C16.85 16.54 16.9 16.62 16.94 16.71C16.98 16.8 17 16.9 17 17C17 17.1 16.98 17.2 16.94 17.29C16.9 17.38 16.85 17.46 16.78 17.53C16.64 17.67 16.45 17.75 16.25 17.75Z" fill="currentColor"/>
      <path d="M7.75 20.0003C7.62 20.0003 7.49002 19.9503 7.40002 19.8503C7.30002 19.7603 7.25 19.6303 7.25 19.5003C7.25 19.3703 7.30002 19.2403 7.40002 19.1503C7.58002 18.9603 7.91998 18.9603 8.09998 19.1503C8.19998 19.2403 8.25 19.3703 8.25 19.5003C8.25 19.6303 8.19998 19.7603 8.09998 19.8503C8.00998 19.9503 7.88 20.0003 7.75 20.0003Z" fill="currentColor"/>
      <path d="M16.25 20.0003C16.18 20.0003 16.12 19.9903 16.06 19.9603C16 19.9403 15.94 19.9003 15.9 19.8503C15.85 19.8103 15.81 19.7503 15.79 19.6903C15.76 19.6303 15.75 19.5703 15.75 19.5003C15.75 19.3703 15.8 19.2403 15.9 19.1503C16.08 18.9603 16.42 18.9603 16.6 19.1503C16.7 19.2403 16.75 19.3703 16.75 19.5003C16.75 19.5703 16.74 19.6303 16.71 19.6903C16.69 19.7503 16.65 19.8103 16.6 19.8503C16.51 19.9503 16.38 20.0003 16.25 20.0003Z" fill="currentColor"/>
    </g>
    <defs>
      <clipPath id="clip0_eye">
        <rect width="24" height="24" fill="white"/>
      </clipPath>
    </defs>
  </svg>
);

const WordCloudIcon = ({ className }: { className?: string }) => (
  <svg 
    fill="currentColor" 
    viewBox="0 0 32 32" 
    id="icon" 
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <g id="SVGRepo_bgCarrier" strokeWidth="0"></g>
    <g id="SVGRepo_tracerCarrier" strokeLinecap="round" strokeLinejoin="round"></g>
    <g id="SVGRepo_iconCarrier">
      <defs>
        <style>{`.cls-1 { fill: none; }`}</style>
      </defs>
      <title>word-cloud</title>
      <rect x="10" y="16" width="12" height="2"></rect>
      <rect x="10" y="20" width="8" height="2"></rect>
      <path d="M16,7h0a8.0233,8.0233,0,0,1,7.8649,6.4935l.2591,1.346,1.3488.244A5.5019,5.5019,0,0,1,24.5076,26H7.4954a5.5019,5.5019,0,0,1-.9695-10.9165l1.3488-.244.2591-1.346A8.0256,8.0256,0,0,1,16,7m0-2a10.0244,10.0244,0,0,0-9.83,8.1155A7.5019,7.5019,0,0,0,7.4911,28H24.5076a7.5019,7.5019,0,0,0,1.3213-14.8845A10.0229,10.0229,0,0,0,15.9883,5Z" transform="translate(0)"></path>
      <rect id="_Transparent_Rectangle_" data-name="<Transparent Rectangle>" className="cls-1" width="32" height="32"></rect>
    </g>
  </svg>
);

const EnterpriseUserIcon = ({ className }: { className?: string }) => (
  <svg 
    viewBox="0 0 24 24" 
    fill="none" 
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <g clipPath="url(#clip0_user)">
      <path d="M18 18.8597H17.24C16.44 18.8597 15.68 19.1697 15.12 19.7297L13.41 21.4197C12.63 22.1897 11.36 22.1897 10.58 21.4197L8.87 19.7297C8.31 19.1697 7.54 18.8597 6.75 18.8597H6C4.34 18.8597 3 17.5298 3 15.8898V4.97974C3 3.33974 4.34 2.00977 6 2.00977H18C19.66 2.00977 21 3.33974 21 4.97974V15.8898C21 17.5198 19.66 18.8597 18 18.8597Z" stroke="currentColor" strokeWidth="1.5" strokeMiterlimit="10" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M11.9999 9.99982C13.2868 9.99982 14.33 8.95662 14.33 7.6698C14.33 6.38298 13.2868 5.33984 11.9999 5.33984C10.7131 5.33984 9.66992 6.38298 9.66992 7.6698C9.66992 8.95662 10.7131 9.99982 11.9999 9.99982Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16 15.6594C16 13.8594 14.21 12.3994 12 12.3994C9.79 12.3994 8 13.8594 8 15.6594" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </g>
    <defs>
      <clipPath id="clip0_user">
        <rect width="24" height="24" fill="white"/>
      </clipPath>
    </defs>
  </svg>
);

const EnterpriseHashIcon = ({ className }: { className?: string }) => (
  <svg 
    viewBox="0 0 192 192" 
    xmlns="http://www.w3.org/2000/svg" 
    fill="none"
    className={className}
  >
    <g id="SVGRepo_iconCarrier">
      <path stroke="currentColor" strokeLinecap="round" strokeWidth="12" d="M82 62v68m48-48H62m48-20v68m20-20H62"></path>
      <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="12" d="m96 170-66-37V59l66-37 66 37v44.043"></path>
    </g>
  </svg>
);

const OstrichIcon = ({ className }: { className?: string }) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    viewBox="0 0 24 24" 
    fill="none" 
    className={className}
  >
    <g clipPath="url(#clip0_ostrich)">
      <path d="M4.32 10.6C3.91 10.6 3.56 10.32 3.48 9.92005L3.24 8.87005C3.13 8.39005 2.75 8.01005 2.28 7.90005L1.22 7.65005C0.829998 7.57005 0.559998 7.22005 0.559998 6.81005C0.559998 6.40005 0.839998 6.06005 1.24 5.97005L2.29 5.73005C2.77 5.62005 3.15 5.24005 3.26 4.77005L3.51 3.71005C3.59 3.32005 3.94 3.05005 4.35 3.05005C4.76 3.05005 5.1 3.33005 5.19 3.73005L5.43 4.78005C5.54 5.26005 5.92 5.64005 6.39 5.75005L7.45 6.00005C7.84 6.08005 8.11 6.43005 8.11 6.84005C8.11 7.25005 7.84 7.59005 7.44 7.68005L6.38 7.92005C5.9 8.03005 5.52 8.41005 5.41 8.88005L5.16 9.94005C5.08 10.32 4.73 10.6 4.32 10.6ZM3.5 6.84005C3.83 7.05005 4.11 7.33005 4.32 7.66005C4.53 7.33005 4.81 7.05005 5.14 6.84005C4.81 6.63005 4.53 6.35005 4.32 6.02005C4.11 6.35005 3.83 6.63005 3.5 6.84005Z" fill="currentColor"/>
      <path d="M14.51 17.3C11.99 17.3 9.52997 16.28 7.75997 14.51C6.98997 13.74 6.35997 12.84 5.88997 11.86C5.70997 11.49 5.86997 11.04 6.24997 10.86C6.61997 10.68 7.06997 10.84 7.24997 11.22C7.63997 12.05 8.16997 12.8 8.81997 13.45C10.31 14.94 12.39 15.8 14.51 15.8C16.38 15.8 18.21 15.13 19.64 13.96L8.30997 2.63005C8.11997 2.86005 7.94997 3.09005 7.78997 3.33005C7.55997 3.68005 7.09997 3.77005 6.74997 3.54005C6.39997 3.31005 6.30997 2.85005 6.53997 2.50005C6.88997 1.96005 7.29997 1.46005 7.75997 1.01005C8.03997 0.730049 8.53997 0.730049 8.81997 1.01005L21.26 13.45C21.4 13.59 21.48 13.78 21.48 13.98C21.48 14.18 21.4 14.37 21.26 14.51C19.49 16.28 17.03 17.3 14.51 17.3Z" fill="currentColor"/>
      <path d="M4.26999 19.7501C4.08999 19.7501 3.90999 19.6801 3.76999 19.5601C3.54999 19.3601 3.46999 19.0601 3.55999 18.7801L5.85999 11.3901C5.97999 10.9901 6.39999 10.7701 6.79999 10.9001C7.19999 11.0201 7.41999 11.4401 7.28999 11.8401L5.47999 17.6701L10.8 15.3801C11.18 15.2201 11.62 15.3901 11.78 15.7701C11.94 16.1501 11.77 16.5901 11.39 16.7601L4.56999 19.6901C4.46999 19.7301 4.36999 19.7501 4.26999 19.7501Z" fill="currentColor"/>
      <path d="M18.54 12.49C18.13 12.49 17.79 12.15 17.79 11.74V5.52002C17.79 5.11002 18.13 4.77002 18.54 4.77002C18.95 4.77002 19.29 5.11002 19.29 5.52002V11.74C19.29 12.15 18.95 12.49 18.54 12.49Z" fill="currentColor"/>
      <path d="M16.76 4.4801H10.48C10.07 4.4801 9.72998 4.1401 9.72998 3.7301C9.72998 3.3201 10.07 2.9801 10.48 2.9801H16.76C17.17 2.9801 17.51 3.3201 17.51 3.7301C17.51 4.1401 17.17 4.4801 16.76 4.4801Z" fill="currentColor"/>
      <path d="M18.54 6.26007C17.14 6.26007 16.01 5.12007 16.01 3.73007C16.01 2.34007 17.14 1.20007 18.54 1.20007C19.94 1.20007 21.07 2.33007 21.07 3.73007C21.07 5.13007 19.94 6.26007 18.54 6.26007ZM18.54 2.70007C17.97 2.70007 17.51 3.16007 17.51 3.73007C17.51 4.30007 17.97 4.76007 18.54 4.76007C19.11 4.76007 19.57 4.30007 19.57 3.73007C19.57 3.16007 19.11 2.70007 18.54 2.70007Z" fill="currentColor"/>
      <path d="M20.99 22.75H3.02C2.04 22.75 1.25 21.96 1.25 20.98V20.01C1.25 19.03 2.04 18.24 3.02 18.24H20.99C21.97 18.24 22.76 19.03 22.76 20.01V20.98C22.76 21.96 21.97 22.75 20.99 22.75ZM3.02 19.74C2.87 19.74 2.75 19.86 2.75 20.01V20.98C2.75 21.13 2.87 21.25 3.02 21.25H20.99C21.14 21.25 21.26 21.13 21.26 20.98V20.01C21.26 19.86 21.14 19.74 20.99 19.74H3.02Z" fill="currentColor"/>
    </g>
    <defs>
      <clipPath id="clip0_ostrich">
        <rect width="24" height="24" fill="white"/>
      </clipPath>
    </defs>
  </svg>
);

const EnterpriseRelayIcon = ({ className }: { className?: string }) => (
  <svg 
    viewBox="0 0 24 24" 
    fill="none" 
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <g id="SVGRepo_iconCarrier">
      <path d="M10.6885 19.1304C12.5105 19.4655 14.3916 19.0905 15.9458 18.0822C17.5 17.0739 18.6092 15.509 19.0458 13.7086C19.4824 11.9082 19.2132 10.009 18.2936 8.40087C17.3739 6.79271 15.8735 5.59761 14.1004 5.06091" stroke="currentColor" strokeLinecap="round"></path>
      <path d="M10.0024 5.03064C8.75657 5.38772 7.62925 6.07222 6.73777 7.01287C5.8463 7.95353 5.22326 9.11595 4.93351 10.3791C4.64377 11.6423 4.69792 12.96 5.09032 14.1952C5.48272 15.4303 6.19903 16.5377 7.16468 17.4021" stroke="currentColor" strokeLinecap="round"></path>
      <path d="M16.3865 13.0042C16.6139 12.0111 16.4975 10.9703 16.0565 10.0519C15.6154 9.13352 14.8758 8.39198 13.9585 7.94857C13.0413 7.50515 12.0007 7.38611 11.0071 7.61092C10.0134 7.83572 9.12538 8.39105 8.48831 9.1861C7.85125 9.98114 7.50282 10.9688 7.50002 11.9876C7.49722 13.0064 7.8402 13.996 8.47289 14.7945C9.10557 15.5931 9.9905 16.1533 10.9829 16.3836C11.9754 16.6138 13.0166 16.5005 13.9362 16.0621" stroke="currentColor" strokeLinecap="round"></path>
      <path d="M10.7944 10.7316C11.0202 10.5169 11.2992 10.3665 11.6026 10.2957C11.906 10.225 12.2228 10.2365 12.5202 10.3291C12.8177 10.4217 13.085 10.5921 13.2946 10.8225C13.5042 11.053 13.6485 11.3353 13.7126 11.6401C13.7767 11.945 13.7582 12.2615 13.6591 12.5568C13.5599 12.8522 13.3838 13.1157 13.1487 13.3202C12.9137 13.5247 12.6284 13.6627 12.3222 13.7201C12.0159 13.7774 11.7 13.752 11.4069 13.6464" stroke="currentColor" strokeLinecap="round"></path>
    </g>
  </svg>
);

const CustomKeyIcon = ({ className }: { className?: string }) => (
  <svg 
    viewBox="0 0 70 70" 
    fill="currentColor" 
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <path d="M67.575,22.269C66.729,10.996,56.877,2.518,45.597,3.36C34.324,4.207,25.843,14.066,26.689,25.339 c0.089,1.184,0.28,2.341,0.563,3.471c-0.251,0.087-0.489,0.224-0.695,0.414L3.332,50.474c-0.413,0.378-0.749,0.913-0.749,1.474 v13.167c0,1.104,1.096,1.469,2.201,1.469h12c1.104,0,1.799-0.364,1.799-1.469v-3.531h6.049c0.588,0,1.146-0.126,1.526-0.574 c0.38-0.449,0.543-0.91,0.447-1.49l-0.612-3.936h3.639c0.566,0,1.107-0.009,1.486-0.43l10.611-11.575 c1.749,0.478,3.557,0.727,5.387,0.727c0.517,0,1.034-0.02,1.552-0.059C59.94,43.398,68.422,33.539,67.575,22.269z M48.369,40.258 c-3.252,0.244-6.467-0.468-9.301-2.057c-0.964-0.542-2.183-0.198-2.723,0.766c-0.54,0.963-0.197,2.183,0.766,2.723 c0.164,0.092,0.332,0.172,0.498,0.259l-8.868,9.635h-5.108c-0.588,0-1.146,0.392-1.526,0.84c-0.38,0.449-0.543,1.174-0.447,1.754 l0.612,3.406h-5.488c-1.104,0-2.201,1.427-2.201,2.531v2.469h-8v-9.756l22.064-20.153c0.173,0.359,0.355,0.716,0.55,1.067 c0.537,0.967,1.756,1.315,2.72,0.779c0.966-0.536,1.314-1.753,0.778-2.719c-1.157-2.087-1.836-4.362-2.018-6.763 c-0.681-9.073,6.146-17.009,15.219-17.69c9.079-0.671,17.008,6.147,17.69,15.219C64.268,31.64,57.441,39.575,48.369,40.258z" />
    <path d="M50.633,15.828c-2.469,0-4.477,2.008-4.477,4.476c0,1.195,0.466,2.32,1.313,3.166c0.845,0.845,1.969,1.31,3.164,1.31 c2.469,0,4.477-2.008,4.477-4.477C55.109,17.835,53.102,15.828,50.633,15.828z M50.633,22.779c-1.367,0-2.477-1.107-2.477-2.476 s1.109-2.476,2.477-2.476s2.477,1.107,2.477,2.475C53.109,21.672,52,22.779,50.633,22.779z" />
    <path d="M45.396,10.645c-0.319,0-0.639,0.013-0.952,0.04c-0.551,0.047-0.959,0.531-0.912,1.081 c0.045,0.521,0.481,0.915,0.996,0.915c0.02,0,0.038-0.003,0.058-0.003c0.493,0,0.965,0.366,1.026,0.896 c0.007,0.056,0.012,0.111,0.012,0.169c0,0.468-0.323,0.865-0.757,0.978c-0.033,0.009-0.065,0.021-0.1,0.026 c-0.061,0.01-0.123,0.016-0.187,0.016c-0.008,0-0.015-0.002-0.023-0.002c-0.035-0.003-0.068-0.002-0.103-0.009 c-0.006-0.001-0.013-0.003-0.019-0.004c-0.395-0.076-0.706-0.378-0.793-0.774c-0.002-0.011-0.008-0.021-0.011-0.032 C43.513,11.391,44.385,10.645,45.396,10.645z" />
  </svg>
);

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

import { Footer } from '@/components/Footer';

import download_1769440914094 from "@assets/download_1769440914094.jpg";

export default function Search() {
  const [, setLocation] = useLocation();
  const { currentUser, networkStats, topProfiles, signOut } = useStore();
  const [keyword, setKeyword] = useState('');
  const [npub, setNpub] = useState('');
  const [pubkey, setPubkey] = useState('');
  const [source, setSource] = useState('neo4j');
  const [observer, setObserver] = useState('owner');
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchError, setSearchError] = useState<null | {
    code:
      | 'MISSING_QUERY'
      | 'INVALID_NPUB'
      | 'NOT_FOUND'
      | 'RELAY_TIMEOUT'
      | 'CANCELLED';
    title: string;
    message: string;
  }>(null);
  const [activeTab, setActiveTab] = useState<'npub' | 'keyword'>('npub');

  const handleSignOut = () => {
    signOut();
    setLocation('/');
  };

  const handleExport = () => {
    const data = {
      format: 'brainstorm-v1',
      observer: currentUser?.npub,
      calculatedAt: new Date().toISOString(),
      stats: networkStats,
      topProfiles: topProfiles.slice(0, 10).map(p => ({
        npub: p.npub,
        name: p.displayName,
        score: p.score
      }))
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `brainstorm-scores-${Date.now()}.json`;
    a.click();
  };

  const isLikelyNpub = (value: string) => /^npub1[02-9ac-hj-np-z]{20,}$/i.test(value.trim());

  const handleSearch = () => {
    const q = (npub || keyword || pubkey || '').trim();

    // Clear previous state for a fresh run
    setSearchError(null);
    setHasSearched(false);

    if (!q) {
      setSearchError({
        code: 'MISSING_QUERY',
        title: 'Enter a search value',
        message: activeTab === 'npub'
          ? 'Paste an npub to look up a profile.'
          : 'Type a keyword to search identities (prototype preview).',
      });
      return;
    }

    if (activeTab === 'npub' && !isLikelyNpub(q)) {
      setSearchError({
        code: 'INVALID_NPUB',
        title: 'That doesn’t look like a valid npub',
        message: 'Npubs start with “npub1…” and are Bech32-encoded.',
      });
      return;
    }

    setSearchQuery(q);
    setIsSearching(true);

    // Simulate a realistic outcome mix (UI-only)
    setTimeout(() => {
      // 18%: not found, 8%: relay timeout
      const r = Math.random();

      if (r < 0.08) {
        setIsSearching(false);
        setHasSearched(true);
        setSearchError({
          code: 'RELAY_TIMEOUT',
          title: 'Relay timeout',
          message: 'We couldn’t confirm this identity from your selected relays. Try again.',
        });
        return;
      }

      if (r < 0.26) {
        setIsSearching(false);
        setHasSearched(true);
        setSearchError({
          code: 'NOT_FOUND',
          title: 'No profile found',
          message: 'We couldn’t find that npub on your selected relays.',
        });
        return;
      }

      setIsSearching(false);
      setHasSearched(true);
      setSearchError(null);
    }, 1500);
  };

  const mockResult = {
    npub: 'npub1qf3l7p7y3s0k9f8k2d8p5q0u8v6m2r6y7q0y2j3f7g9c8m9s2x3p4q',
    displayName: searchQuery || 'Profile',
    nip05: 'sovereign@nostr.example',
    about: 'Independent operator. Minimal surface area. Strong keys. Calm signals.',
    avatar: 'https://api.dicebear.com/7.x/shapes/png?seed=brainstorm-nostr&backgroundColor=b6c6ff,ccd6ff,dae1ff&radius=16',
    trustScore: 92,
    following: 847,
    followers: 12340,
    followsYou: true,
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { 
      opacity: 1,
      transition: { 
        staggerChildren: 0.1
      }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 }
  };

  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const placeholders = [
    "e.g. Satoshi Nakamoto",
    "e.g. Protocol Developers",
    "e.g. Privacy Advocates", 
    "e.g. Bitcoin Core",
    "e.g. Trust Networks"
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      setPlaceholderIndex((current) => (current + 1) % placeholders.length);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 font-sans selection:bg-indigo-500/30 flex flex-col relative overflow-hidden"
      data-testid="page-search"
    >
      {/* Mobile Navigation */}
      <MobileNavigation 
        currentUser={currentUser} 
        handleSignOut={handleSignOut} 
        handleExport={handleExport}
        setLocation={setLocation}
      />
      {/* Background Noise Texture */}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none z-0" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.65%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E")' }} />
      {/* Background Effects - High Tier Tech Aesthetic */}
      <div className="absolute inset-0 bg-[#F8FAFC] pointer-events-none" />
      {/* Subtle Engineering Grid */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#E2E8F0_1px,transparent_1px),linear-gradient(to_bottom,#E2E8F0_1px,transparent_1px)] bg-[size:40px_40px] opacity-[0.4] pointer-events-none" />
      {/* Professional Depth Gradients - Clean & Crisp */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div 
          className="absolute -top-[20%] -left-[10%] w-[80%] h-[80%] rounded-full bg-slate-200/40 blur-[120px]"
          animate={{ 
            x: [0, 20, 0], 
            scale: [1, 1.05, 1],
          }}
          transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div 
          className="absolute top-[10%] -right-[20%] w-[80%] h-[80%] rounded-full bg-indigo-100/30 blur-[140px]"
          animate={{ 
            x: [0, -30, 0], 
            scale: [1, 1.1, 1],
          }}
          transition={{ duration: 25, repeat: Infinity, ease: "easeInOut", delay: 2 }}
        />
        
        {/* Tech Accent Blob */}
        <motion.div 
          className="absolute bottom-[10%] left-[20%] w-[40%] h-[40%] rounded-full bg-violet-100/20 blur-[100px]"
          animate={{ 
            y: [0, -40, 0],
            opacity: [0.3, 0.6, 0.3],
          }}
          transition={{ duration: 18, repeat: Infinity, ease: "easeInOut", delay: 5 }}
        />
      </div>
      <svg className="absolute inset-0 w-full h-full pointer-events-none z-0">
        {connectionPairs.map(([a, b], i) => (
          <motion.line
            key={i}
            x1={`${floatingNodes[a].x}%`}
            y1={`${floatingNodes[a].y}%`}
            x2={`${floatingNodes[b].x}%`}
            y2={`${floatingNodes[b].y}%`}
            stroke="url(#lineGradient)"
            strokeWidth="1.5"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: [0.1, 0.4, 0.1] }}
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
            <stop offset="0%" stopColor="#6366f1" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.4" />
          </linearGradient>
        </defs>
      </svg>
      {floatingNodes.map((node) => (
        <motion.div
          key={node.id}
          className="absolute rounded-full bg-white border-2 border-indigo-100 z-0 shadow-sm"
          style={{
            left: `${node.x}%`,
            top: `${node.y}%`,
            width: node.size + 6,
            height: node.size + 6,
          }}
          animate={{
            y: [0, -30, 0],
            opacity: [0.4, 0.8, 0.4],
            scale: [1, 1.1, 1],
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
          className="absolute text-[11px] font-mono text-indigo-900/30 font-semibold pointer-events-none select-none hidden md:block tracking-widest uppercase z-0"
          style={{
            left: `${5 + (i % 4) * 25}%`,
            top: `${10 + Math.floor(i / 4) * 70}%`,
          }}
          animate={{
            opacity: [0.2, 0.6, 0.2],
            y: [0, -20, 0],
          }}
          transition={{
            duration: 8,
            repeat: Infinity,
            delay: i * 1.5,
            ease: "easeInOut",
          }}
        >
          {calc}
        </motion.div>
      ))}
      {/* Desktop Navigation (match Dashboard) */}
      <nav className="bg-slate-950 border-b border-white/10 sticky top-0 z-50 hidden lg:block" data-testid="nav-desktop">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 sm:py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4 sm:gap-6">
              <button
                type="button"
                className="flex items-center gap-2"
                onClick={() => setLocation('/dashboard')}
                data-testid="button-desktop-brand"
              >
                <BrainLogo size={28} className="text-indigo-500" />
                <h1 className="text-lg sm:text-xl font-bold tracking-tight text-white" style={{ fontFamily: "'Space Grotesk', sans-serif" }} data-testid="text-logo">
                  Brainstorm
                </h1>
              </button>

              <div className="hidden lg:flex gap-2" data-testid="row-desktop-nav-links">
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-2 text-slate-400 hover:text-white hover:bg-white/5"
                  onClick={() => setLocation('/dashboard')}
                  data-testid="button-nav-dashboard"
                >
                  <Home className="h-4 w-4" />
                  Dashboard
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-2 text-slate-200 hover:text-white hover:bg-white/5"
                  data-testid="button-nav-search"
                >
                  <SearchIcon className="h-4 w-4" />
                  Search
                </Button>
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-4" data-testid="container-desktop-profile">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <div
                    className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity p-1 rounded-full hover:bg-white/5"
                    role="button"
                    tabIndex={0}
                    data-testid="button-desktop-profile-menu"
                  >
                    <Avatar className="h-9 w-9 border-2 border-white ring-2 ring-white/20 shadow-md" data-testid="img-desktop-avatar">
                      <AvatarImage src={currentUser?.avatar} alt={currentUser?.displayName || 'Anon'} className="object-cover" />
                      <AvatarFallback className="bg-indigo-100 text-indigo-700 font-bold">
                        {(currentUser?.displayName?.charAt(0) || 'U')}
                      </AvatarFallback>
                    </Avatar>
                    <div className="hidden md:flex flex-col items-start mr-2 max-w-[180px]" data-testid="text-desktop-profile-meta">
                      <span className="text-sm font-bold text-white leading-none mb-0.5 truncate" data-testid="text-desktop-profile-name">
                        {currentUser?.displayName || 'Anon'}
                      </span>
                      <span className="text-[10px] text-indigo-300 font-mono leading-none truncate" data-testid="text-desktop-profile-npub">
                        {currentUser?.npub ? `${currentUser.npub.slice(0, 8)}...` : ''}
                      </span>
                    </div>
                  </div>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="w-56 bg-white/95 backdrop-blur-xl border-[#7c86ff]/20"
                  data-testid="menu-desktop-profile"
                >
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-medium leading-none text-slate-900" data-testid="text-desktop-menu-name">
                        {currentUser?.displayName || 'Anon'}
                      </p>
                      <p className="text-xs leading-none text-slate-500" data-testid="text-desktop-menu-npub">
                        {currentUser?.npub ? `${currentUser.npub.slice(0, 16)}...` : ''}
                      </p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator className="bg-indigo-100" />
                  <DropdownMenuItem
                    className="cursor-pointer focus:bg-indigo-50 text-slate-700 focus:text-indigo-700"
                    onClick={() => setLocation('/settings')}
                    data-testid="dropdown-desktop-settings"
                  >
                    <Settings className="mr-2 h-4 w-4 text-indigo-500" />
                    <span>Settings</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="bg-indigo-100" />
                  <DropdownMenuItem
                    className="cursor-pointer text-red-600 focus:bg-red-50 focus:text-red-700"
                    onClick={() => {
                      handleSignOut();
                      setLocation('/');
                    }}
                    data-testid="dropdown-desktop-signout"
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>Sign out</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </nav>
      <main className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 py-12">
        <motion.div
          initial="hidden"
          animate="visible"
          variants={containerVariants}
          className="space-y-8"
        >
          {/* Header */}
          <motion.div variants={itemVariants} className="text-left relative z-10 mb-8 pt-2">
             {/* Decorative Background Glow - Reduced intensity */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[100%] h-[100%] bg-indigo-500/5 blur-[60px] rounded-full pointer-events-none" />

            <div className="flex flex-col items-start gap-3">
              {/* System Badge - More discreet */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/60 border border-[#7c86ff]/10 shadow-sm backdrop-blur-sm"
              >
                <div className="w-1 h-1 rounded-full bg-[#7c86ff] shadow-[0_0_4px_#7c86ff] animate-pulse" />
                <span className="text-[9px] font-bold tracking-[0.15em] text-[#333286] uppercase">Profile Search</span>
              </motion.div>

              <h1 
                className="text-2xl md:text-3xl font-bold tracking-tight relative"
                style={{ fontFamily: "'Space Grotesk', sans-serif" }}
              >
                <span className="bg-clip-text text-transparent bg-gradient-to-r from-[#333286] via-[#7c86ff] to-[#333286] bg-[length:200%_auto] animate-gradient-x drop-shadow-sm block">
                  Explore Nostr
                </span>
              </h1>

              <p className="text-slate-500 text-xs md:text-sm max-w-xl mx-0 leading-relaxed font-light relative text-slate-500/90">
                Tap into the open network to find people, verify identities, and see who is trusted by your community.
              </p>
            </div>
          </motion.div>

          {/* Main Search Card with Tabs */}
          <motion.div variants={itemVariants}>
            <Card className="bg-white/90 backdrop-blur-xl border-[#7c86ff]/20 shadow-[0_0_15px_rgba(124,134,255,0.07)] overflow-hidden group hover:shadow-[0_20px_40px_-12px_rgba(124,134,255,0.25)] hover:border-[#7c86ff]/40 hover:-translate-y-1 transition-all duration-500 rounded-xl relative">
              <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-transparent to-[#7c86ff]/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
              <div className="h-1 w-full bg-gradient-to-r from-[#7c86ff] via-[#333286] to-[#7c86ff] animate-gradient-x" />
              
              <Tabs defaultValue="npub" className="w-full" onValueChange={(v) => setActiveTab((v as any) || 'npub')}>
                <CardHeader className="bg-gradient-to-b from-[#7c86ff]/15 to-white/60 border-b border-[#7c86ff]/10 py-4 px-5 transition-colors duration-500 group-hover:from-[#7c86ff]/25 group-hover:to-white/80">
                  <div className="flex flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-white border border-slate-100 shadow-sm text-[#333286] ring-1 ring-slate-100">
                        <EnterpriseSearchIcon className="h-4 w-4" />
                      </div>
                      <div className="bg-white/50 backdrop-blur-sm px-4 py-2 rounded-2xl border border-slate-100 shadow-sm relative group/bubble">
                        <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-[#7c86ff]/5 to-[#333286]/5 opacity-0 group-hover/bubble:opacity-100 transition-opacity duration-500" />
                        <CardTitle className="text-sm font-bold text-slate-800 tracking-tight relative z-10" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Profile Discovery</CardTitle>
                        <CardDescription className="text-slate-500 text-[10px] font-medium uppercase tracking-wide relative z-10">
                          Trust Search
                        </CardDescription>
                      </div>
                    </div>
                    
                    <div className="px-2 py-1 rounded-full bg-[#7c86ff]/10 text-[10px] font-bold text-[#333286] border border-[#7c86ff]/20 uppercase tracking-wider flex items-center gap-1.5 shrink-0 self-start sm:self-center">
                      <img src="/nostr-ostrich.gif" alt="Nostr" className="h-4 w-auto" />
                      <span className="hidden sm:inline">NOSTR</span>
                      <span className="sm:hidden">NOSTR</span>
                    </div>
                  </div>

                  <TabsList className="mt-6 w-full grid grid-cols-2 h-auto p-1 bg-slate-100/50 rounded-lg border border-slate-200/50">
                    <TabsTrigger value="npub" className="data-[state=active]:bg-white data-[state=active]:text-[#333286] data-[state=active]:shadow-sm data-[state=active]:border-slate-200 py-2 sm:py-2.5 text-[10px] sm:text-xs font-bold uppercase tracking-wide text-slate-500 transition-all flex flex-col sm:flex-row items-center justify-center gap-1.5">
                      <User className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      <span><span className="lg:hidden">Npub</span><span className="hidden lg:inline">Public Key</span></span>
                    </TabsTrigger>
                    <TabsTrigger
                      value="keyword"
                      disabled
                      className="data-[state=active]:bg-white data-[state=active]:text-[#333286] data-[state=active]:shadow-sm data-[state=active]:border-slate-200 py-2 sm:py-2.5 text-[10px] sm:text-xs font-bold uppercase tracking-wide text-slate-400 transition-all flex flex-col sm:flex-row items-center justify-center gap-1.5 opacity-70 cursor-not-allowed"
                      data-testid="tab-keyword-coming-soon"
                    >
                      <SearchIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      <span className="inline-flex items-center gap-2">
                        <span><span className="lg:hidden">Keyword</span><span className="hidden lg:inline">Keyword Search</span></span>
                        <span className="rounded-full bg-[#333286] text-white border border-[#333286]/40 px-2 py-0.5 text-[9px] font-bold tracking-wider uppercase shadow-sm">
                          Coming soon
                        </span>
                      </span>
                    </TabsTrigger>
                  </TabsList>
                </CardHeader>
                
                <CardContent className="space-y-4 p-5 bg-white/60 min-h-[180px]">
                  <TabsContent value="keyword" className="mt-0 focus-visible:outline-none data-[state=inactive]:hidden">
                    <motion.div 
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3 }}
                      className="flex flex-col gap-4 py-4"
                    >
                      <div className="flex items-center gap-3 mb-2">
                        <div className="p-1.5 rounded-lg bg-[#7c86ff]/10 text-[#333286]">
                          <WordCloudIcon className="h-4 w-4" />
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-slate-700">Identity Search</h4>
                          <p className="text-[10px] text-slate-500 uppercase tracking-wide">Find profiles by name, NIP-05, or attributes</p>
                        </div>
                      </div>

                      <div className="flex gap-2 items-center">
                        <div className="relative flex-1 group/input">
                          <div className="absolute -inset-0.5 bg-gradient-to-r from-[#7c86ff] to-[#333286] rounded-lg opacity-20 group-hover/input:opacity-50 blur transition duration-500"></div>
                          <Input 
                            placeholder={placeholders[placeholderIndex]}
                            className="relative bg-white/90 backdrop-blur-sm border-[#7c86ff]/30 shadow-[0_0_10px_rgba(124,134,255,0.05)] text-slate-900 placeholder:text-slate-400 focus:border-[#7c86ff] focus:ring-2 focus:ring-[#7c86ff]/20 h-11 rounded-lg transition-all font-mono text-sm shadow-sm focus:shadow-[0_0_20px_rgba(124,134,255,0.2)]"
                            value={keyword}
                            onChange={(e) => setKeyword(e.target.value)}
                            data-testid="input-keyword"
                          />
                          <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                            <kbd className="hidden sm:inline-flex h-5 items-center gap-1 rounded border border-slate-200 bg-slate-50 px-1.5 font-mono text-[10px] font-medium text-slate-400 shadow-sm">
                              <span className="text-xs">⌘</span>K
                            </kbd>
                          </div>
                        </div>
                        <Button onClick={handleSearch} className="h-11 px-6 bg-[#333286] hover:bg-[#2a2970] text-white shadow-lg shadow-[#333286]/20 font-bold tracking-wide text-xs" data-testid="button-keyword-lookup">
                          LOOKUP
                        </Button>
                      </div>
                    </motion.div>
                  </TabsContent>

                  <TabsContent value="npub" className="mt-0 focus-visible:outline-none data-[state=inactive]:hidden">
                    <motion.div 
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3 }}
                      className="flex flex-col gap-4 py-4"
                    >
                      <div className="flex items-center gap-3 mb-2">
                        <div className="p-1.5 rounded-lg bg-[#7c86ff]/10 text-[#333286]">
                          <EnterpriseUserIcon className="h-4 w-4" />
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-slate-700">Npub Lookup</h4>
                          <p className="text-[10px] text-slate-500 uppercase tracking-wide">Enter a Bech32-encoded public key</p>
                        </div>
                      </div>
                      
                      <div className="flex gap-2 items-center">
                         <div className="relative flex-1 group/input">
                           <div className="absolute -inset-0.5 bg-gradient-to-r from-[#7c86ff] to-[#333286] rounded-lg opacity-20 group-hover/input:opacity-50 blur transition duration-500"></div>
                           <Input 
                             placeholder="npub1..." 
                             className={
                               "relative bg-white/90 backdrop-blur-sm border-[#7c86ff]/30 shadow-[0_0_10px_rgba(124,134,255,0.05)] text-slate-900 placeholder:text-slate-400 focus:border-[#7c86ff] focus:ring-2 focus:ring-[#7c86ff]/20 h-11 rounded-lg transition-all font-mono text-sm flex-1 shadow-sm focus:shadow-[0_0_20px_rgba(124,134,255,0.2)]" +
                               (searchError?.code === 'INVALID_NPUB' ? ' border-red-300 focus:border-red-400 focus:ring-red-200/40' : '')
                             }
                             value={npub}
                             onChange={(e) => {
                               setNpub(e.target.value);
                               if (searchError) setSearchError(null);
                             }}
                             aria-invalid={searchError?.code === 'INVALID_NPUB'}
                             data-testid="input-npub"
                           />
                         </div>
                         <Button
                           onClick={handleSearch}
                           className="h-11 px-6 bg-[#333286] hover:bg-[#2a2970] text-white shadow-lg shadow-[#333286]/20 font-bold tracking-wide text-xs"
                           data-testid="button-npub-lookup"
                         >
                           LOOKUP
                         </Button>
                      </div>

                      <AnimatePresence initial={false}>
                        {activeTab === 'npub' && searchError?.code === 'INVALID_NPUB' && (
                          <motion.div
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 6 }}
                            transition={{ duration: 0.18 }}
                            className="-mt-1 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2"
                            data-testid="alert-search-invalid-npub"
                          >
                            <div className="mt-0.5 h-5 w-5 rounded-full bg-red-600/10 text-red-700 flex items-center justify-center shrink-0" aria-hidden="true">
                              <Info className="h-3.5 w-3.5" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-[11px] font-bold text-red-900" data-testid="text-search-invalid-npub-title">{searchError.title}</p>
                              <p className="text-[11px] text-red-800/80" data-testid="text-search-invalid-npub-body">{searchError.message}</p>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  </TabsContent>


                </CardContent>
              </Tabs>
            </Card>
          </motion.div>
          
          {/* Search Flow */}
          <AnimatePresence>
            {isSearching && (
              <motion.div
                initial={{ opacity: 0, height: 0, marginTop: 0 }}
                animate={{ opacity: 1, height: 'auto', marginTop: 24 }}
                exit={{ opacity: 0, height: 0, marginTop: 0 }}
                className="overflow-hidden"
                data-testid="panel-search-processing"
              >
                <div className="relative w-full rounded-xl overflow-hidden bg-slate-900 border border-indigo-500/30 shadow-[0_0_40px_-10px_rgba(99,102,241,0.3)]">
                  {/* Background effects */}
                  <div className="absolute inset-0 bg-gradient-to-r from-indigo-900/40 via-violet-900/40 to-slate-900/40 backdrop-blur-md" />

                  <ComputingBackground />

                  {/* Animated scanning line */}
                  <motion.div
                    className="absolute top-0 bottom-0 w-1 bg-indigo-500/50 blur-[4px]"
                    animate={{ left: ['0%', '100%'] }}
                    transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                  />

                  <div className="relative z-10 p-8 flex flex-col items-center text-center">
                    <div className="w-12 h-12 rounded-full bg-indigo-500/10 flex items-center justify-center mb-4 border border-indigo-500/20">
                      <OstrichIcon className="h-6 w-6 text-indigo-400 animate-pulse" />
                    </div>

                    <h3 className="text-xl font-bold text-white mb-2 tracking-tight" data-testid="text-search-processing-title">
                      Analyzing Trust Signals...
                    </h3>

                    <p className="text-indigo-200/60 text-sm font-mono mb-6" data-testid="text-search-processing-subtitle">
                      Querying Decentralized Identity Network
                    </p>

                    <div className="w-full max-w-md bg-slate-800/50 rounded-full h-1.5 overflow-hidden" aria-hidden="true">
                      <motion.div
                        className="h-full bg-gradient-to-r from-indigo-500 to-violet-500"
                        initial={{ width: "0%" }}
                        animate={{ width: "100%" }}
                        transition={{ duration: 1.5, ease: "linear" }}
                      />
                    </div>

                    <p className="text-slate-500 text-[10px] mt-3 uppercase tracking-widest" data-testid="text-search-processing-eta">
                      Estimated time: ~2 seconds
                    </p>

                    <div className="mt-6 text-xs text-indigo-300/60 font-mono border-t border-indigo-500/10 pt-4 w-full flex items-center justify-center">
                      <span data-testid="text-search-processing-query">Query: <span className="text-indigo-200">{searchQuery || '...'}</span></span>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {!isSearching && hasSearched && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                transition={{ duration: 0.25 }}
                className="mt-6"
                data-testid="panel-search-result"
              >
                {searchError?.code === 'NOT_FOUND' || searchError?.code === 'RELAY_TIMEOUT' ? (
                  <Card className="bg-white border-slate-200 shadow-xl rounded-xl overflow-hidden relative" data-testid="card-search-empty-state">
                    <div className="pointer-events-none absolute inset-0 rounded-xl ring-1 ring-inset ring-[#333286]/8" aria-hidden="true" />
                    <div className="p-7 sm:p-8 flex flex-col sm:flex-row gap-6 items-start">
                      <div className="relative">
                        <div className={
                          "absolute -inset-1 rounded-2xl blur-md opacity-70 " +
                          (searchError.code === 'RELAY_TIMEOUT'
                            ? 'bg-gradient-to-br from-amber-400/40 to-[#333286]/20'
                            : 'bg-gradient-to-br from-[#7c86ff]/40 to-[#333286]/25')
                        } aria-hidden="true" />
                        <div
                          className={
                            "relative h-14 w-14 sm:h-16 sm:w-16 rounded-2xl border shadow-sm flex items-center justify-center " +
                            (searchError.code === 'RELAY_TIMEOUT'
                              ? 'border-amber-200 bg-amber-50 text-amber-700'
                              : 'border-slate-200 bg-slate-50 text-[#333286]')
                          }
                          data-testid="icon-search-empty"
                        >
                          <SearchIcon className="h-6 w-6" />
                        </div>
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold tracking-wider uppercase text-slate-400" data-testid="text-search-empty-kicker">
                          {searchError.code === 'RELAY_TIMEOUT' ? 'Network' : 'Lookup'}
                        </p>
                        <h3
                          className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight"
                          style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                          data-testid="text-search-empty-title"
                        >
                          {searchError.title}
                        </h3>
                        <p className="mt-2 text-sm text-slate-600 leading-relaxed" data-testid="text-search-empty-body">
                          {searchError.message}
                        </p>

                        <div className="mt-5 flex flex-wrap items-center gap-2" data-testid="row-search-empty-actions">
                          <Button
                            type="button"
                            onClick={handleSearch}
                            className={
                              "h-10 rounded-xl px-4 font-bold tracking-wide text-xs shadow-sm " +
                              (searchError.code === 'RELAY_TIMEOUT'
                                ? 'bg-amber-600 hover:bg-amber-700 text-white'
                                : 'bg-[#333286] hover:bg-[#2a2970] text-white')
                            }
                            data-testid="button-search-retry"
                          >
                            Try again
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                              setHasSearched(false);
                              setSearchError(null);
                              setSearchQuery('');
                            }}
                            className="h-10 rounded-xl px-4 border-slate-200 bg-white"
                            data-testid="button-search-clear"
                          >
                            Clear
                          </Button>
                        </div>

                        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5" data-testid="note-search-empty">
                          <p className="text-[11px] text-slate-600" data-testid="text-search-empty-note">
                            Tip: if this is a brand-new identity, it may not have published metadata yet.
                          </p>
                        </div>
                      </div>
                    </div>
                  </Card>
                ) : (
                  <Card className="bg-white border-slate-200 shadow-xl rounded-xl overflow-hidden relative">
                  <div className="pointer-events-none absolute inset-0 rounded-xl ring-1 ring-inset ring-[#333286]/8" aria-hidden="true" />
                  <div className="pointer-events-none absolute inset-0 rounded-xl ring-1 ring-inset ring-[#7c86ff]/14 opacity-0 transition-opacity duration-300 group-hover:opacity-100" aria-hidden="true" />
                  <div className="pointer-events-none absolute -inset-[1px] rounded-[14px] bg-gradient-to-r from-[#7c86ff]/14 via-transparent to-[#333286]/12 opacity-45 blur-[12px]" aria-hidden="true" />
                  <div className="pointer-events-none absolute inset-0 rounded-xl bg-gradient-to-b from-[#7c86ff]/5 via-transparent to-transparent" aria-hidden="true" />

                  <div className="p-5 sm:p-6 flex flex-col sm:flex-row gap-5 items-start">
                    <div className="relative">
                      <div className="absolute -inset-1 rounded-2xl bg-gradient-to-br from-[#7c86ff]/40 to-[#333286]/30 blur-md opacity-60" aria-hidden="true" />
                      <img
                        src={download_1769440914094}
                        alt={mockResult.displayName}
                        className="relative h-14 w-14 sm:h-16 sm:w-16 rounded-2xl border border-slate-200 bg-white object-cover shadow-sm"
                        data-testid="img-search-result-avatar"
                      />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xs font-bold tracking-wider uppercase text-slate-400" data-testid="text-search-result-kicker">Profile Found</p>
                          <h3
                            className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight break-words"
                            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                            data-testid="text-search-result-name"
                            title={mockResult.displayName}
                          >
                            {mockResult.displayName}
                          </h3>
                          <div className="mt-1 flex items-center gap-2 min-w-0" data-testid="row-search-result-npub">
                            <button
                              type="button"
                              className="text-[11px] text-slate-500 font-mono truncate min-w-0 text-left hover:text-[#333286] transition-colors"
                              data-testid="button-copyable-npub"
                              title="Tap to copy"
                              onClick={async () => {
                                try {
                                  await navigator.clipboard.writeText(mockResult.npub);
                                } catch {
                                  // no-op
                                }
                              }}
                            >
                              {mockResult.npub}
                            </button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 rounded-xl text-slate-500 hover:text-[#333286] hover:bg-[#333286]/5"
                              onClick={async () => {
                                try {
                                  await navigator.clipboard.writeText(mockResult.npub);
                                } catch {
                                  // no-op
                                }
                              }}
                              aria-label="Copy npub"
                              data-testid="button-copy-npub"
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                          </div>

                          <div className="mt-1 flex items-center gap-2 min-w-0" data-testid="row-search-result-nip05">
                            <button
                              type="button"
                              className="text-[11px] text-[#333286] font-semibold truncate min-w-0 text-left hover:text-[#252463] transition-colors"
                              title="Tap to copy"
                              data-testid="button-copyable-nip05"
                              onClick={async () => {
                                try {
                                  await navigator.clipboard.writeText(mockResult.nip05);
                                } catch {
                                  // no-op
                                }
                              }}
                            >
                              {mockResult.nip05}
                            </button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 rounded-xl text-[#333286]/70 hover:text-[#333286] hover:bg-[#333286]/5"
                              onClick={async () => {
                                try {
                                  await navigator.clipboard.writeText(mockResult.nip05);
                                } catch {
                                  // no-op
                                }
                              }}
                              aria-label="Copy NIP-05"
                              data-testid="button-copy-nip05"
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                          </div>

                          <div className="mt-2 flex flex-wrap items-center gap-2" data-testid="row-search-result-follow-stats">
                            <span
                              className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-b from-white to-slate-50 border border-slate-200 px-3 py-1.5 text-[11px] font-bold text-slate-700 shadow-sm shadow-slate-900/5"
                              data-testid="stat-following"
                            >
                              <span className="text-slate-500">Following</span>
                              <span className="text-slate-900" data-testid="text-following-count">{mockResult.following.toLocaleString()}</span>
                            </span>
                            <span
                              className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-b from-white to-slate-50 border border-slate-200 px-3 py-1.5 text-[11px] font-bold text-slate-700 shadow-sm shadow-slate-900/5"
                              data-testid="stat-followers"
                            >
                              <span className="text-slate-500">Followers</span>
                              <span className="text-slate-900" data-testid="text-followers-count">{mockResult.followers.toLocaleString()}</span>
                            </span>

                            <span
                              className={
                                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-bold shadow-sm " +
                                (mockResult.followsYou
                                  ? "bg-gradient-to-b from-emerald-50 to-white border-emerald-200 text-emerald-700 shadow-emerald-900/5"
                                  : "bg-gradient-to-b from-white to-slate-50 border-slate-200 text-slate-600 shadow-slate-900/5")
                              }
                              data-testid="badge-follows-you"
                              title={mockResult.followsYou ? "This account follows you" : "This account does not follow you"}
                            >
                              <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" aria-hidden="true" />
                              {mockResult.followsYou ? "Follows you" : "Not following you"}
                            </span>
                          </div>
                        </div>

                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div
                                className="w-full sm:w-auto shrink-0 rounded-2xl border border-[#7c86ff]/20 bg-gradient-to-b from-[#7c86ff]/10 to-white px-4 py-3 shadow-sm cursor-help"
                                data-testid="card-search-result-trust"
                              >
                                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500" data-testid="text-search-result-trust-label">Trust Score</p>
                                <div className="mt-1 flex items-end gap-2" data-testid="row-search-result-trust-value">
                                  <span className="text-2xl font-extrabold text-[#333286]" data-testid="text-search-result-trust-score">{mockResult.trustScore}</span>
                                  <span className="text-[11px] font-bold text-slate-400" data-testid="text-search-result-trust-denom">/ 100</span>
                                </div>
                                <div className="mt-2 h-1.5 w-full rounded-full bg-slate-100 overflow-hidden" aria-hidden="true" data-testid="bar-search-result-trust">
                                  <div className="h-full rounded-full bg-gradient-to-r from-[#333286] to-[#7c86ff]" style={{ width: `${mockResult.trustScore}%` }} />
                                </div>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent
                              side="bottom"
                              align="end"
                              sideOffset={10}
                              className="bg-white/98 backdrop-blur-xl border border-slate-300/90 shadow-[0_16px_45px_rgba(15,23,42,0.55)] rounded-lg px-3.5 py-2 max-w-xs"
                              data-testid="tooltip-search-result-trust-score"
                            >
                              <p className="text-[11px] font-semibold text-slate-900 mb-1" data-testid="text-tooltip-trust-title">Trust score</p>
                              <p className="text-[10px] leading-snug text-slate-600" data-testid="text-tooltip-trust-body">
                                0–100 indicator derived from the mix of highly trusted, neutral, low-trust, and flagged profiles in their network.
                              </p>
                              <p className="text-[10px] leading-snug text-slate-500 mt-1" data-testid="text-tooltip-trust-body-2">
                                Highly trusted connections pull the score up more than neutral or risky ones.
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>

                      <p
                        className="mt-3 text-sm text-slate-600 leading-relaxed break-words"
                        data-testid="text-search-result-about"
                      >
                        {mockResult.about}
                      </p>

                    </div>
                  </div>
                </Card>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Enterprise System Status Bar */}
          <motion.div variants={itemVariants} className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <Card className="bg-white border-slate-200 shadow-lg group hover:border-[#7c86ff]/40 hover:shadow-[0_10px_25px_-5px_rgba(124,134,255,0.2)] hover:-translate-y-1 transition-all duration-300 rounded-xl">
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="p-2.5 rounded-lg bg-[#7c86ff]/5 text-[#333286] border border-[#7c86ff]/10 group-hover:bg-[#7c86ff]/10 group-hover:border-[#7c86ff]/20 transition-colors">
                    <EnterpriseGraphIcon className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="text-[11px] font-bold text-slate-800 uppercase tracking-wider mb-0.5">Neo4j Graph Engine</h4>
                    <p className="text-[11px] text-slate-500 font-medium group-hover:text-[#333286] transition-colors">Active • 99.9% Uptime</p>
                  </div>
                  <div className="ml-auto flex items-center gap-1.5">
                     <div className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)] animate-pulse" />
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-white border-slate-200 shadow-lg group hover:border-[#333286]/40 hover:shadow-[0_10px_25px_-5px_rgba(51,50,134,0.2)] hover:-translate-y-1 transition-all duration-300 rounded-xl">
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="p-2.5 rounded-lg bg-[#333286]/5 text-[#333286] border border-[#333286]/10 group-hover:bg-[#333286]/10 group-hover:border-[#333286]/20 transition-colors">
                    <EnterpriseRelayIcon className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="text-[11px] font-bold text-slate-800 uppercase tracking-wider mb-0.5">Strfry Relay Sync</h4>
                    <p className="text-[11px] text-slate-500 font-medium group-hover:text-[#333286] transition-colors">Connected • 12ms Latency</p>
                  </div>
                  <div className="ml-auto flex items-center gap-1.5">
                     <div className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)] animate-pulse" />
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-white border-slate-200 shadow-lg group hover:border-[#7c86ff]/40 hover:shadow-[0_10px_25px_-5px_rgba(124,134,255,0.2)] hover:-translate-y-1 transition-all duration-300 rounded-xl">
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="p-2.5 rounded-lg bg-[#7c86ff]/5 text-[#333286] border border-[#7c86ff]/10 group-hover:bg-[#7c86ff]/10 group-hover:border-[#7c86ff]/20 transition-colors">
                    <EnterprisePrivacyIcon className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="text-[11px] font-bold text-slate-800 uppercase tracking-wider mb-0.5">Privacy Shield</h4>
                    <p className="text-[11px] text-slate-500 font-medium group-hover:text-[#333286] transition-colors">Observer Mode • Encrypted</p>
                  </div>
                  <div className="ml-auto flex items-center gap-1.5">
                     <Shield className="h-4 w-4 text-slate-400 group-hover:text-[#7c86ff] transition-colors" />
                  </div>
                </CardContent>
              </Card>
            </div>
          </motion.div>
        </motion.div>
      </main>
      <Footer />
    </div>
  );
}
