import React from "react";
import { Brain, ArrowRight, KeyRound, ChevronDown, Puzzle, ShieldAlert } from "lucide-react";

export function FocusedMinimal() {
  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col font-sans relative overflow-hidden">
      {/* Soft gradient background to keep it from feeling too sterile */}
      <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] rounded-full bg-indigo-200/30 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] rounded-full bg-indigo-100/40 blur-[120px] pointer-events-none" />
      
      <main className="flex-1 flex flex-col items-center justify-center p-6 md:p-12 relative z-10 w-full max-w-[480px] mx-auto">
        
        {/* Oversized Brand Presence */}
        <div className="flex flex-col items-center text-center mb-14">
          <div className="h-24 w-24 bg-indigo-600 rounded-[2rem] flex items-center justify-center shadow-xl shadow-indigo-600/20 mb-8 transform -rotate-3 hover:rotate-0 transition-transform duration-500">
            <Brain className="h-12 w-12 text-white" strokeWidth={2} />
          </div>
          <h1 className="text-[2.75rem] font-bold tracking-tight text-slate-900 font-['Space_Grotesk'] leading-none">
            Brainstorm
          </h1>
          <p className="text-slate-500 mt-4 text-base font-medium">
            Sign in to access your web of trust.
          </p>
        </div>

        <div className="w-full space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
          
          {/* Primary Action */}
          <div className="space-y-5">
            <button className="group w-full relative flex items-center justify-between p-5 bg-white border border-slate-200/80 rounded-3xl shadow-sm hover:border-indigo-300 hover:shadow-md hover:shadow-indigo-500/5 transition-all active:scale-[0.98]">
              <div className="flex items-center gap-5">
                <div className="h-12 w-12 rounded-xl bg-indigo-50 flex items-center justify-center border border-indigo-100">
                  <Puzzle className="h-6 w-6 text-indigo-600" />
                </div>
                <div className="text-left">
                  <h2 className="text-[1.05rem] font-bold text-slate-900">Sign in with your extension</h2>
                  <p className="text-sm text-slate-500 mt-0.5">Alby, Nos2x & other signers</p>
                </div>
              </div>
              <ArrowRight className="h-6 w-6 text-slate-300 group-hover:text-indigo-600 group-hover:translate-x-1 transition-all" />
            </button>

            <div className="flex justify-center">
              <button className="text-sm text-indigo-600 font-semibold hover:text-indigo-700 flex items-center gap-2 transition-colors py-2 px-4 rounded-full hover:bg-indigo-50">
                <KeyRound className="h-4 w-4" />
                Use your private key?
              </button>
            </div>
          </div>

          {/* Divider */}
          <div className="relative py-2">
            <div className="absolute inset-0 flex items-center" aria-hidden="true">
              <div className="w-full border-t border-slate-200"></div>
            </div>
            <div className="relative flex justify-center">
              <span className="bg-[#F8FAFC] px-5 text-[11px] font-bold text-slate-400 uppercase tracking-widest">
                New to Brainstorm?
              </span>
            </div>
          </div>

          {/* Secondary Actions */}
          <div className="text-center space-y-3">
            <button className="w-full flex items-center justify-center gap-2 p-4 bg-white border border-slate-200/80 rounded-2xl text-sm font-bold text-slate-700 hover:bg-slate-50 hover:text-slate-900 hover:border-slate-300 transition-all active:scale-[0.98] shadow-sm">
              Create your account
            </button>
            <p className="text-[13px] text-slate-500">
              Free, takes a minute — no email required
            </p>
          </div>

          {/* Anonymous Note */}
          <div className="mt-10 p-6 bg-slate-100/50 border border-slate-200/60 rounded-3xl text-center">
            <ShieldAlert className="h-6 w-6 text-slate-400 mx-auto mb-3" />
            <p className="text-sm text-slate-600 leading-relaxed font-medium">
              Not your device? Keep your identity private — you can browse Brainstorm anonymously without signing in.
            </p>
            <button className="mt-4 text-[13px] font-bold text-slate-700 hover:text-indigo-600 transition-colors border-b border-transparent hover:border-indigo-600 pb-0.5">
              Learn about anonymous browsing
            </button>
          </div>
          
        </div>
      </main>

      <footer className="w-full p-8 flex flex-col sm:flex-row items-center justify-between gap-6 text-[13px] font-medium text-slate-500 relative z-10">
        <button className="flex items-center gap-2 hover:text-slate-800 transition-colors py-2 px-3 rounded-lg hover:bg-slate-100">
          English (United States)
          <ChevronDown className="h-4 w-4" />
        </button>
        <div className="flex items-center gap-8">
          <a href="#" className="hover:text-slate-800 transition-colors">Help</a>
          <a href="#" className="hover:text-slate-800 transition-colors">Privacy</a>
          <a href="#" className="hover:text-slate-800 transition-colors">Terms</a>
        </div>
      </footer>
    </div>
  );
}
