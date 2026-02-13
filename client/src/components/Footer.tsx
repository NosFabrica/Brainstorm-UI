import { useLocation } from 'wouter';
import { Info, Sparkles, ChevronRight } from 'lucide-react';

export function Footer() {
  const [, setLocation] = useLocation();

  return (
    <footer 
      className="relative z-20 w-screen mt-auto bg-slate-950 animate-[fadeIn_0.6s_ease-out_0.6s_both]"
      data-footer-dark="true"
      style={{ marginLeft: 'calc(50% - 50vw)', paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 24px)' }}
    >
      <div className="w-full px-6 pb-6 pt-4 sm:px-8">
        <div className="hidden sm:block">
          <div className="h-px bg-gradient-to-r from-transparent via-slate-700/50 to-transparent mb-5" />
          
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-5 text-xs text-slate-500">
              <a 
                href="https://nosfabrica.com/" 
                target="_blank" 
                rel="noopener noreferrer"
                className="group transition-transform duration-300 hover:-translate-y-1 hover:scale-110"
                data-testid="link-nosfabrica"
              >
                <img 
                  src="/nosfabrica-logo.png" 
                  alt="Nosfabrica" 
                  className="h-6 w-auto rounded opacity-60 group-hover:opacity-100 transition-all duration-300 group-hover:drop-shadow-[0_0_12px_rgba(255,255,255,0.5)]"
                />
              </a>
              
              <div className="w-px h-4 bg-slate-700/50" />
              
              <a 
                href="https://nostr.how/en/what-is-nostr" 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-[10px] text-slate-500 group cursor-pointer transition-transform duration-300 hover:-translate-y-1 hover:scale-110"
                data-testid="link-nostr"
              >
                <img src="/nostr-ostrich.gif" alt="Nostr" className="h-6 w-auto group-hover:h-8 transition-all duration-200" />
                <span className="text-slate-400 group-hover:text-violet-400 group-hover:font-medium transition-all duration-200">Built on Nostr</span>
              </a>
              
              <div className="w-px h-4 bg-slate-700/50" />
              
              <span 
                className="text-[10px] text-slate-600 font-mono cursor-default hover:text-slate-300 transition-colors duration-300"
              >v0.1.0-alpha</span>
            </div>
            
            <div className="flex items-center gap-4">
              <div 
                className="flex items-center gap-1.5 text-[10px] text-slate-500 cursor-default hover:text-slate-300 transition-colors duration-300"
              >
                <div className="w-1.5 h-1.5 rounded-full bg-violet-500 animate-pulse" />
                <span>Clarity in a fragmented world</span>
              </div>
              
              <div className="w-px h-4 bg-slate-700/50" />
              
              <button 
                className="relative text-indigo-400 hover:text-white text-sm font-medium flex items-center gap-2 transition-all duration-300 group overflow-visible cursor-pointer"
                onClick={() => setLocation('/what-is-wot')}
                data-testid="button-learn-more"
              >
                <div className="absolute -inset-3 rounded-xl bg-gradient-to-r from-indigo-500/20 via-violet-500/20 to-purple-500/20 opacity-0 group-hover:opacity-100 blur-md transition-opacity duration-300" />
                <div className="absolute -inset-2 rounded-lg border border-indigo-500/0 group-hover:border-indigo-500/40 transition-all duration-300" />
                <Info className="h-3.5 w-3.5 relative z-10 group-hover:rotate-12 transition-transform duration-300" />
                <span className="relative z-10">What is Web of Trust?</span>
              </button>
              
              <div className="w-px h-4 bg-slate-700/50" />
              
              <a 
                href="https://megistus.xyz/" 
                target="_blank" 
                rel="noopener noreferrer"
                className="group relative transition-transform duration-300 hover:-translate-y-1 hover:scale-110"
                data-testid="link-megistus"
              >
                <img 
                  src="/megistus-icon-white.png" 
                  alt="Megistus" 
                  className="h-10 w-auto opacity-60 group-hover:opacity-100 transition-all duration-300 group-hover:drop-shadow-[0_0_20px_rgba(255,255,255,0.8)] group-hover:brightness-125 relative z-10"
                />
              </a>
            </div>
          </div>
        </div>
        
        <div className="sm:hidden">
          <div className="h-px bg-gradient-to-r from-transparent via-slate-700/50 to-transparent mb-6" />
          
          <button 
            className="w-full mb-6 py-3 px-4 bg-gradient-to-r from-indigo-500/10 via-violet-500/10 to-purple-500/10 border border-indigo-500/30 rounded-xl flex items-center justify-center gap-3 group active:scale-[0.98] transition-transform cursor-pointer"
            onClick={() => setLocation('/what-is-wot')}
            data-testid="button-learn-more-mobile"
          >
            <Info className="h-4 w-4 text-indigo-400" />
            <span className="text-sm font-medium text-indigo-300">What is Web of Trust?</span>
            <ChevronRight className="h-4 w-4 text-indigo-400/60" />
          </button>
          
          <div className="flex items-center justify-center gap-5 mb-4">
            <a 
              href="https://nosfabrica.com/" 
              target="_blank" 
              rel="noopener noreferrer"
              className="opacity-50 hover:opacity-100 transition-opacity active:scale-95"
              data-testid="link-nosfabrica-mobile"
            >
              <img src="/nosfabrica-logo.png" alt="Nosfabrica" className="h-5 w-auto rounded" />
            </a>
            
            <div className="w-px h-5 bg-slate-700/30" />
            
            <a 
              href="https://nostr.how/en/what-is-nostr" 
              target="_blank" 
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 opacity-50 hover:opacity-100 transition-opacity active:scale-95"
              data-testid="link-nostr-mobile"
            >
              <img src="/nostr-ostrich.gif" alt="Nostr" className="h-5 w-auto" />
              <span className="text-[10px] text-slate-400">Nostr</span>
            </a>
            
            <div className="w-px h-5 bg-slate-700/30" />
            
            <a 
              href="https://megistus.xyz/" 
              target="_blank" 
              rel="noopener noreferrer"
              className="opacity-50 hover:opacity-100 transition-opacity active:scale-95"
              data-testid="link-megistus-mobile"
            >
              <img src="/megistus-icon-white.png" alt="Megistus" className="h-8 w-auto" />
            </a>
          </div>
          
          <div className="text-center mt-1">
            <span className="text-[9px] text-slate-700 font-mono">v0.1.0-beta</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
