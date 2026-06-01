import { useLocation } from "wouter";
import { useState, useEffect, type FormEvent } from "react";
import { Search, ArrowRight } from "lucide-react";
import { ComputingBackground } from "@/components/ComputingBackground";
import { BrainLogo } from "@/components/BrainLogo";
import { SignInButton } from "@/components/SignInButton";
import { getCurrentUser } from "@/services/nostr";

export default function Landing() {
  const [, setLocation] = useLocation();
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (getCurrentUser()) {
      setLocation("/dashboard", { replace: true });
    }
  }, [setLocation]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    setLocation(q ? `/search?q=${encodeURIComponent(q)}` : "/search");
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 flex flex-col relative overflow-hidden" data-testid="page-home">
      <ComputingBackground variant="light" />

      <header className="relative z-20 flex items-center justify-between px-4 sm:px-8 py-4">
        <button
          type="button"
          onClick={() => setLocation("/about")}
          className="text-sm font-medium text-slate-500 hover:text-indigo-600 transition-colors"
          data-testid="link-home-about"
        >
          About
        </button>
        <SignInButton
          variant="primary"
          label="Sign in"
          data-testid="button-home-sign-in"
        />
      </header>

      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 -mt-10 sm:-mt-16">
        <div className="w-full max-w-2xl mx-auto text-center" style={{ animation: "homeFadeUp 0.5s ease-out" }}>
          <style>{`@keyframes homeFadeUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }`}</style>

          <div className="flex flex-col items-center mb-8">
            <div className="flex items-center gap-2 mb-1.5">
              <BrainLogo size={32} className="text-indigo-600" />
              <h1
                className="text-3xl sm:text-4xl font-bold tracking-tight"
                style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                data-testid="text-home-title"
              >
                <span className="bg-clip-text text-transparent bg-gradient-to-r from-indigo-800 via-indigo-500 to-indigo-800">
                  Brainstorm
                </span>
              </h1>
            </div>
            <p className="text-slate-500 text-sm sm:text-base" data-testid="text-home-subtitle">
              Search across millions of profiles
            </p>
          </div>

          <form onSubmit={onSubmit} className="relative group" data-testid="form-home-search">
            <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500/0 via-indigo-400/15 to-indigo-500/0 blur-xl rounded-full opacity-0 group-focus-within:opacity-100 transition-opacity duration-500 pointer-events-none" />
            <div className="relative flex items-center gap-2 bg-white border border-slate-200 rounded-full pl-5 pr-2 py-2 shadow-[0_2px_12px_rgba(0,0,0,0.06)] hover:shadow-[0_4px_18px_rgba(0,0,0,0.08)] focus-within:border-indigo-300 focus-within:shadow-[0_4px_18px_rgba(99,102,241,0.12)] transition-all duration-300">
              <Search className="h-5 w-5 text-slate-400 shrink-0" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name, bio, website…"
                className="flex-1 bg-transparent text-slate-900 placeholder:text-slate-400 text-base outline-none py-1.5 min-w-0"
                autoFocus
                data-testid="input-home-search"
              />
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 px-4 sm:px-5 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-full transition-colors active:scale-[0.98] shrink-0"
                data-testid="button-home-search"
              >
                <span className="hidden sm:inline">Search</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </form>

          <p className="text-xs text-slate-500 mt-5 flex items-center justify-center gap-2" data-testid="text-home-hint">
            <span>Not Personalized</span>
            <span className="text-slate-300">·</span>
            <button
              type="button"
              onClick={() => setLocation("/what-is-wot")}
              className="text-indigo-600 hover:text-indigo-700 hover:underline transition-colors"
              data-testid="link-home-learn-more"
            >
              What is this?
            </button>
          </p>
        </div>
      </main>

      <footer className="relative z-10 flex items-center justify-between px-4 sm:px-8 py-4 text-xs" data-testid="footer-home">
        <a
          href="https://github.com/NosFabrica/"
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-slate-500 hover:text-indigo-600 transition-colors"
          data-testid="link-home-developers"
        >
          Developers
        </a>
        <button
          type="button"
          onClick={() => setLocation("/how-search-works")}
          className="font-medium text-slate-500 hover:text-indigo-600 transition-colors"
          data-testid="link-home-how-search-works"
        >
          How search works
        </button>
      </footer>
    </div>
  );
}
