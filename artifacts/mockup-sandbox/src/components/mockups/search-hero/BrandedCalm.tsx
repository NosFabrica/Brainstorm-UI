import { Search } from "lucide-react";
import { BrainMark } from "./_BrainMark";

export function BrandedCalm() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-slate-50 flex flex-col font-['Inter']">
      <header className="flex items-center justify-end gap-4 px-6 py-4 text-sm text-slate-600">
        <a className="hover:text-slate-900 transition-colors">FAQ</a>
        <a className="rounded-full bg-indigo-600 px-4 py-1.5 font-medium text-white hover:bg-indigo-500 transition-colors">
          Sign in
        </a>
      </header>

      <main className="flex-1 flex flex-col items-center px-4">
        <div className="w-full max-w-[600px] flex flex-col items-center pt-[12vh]">
          <div className="flex items-center gap-3 mb-3">
            <BrainMark size={46} className="text-indigo-600" />
            <span
              className="text-[44px] leading-none font-semibold tracking-tight text-slate-900"
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}
            >
              Brainstorm
            </span>
          </div>

          <p className="text-[15px] text-slate-500 mb-8">
            Search across millions of trusted profiles
          </p>

          <div className="w-full">
            <div className="flex items-center gap-3 w-full h-[52px] px-5 rounded-full bg-white border border-slate-200 shadow-[0_1px_8px_rgba(99,102,241,0.08)] hover:shadow-[0_2px_14px_rgba(99,102,241,0.14)] focus-within:border-indigo-300 focus-within:shadow-[0_2px_14px_rgba(99,102,241,0.18)] transition-all">
              <Search className="h-5 w-5 text-indigo-400 shrink-0" />
              <input
                className="flex-1 bg-transparent outline-none text-[16px] text-slate-800 placeholder:text-slate-400"
                placeholder="Search by name, bio, website…"
              />
            </div>
          </div>

          <div className="flex items-center justify-center gap-3 mt-7">
            <button className="rounded-md bg-indigo-600 hover:bg-indigo-500 text-[14px] font-medium text-white px-6 py-2.5 shadow-sm transition-colors">
              Search
            </button>
            <button className="rounded-md bg-white border border-slate-200 hover:bg-slate-50 text-[14px] text-slate-700 px-6 py-2.5 transition-colors">
              Surprise me
            </button>
          </div>

          <p className="text-[12px] text-slate-400 mt-10 max-w-sm text-center leading-relaxed">
            No login needed — explore the network from the NosFabrica trust
            perspective, or sign in for your own Web of Trust.
          </p>
        </div>
      </main>

      <footer className="px-6 py-3 text-[13px] text-slate-400 flex items-center justify-center gap-5">
        <a className="hover:text-slate-600">For developers</a>
        <span className="text-slate-300">·</span>
        <a className="hover:text-slate-600">What is WoT?</a>
        <span className="text-slate-300">·</span>
        <a className="hover:text-slate-600">FAQ</a>
      </footer>
    </div>
  );
}
