import React from "react";
import { Brain, KeyRound, ArrowRight, ChevronDown } from "lucide-react";

export function SplitNarrative() {
  return (
    <div className="flex h-screen w-full bg-[#F8FAFC] font-sans text-slate-900 overflow-hidden">
      {/* Left Column: Editorial / Value Panel */}
      <div className="hidden lg:flex w-[45%] flex-col relative bg-indigo-900 text-white overflow-hidden p-12 justify-between">
        <div className="absolute inset-0 z-0">
          <img
            src="/__mockup/images/split-narrative-hero.png"
            alt="Warm human connection trust graph"
            className="w-full h-full object-cover opacity-40 mix-blend-overlay"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-indigo-950 via-indigo-900/60 to-transparent"></div>
        </div>

        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-12">
            <div className="p-2 bg-white/10 rounded-xl backdrop-blur-md border border-white/20">
              <Brain className="w-8 h-8 text-indigo-200" />
            </div>
            <span className="text-2xl font-bold tracking-tight font-['Space_Grotesk'] text-white">
              Brainstorm
            </span>
          </div>
        </div>

        <div className="relative z-10 max-w-md">
          <h1 className="text-4xl font-semibold mb-6 leading-tight text-white/90">
            Trust is earned. <br />
            <span className="text-white">Now it's visible.</span>
          </h1>
          <p className="text-lg text-indigo-200 leading-relaxed">
            Brainstorm maps the relationships that matter. See who your friends trust, 
            build your reputation, and navigate the Nostr network with confidence.
          </p>
          
          <div className="mt-12 flex items-center gap-4 text-sm font-medium text-indigo-300">
            <div className="flex -space-x-3">
              <div className="w-8 h-8 rounded-full border-2 border-indigo-900 bg-indigo-400"></div>
              <div className="w-8 h-8 rounded-full border-2 border-indigo-900 bg-indigo-500"></div>
              <div className="w-8 h-8 rounded-full border-2 border-indigo-900 bg-indigo-600"></div>
            </div>
            <span>Join 10,000+ users building the web of trust</span>
          </div>
        </div>
      </div>

      {/* Right Column: Sign-in Focus */}
      <div className="flex-1 flex flex-col items-center justify-center p-8 relative">
        <div className="w-full max-w-[420px] flex flex-col">
          {/* Mobile Header (Hidden on Desktop) */}
          <div className="flex lg:hidden items-center justify-center gap-2 mb-10">
            <Brain className="w-8 h-8 text-indigo-600" />
            <span className="text-3xl font-bold tracking-tight font-['Space_Grotesk'] bg-clip-text text-transparent bg-gradient-to-r from-indigo-800 to-indigo-500">
              Brainstorm
            </span>
          </div>

          <div className="mb-10 text-center lg:text-left">
            <h2 className="text-2xl font-semibold mb-2">Welcome back</h2>
            <p className="text-slate-500">Sign in to your Brainstorm account</p>
          </div>

          <div className="space-y-4">
            <button className="group w-full text-left rounded-2xl border border-indigo-200 bg-indigo-50/50 hover:bg-indigo-50 hover:border-indigo-300 hover:shadow-sm transition-all p-4 flex items-center gap-4">
              <div className="h-12 w-12 rounded-xl bg-white border border-indigo-100 flex items-center justify-center shrink-0 shadow-sm">
                <svg
                  className="h-6 w-6 text-indigo-600"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="square"
                >
                  <path d="M8.90002 6.74084V1.6709H21.5V20.7008H8.90002L8.91003 15.7108" />
                  <path d="M2 11.1914H14.88" />
                  <path d="M12.65 7.83105L16 11.191L12.65 14.5411" />
                </svg>
              </div>
              <div className="flex-1">
                <p className="text-base font-semibold text-slate-900 group-hover:text-indigo-900 transition-colors">Sign in with your extension</p>
                <p className="text-sm text-slate-500 mt-0.5">Alby, Nos2x & other signers</p>
              </div>
              <ArrowRight className="h-5 w-5 text-indigo-400 group-hover:text-indigo-600 group-hover:translate-x-1 transition-all" />
            </button>

            <button className="w-full inline-flex justify-center items-center gap-2 py-3 text-sm font-semibold text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-xl transition-colors">
              <KeyRound className="h-4 w-4" />
              Use your private key?
            </button>
          </div>

          <div className="my-8 flex items-center gap-4">
            <div className="h-px flex-1 bg-slate-200" />
            <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">
              New to Brainstorm?
            </span>
            <div className="h-px flex-1 bg-slate-200" />
          </div>

          <div className="flex flex-col items-center gap-3">
            <button className="group w-full inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 transition-all shadow-sm">
              Create your account
              <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
            </button>
            <p className="text-xs text-slate-500 font-medium">
              Free, takes a minute — no email required
            </p>
          </div>

          <div className="mt-8 p-5 rounded-2xl bg-slate-50 border border-slate-100 text-sm text-slate-600 text-center leading-relaxed">
            <p className="mb-2">
              <span className="font-semibold text-slate-800">Not your device?</span> Keep your identity private — you can browse Brainstorm anonymously without signing in.
            </p>
            <a href="#" className="font-semibold text-indigo-600 hover:text-indigo-700 transition-colors inline-flex items-center gap-1">
              Learn about anonymous browsing
              <ArrowRight className="w-3 h-3" />
            </a>
          </div>
        </div>

        {/* Footer */}
        <div className="absolute bottom-8 left-8 right-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-medium text-slate-500">
          <button className="inline-flex items-center gap-1.5 hover:text-slate-800 transition-colors px-2 py-1 rounded-md hover:bg-slate-100">
            English (United States) <ChevronDown className="h-3.5 w-3.5" />
          </button>
          <div className="flex items-center gap-6">
            <a href="#" className="hover:text-slate-800 transition-colors">Help</a>
            <a href="#" className="hover:text-slate-800 transition-colors">Privacy</a>
            <a href="#" className="hover:text-slate-800 transition-colors">Terms</a>
          </div>
        </div>
      </div>
    </div>
  );
}
