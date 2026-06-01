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
    <div className="min-h-screen bg-slate-950 flex flex-col relative overflow-hidden" data-testid="page-home">
      <ComputingBackground variant="dark" />

      <header className="relative z-20 flex items-center justify-between px-4 sm:px-8 py-4">
        <button
          type="button"
          onClick={() => setLocation("/what-is-wot")}
          className="text-sm font-medium text-slate-400 hover:text-indigo-300 transition-colors"
          data-testid="link-home-about"
        >
          About
        </button>
        <SignInButton
          variant="ghost"
          label="Sign in with nostr"
          data-testid="button-home-sign-in"
        />
      </header>

      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 -mt-10 sm:-mt-16">
        <div className="w-full max-w-2xl mx-auto text-center" style={{ animation: "homeFadeUp 0.5s ease-out" }}>
          <style>{`@keyframes homeFadeUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }`}</style>

          <div className="flex flex-col items-center mb-8">
            <div className="flex items-center gap-3 mb-3">
              <BrainLogo size={48} className="text-indigo-400" />
              <h1
                className="text-4xl sm:text-6xl font-bold tracking-tight"
                style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                data-testid="text-home-title"
              >
                <span className="bg-clip-text text-transparent bg-gradient-to-r from-white via-indigo-200 to-violet-300">
                  Brainstorm
                </span>
              </h1>
            </div>
            <p className="text-slate-400 text-sm sm:text-base" data-testid="text-home-subtitle">
              Search across millions of nostr profiles
            </p>
          </div>

          <form onSubmit={onSubmit} className="relative group" data-testid="form-home-search">
            <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500/0 via-violet-500/20 to-indigo-500/0 blur-xl rounded-full opacity-0 group-focus-within:opacity-100 transition-opacity duration-500 pointer-events-none" />
            <div className="relative flex items-center gap-2 bg-slate-900/80 backdrop-blur-xl border border-slate-700/60 rounded-full pl-5 pr-2 py-2 shadow-2xl shadow-indigo-500/10 focus-within:border-indigo-500/50 transition-colors">
              <Search className="h-5 w-5 text-slate-500 shrink-0" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name, bio, NIP-05, website…"
                className="flex-1 bg-transparent text-white placeholder:text-slate-500 text-base outline-none py-1.5 min-w-0"
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
            <span className="text-slate-700">·</span>
            <button
              type="button"
              onClick={() => setLocation("/what-is-wot")}
              className="text-indigo-400 hover:text-indigo-300 hover:underline transition-colors"
              data-testid="link-home-learn-more"
            >
              What is this?
            </button>
          </p>
        </div>
      </main>

      <footer className="relative z-10 flex items-center justify-between px-4 sm:px-8 py-4 text-xs" data-testid="footer-home">
        <button
          type="button"
          onClick={() => setLocation("/faq?tab=developers")}
          className="font-medium text-slate-500 hover:text-indigo-300 transition-colors"
          data-testid="link-home-developers"
        >
          Developers
        </button>
        <button
          type="button"
          onClick={() => setLocation("/what-is-wot")}
          className="font-medium text-slate-500 hover:text-indigo-300 transition-colors"
          data-testid="link-home-how-search-works"
        >
          How search works
        </button>
      </footer>
    </div>
  );
}
