import { Search } from "lucide-react";
import { BrainMark } from "./_BrainMark";

export function PureGoogle() {
  return (
    <div className="min-h-screen bg-white flex flex-col font-['Inter']">
      <header className="flex items-center justify-end gap-4 px-6 py-4 text-sm text-slate-600">
        <a className="hover:text-slate-900 transition-colors">FAQ</a>
        <a className="rounded-full border border-slate-200 px-4 py-1.5 font-medium text-slate-700 hover:bg-slate-50 transition-colors">
          Sign in
        </a>
      </header>

      <main className="flex-1 flex flex-col items-center px-4">
        <div className="w-full max-w-[584px] flex flex-col items-center pt-[14vh]">
          <div className="flex items-center gap-3 mb-7">
            <BrainMark size={52} className="text-indigo-600" />
            <span
              className="text-5xl font-semibold tracking-tight text-slate-900"
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}
            >
              Brainstorm
            </span>
          </div>

          <div className="w-full group">
            <div className="flex items-center gap-3 w-full h-12 px-5 rounded-full bg-white border border-transparent shadow-[0_1px_6px_rgba(32,33,36,0.18)] hover:shadow-[0_1px_10px_rgba(32,33,36,0.26)] focus-within:shadow-[0_1px_10px_rgba(32,33,36,0.26)] transition-shadow">
              <Search className="h-5 w-5 text-slate-400 shrink-0" />
              <input
                className="flex-1 bg-transparent outline-none text-[16px] text-slate-800 placeholder:text-slate-400"
                placeholder=""
                defaultValue=""
              />
            </div>
          </div>

          <div className="flex items-center justify-center gap-3 mt-7">
            <button className="rounded bg-[#f8f9fa] border border-[#f8f9fa] hover:border-slate-200 hover:shadow-sm text-[14px] text-slate-700 px-4 py-2 transition-all">
              Brainstorm Search
            </button>
            <button className="rounded bg-[#f8f9fa] border border-[#f8f9fa] hover:border-slate-200 hover:shadow-sm text-[14px] text-slate-700 px-4 py-2 transition-all">
              I'm Feeling Trusted
            </button>
          </div>
        </div>
      </main>

      <footer className="border-t border-slate-100 bg-[#f8f9fa] px-6 py-3 text-[13px] text-slate-500 flex items-center justify-between">
        <span>Search by trust, not pages</span>
        <div className="flex items-center gap-5">
          <a className="hover:text-slate-700">For developers</a>
          <a className="hover:text-slate-700">What is WoT?</a>
        </div>
      </footer>
    </div>
  );
}
