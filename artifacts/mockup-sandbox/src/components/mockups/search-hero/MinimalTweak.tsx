import { Search } from "lucide-react";
import { BrainMark } from "./_BrainMark";

export function MinimalTweak() {
  return (
    <div className="min-h-screen bg-white flex flex-col font-['Inter'] relative overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-[16vh] -translate-x-1/2 h-40 w-40 rounded-full bg-gradient-to-br from-indigo-200/40 via-violet-200/30 to-transparent blur-3xl"
      />

      <header className="relative z-10 flex items-center justify-end gap-4 px-6 py-4 text-sm text-slate-600">
        <a className="hover:text-slate-900 transition-colors">FAQ</a>
        <a className="rounded-full border border-slate-200 px-4 py-1.5 font-medium text-slate-700 hover:bg-slate-50 transition-colors">
          Sign in
        </a>
      </header>

      <main className="relative z-10 flex-1 flex flex-col items-center px-4">
        <div className="w-full max-w-[560px] flex flex-col items-center pt-[13vh]">
          <BrainMark size={48} className="text-indigo-600 mb-3" />
          <h1
            className="text-[42px] leading-none font-bold tracking-tight mb-3"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
          >
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-indigo-700 via-indigo-500 to-indigo-700">
              Brainstorm
            </span>
          </h1>
          <p className="text-[13px] text-slate-400 mb-8 tracking-wide">
            Search across millions of profiles
          </p>

          <div className="w-full">
            <div className="flex items-center gap-3 w-full h-[52px] px-5 rounded-full bg-white border border-slate-200 shadow-[0_1px_6px_rgba(0,0,0,0.05)] hover:shadow-[0_2px_12px_rgba(0,0,0,0.08)] focus-within:border-indigo-200 focus-within:shadow-[0_2px_12px_rgba(99,102,241,0.12)] transition-all">
              <Search className="h-5 w-5 text-slate-400 shrink-0" />
              <input
                className="flex-1 bg-transparent outline-none text-[15px] text-slate-800 placeholder:text-slate-400/80"
                placeholder="Search by name, bio, website..."
              />
            </div>
          </div>

          <div className="flex items-center justify-center gap-4 mt-6">
            <button className="rounded-xl bg-slate-900 hover:bg-slate-800 text-[14px] font-medium text-white px-6 py-2.5 transition-colors">
              Search
            </button>
            <button className="text-[14px] text-slate-500 hover:text-indigo-600 transition-colors">
              I'm feeling trusted →
            </button>
          </div>
        </div>
      </main>

      <footer className="relative z-10 px-6 py-3 text-[13px] text-slate-400 flex items-center justify-center gap-5">
        <a className="hover:text-slate-600">For developers</a>
        <span className="text-slate-300">·</span>
        <a className="hover:text-slate-600">What is WoT?</a>
      </footer>
    </div>
  );
}
