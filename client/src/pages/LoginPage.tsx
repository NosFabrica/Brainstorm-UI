import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Loader2, AlertCircle, ArrowRight, Zap } from "lucide-react";
import { handleLogin } from "@/services/nostr";

const BRAIN_SVG_PATHS = [
  "M13.75 10C14.3023 10 14.75 9.55228 14.75 9C14.75 8.44772 14.3023 8 13.75 8C13.1977 8 12.75 8.44772 12.75 9C12.75 9.55228 13.1977 10 13.75 10Z",
  "M15.5 13C16.0523 13 16.5 12.5523 16.5 12C16.5 11.4477 16.0523 11 15.5 11C14.9477 11 14.5 11.4477 14.5 12C14.5 12.5523 14.9477 13 15.5 13Z",
  "M17.1504 9.75C17.5646 9.75 17.9004 9.41421 17.9004 9C17.9004 8.58579 17.5646 8.25 17.1504 8.25C16.7362 8.25 16.4004 8.58579 16.4004 9C16.4004 9.41421 16.7362 9.75 17.1504 9.75Z",
  "M17.1504 15.75C17.5646 15.75 17.9004 15.4142 17.9004 15C17.9004 14.5858 17.5646 14.25 17.1504 14.25C16.7362 14.25 16.4004 14.5858 16.4004 15C16.4004 15.4142 16.7362 15.75 17.1504 15.75Z",
  "M19.75 12.75C20.1642 12.75 20.5 12.4142 20.5 12C20.5 11.5858 20.1642 11.25 19.75 11.25C19.3358 11.25 19 11.5858 19 12C19 12.4142 19.3358 12.75 19.75 12.75Z",
  "M6.80078 9.75C7.21499 9.75 7.55078 9.41421 7.55078 9C7.55078 8.58579 7.21499 8.25 6.80078 8.25C6.38657 8.25 6.05078 8.58579 6.05078 9C6.05078 9.41421 6.38657 9.75 6.80078 9.75Z",
  "M6.80078 15.75C7.21499 15.75 7.55078 15.4142 7.55078 15C7.55078 14.5858 7.21499 14.25 6.80078 14.25C6.38657 14.25 6.05078 14.5858 6.05078 15C6.05078 15.4142 6.38657 15.75 6.80078 15.75Z",
  "M4.19922 12.75C4.61343 12.75 4.94922 12.4142 4.94922 12C4.94922 11.5858 4.61343 11.25 4.19922 11.25C3.78501 11.25 3.44922 11.5858 3.44922 12C3.44922 12.4142 3.78501 12.75 4.19922 12.75Z",
  "M15.9004 5.94922C16.3146 5.94922 16.6504 5.61343 16.6504 5.19922C16.6504 4.78501 16.3146 4.44922 15.9004 4.44922C15.4862 4.44922 15.1504 4.78501 15.1504 5.19922C15.1504 5.61343 15.4862 5.94922 15.9004 5.94922Z",
  "M8.09961 5.94922C8.51382 5.94922 8.84961 5.61343 8.84961 5.19922C8.84961 4.78501 8.51382 4.44922 8.09961 4.44922C7.6854 4.44922 7.34961 4.78501 7.34961 5.19922C7.34961 5.61343 7.6854 5.94922 8.09961 5.94922Z",
  "M12.0508 6.75C12.465 6.75 12.8008 6.41421 12.8008 6C12.8008 5.58579 12.465 5.25 12.0508 5.25C11.6366 5.25 11.3008 5.58579 11.3008 6C11.3008 6.41421 11.6366 6.75 12.0508 6.75Z",
  "M15.9004 19.75C16.3146 19.75 16.6504 19.4142 16.6504 19C16.6504 18.5858 16.3146 18.25 15.9004 18.25C15.4862 18.25 15.1504 18.5858 15.1504 19C15.1504 19.4142 15.4862 19.75 15.9004 19.75Z",
  "M12.0508 18.9492C12.465 18.9492 12.8008 18.6134 12.8008 18.1992C12.8008 17.785 12.465 17.4492 12.0508 17.4492C11.6366 17.4492 11.3008 17.785 11.3008 18.1992C11.3008 18.6134 11.6366 18.9492 12.0508 18.9492Z",
  "M8.5 13C9.05228 13 9.5 12.5523 9.5 12C9.5 11.4477 9.05228 11 8.5 11C7.94772 11 7.5 11.4477 7.5 12C7.5 12.5523 7.94772 13 8.5 13Z",
  "M10.25 16C10.8023 16 11.25 15.5523 11.25 15C11.25 14.4477 10.8023 14 10.25 14C9.69772 14 9.25 14.4477 9.25 15C9.25 15.5523 9.69772 16 10.25 16Z",
];

const OPEN_PATHS = [
  "M10.25 10C10.8 10 11.25 9.55 11.25 9C11.25 8.45 10.8 8 10.25 8",
  "M14.75 15C14.75 14.45 14.3 14 13.75 14C13.2 14 12.75 14.45 12.75 15",
  "M8.84961 19C8.84961 19.41 8.50961 19.75 8.09961 19.75C7.68961 19.75 7.34961 19.41 7.34961 19",
];

const DOT_POINTS = [
  { cx: 11.9492, cy: 2.5, sw: 2 },
  { cx: 17.4492, cy: 2.9, sw: 1.5 },
  { cx: 17.4492, cy: 21.25, sw: 1.5 },
  { cx: 19.9492, cy: 16.55, sw: 1.5 },
  { cx: 19.9492, cy: 7.05, sw: 1.5 },
  { cx: 3.94922, cy: 16.55, sw: 1.5 },
  { cx: 3.94922, cy: 7.05, sw: 1.5 },
  { cx: 6.44922, cy: 2.9, sw: 1.5 },
  { cx: 6.44922, cy: 21.25, sw: 1.5 },
  { cx: 11.9492, cy: 21.55, sw: 2 },
  { cx: 1.5, cy: 12.05, sw: 2 },
  { cx: 22.4492, cy: 12.05, sw: 2 },
];

function BrainIcon({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className="text-white drop-shadow-[0_0_10px_rgba(129,140,248,0.3)]">
      <g clipPath="url(#clip0_brain)">
        {BRAIN_SVG_PATHS.map((d, i) => (
          <path key={i} d={d} stroke="currentColor" strokeMiterlimit="10" />
        ))}
        {OPEN_PATHS.map((d, i) => (
          <path key={`o-${i}`} d={d} stroke="currentColor" strokeMiterlimit="10" strokeLinecap="round" strokeLinejoin="round" />
        ))}
        {DOT_POINTS.map((p, i) => (
          <path key={`d-${i}`} d={`M${p.cx} ${p.cy}V${p.cy}`} stroke="currentColor" strokeWidth={p.sw} strokeLinecap="round" strokeLinejoin="round" />
        ))}
      </g>
      <defs>
        <clipPath id="clip0_brain">
          <rect width="24" height="24" fill="white" />
        </clipPath>
      </defs>
    </svg>
  );
}

export default function LoginPage() {
  const [, navigate] = useLocation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onLogin = async () => {
    setError(null);
    setLoading(true);
    try {
      await handleLogin();
      navigate("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect to Nostr.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center relative overflow-hidden font-sans" data-testid="page-login">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-indigo-900/20 via-slate-950 to-slate-950" />
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff03_1px,transparent_1px),linear-gradient(to_bottom,#ffffff03_1px,transparent_1px)] bg-[size:32px_32px]" />

      <div className="absolute top-[10%] left-[15%] w-64 h-64 rounded-full bg-indigo-600/5 blur-3xl animate-pulse" />
      <div className="absolute bottom-[20%] right-[10%] w-48 h-48 rounded-full bg-violet-600/5 blur-3xl animate-pulse [animation-delay:3s]" />
      <div className="absolute top-[50%] right-[25%] w-32 h-32 rounded-full bg-blue-500/5 blur-2xl animate-pulse [animation-delay:5s]" />

      <div className="w-full max-w-[420px] mx-4 relative z-10 animate-fade-up">
        <div className="relative bg-slate-900/60 backdrop-blur-2xl border border-white/10 rounded-2xl p-8 shadow-[0_0_50px_-12px_rgba(79,70,229,0.3)] overflow-hidden">
          <div className="absolute -top-40 -left-40 w-80 h-80 bg-indigo-500/10 rounded-full blur-[60px] pointer-events-none" />
          <div className="absolute -bottom-40 -right-40 w-80 h-80 bg-violet-500/10 rounded-full blur-[60px] pointer-events-none" />
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-[300px] h-[1px] bg-gradient-to-r from-transparent via-indigo-400/50 to-transparent opacity-50" />

          <div className="flex flex-col items-center justify-center relative mb-8">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 bg-indigo-500/10 blur-[30px] rounded-full pointer-events-none -z-10" />

            <div className="flex items-center gap-3" data-testid="branding-logo">
              <div className="relative">
                <div className="absolute inset-0 bg-indigo-500/30 blur-xl rounded-full scale-110 opacity-0" />
                <BrainIcon size={36} />
              </div>

              <h1
                className="text-4xl font-bold bg-gradient-to-br from-white via-indigo-100 to-indigo-200/50 bg-clip-text text-transparent leading-none tracking-tight pb-1"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Brainstorm
              </h1>
            </div>

            <div className="flex flex-wrap items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900/40 border border-white/5 backdrop-blur-sm mt-3 shadow-sm">
              <Zap className="w-3 h-3 text-indigo-400" />
              <span className="text-[10px] text-slate-400 tracking-wider font-medium uppercase">Computational Trust</span>
              <div className="w-px h-3 bg-white/10" />
              <span className="text-[10px] text-slate-500 tracking-wider font-medium uppercase">Digital Clarity</span>
            </div>
          </div>

          <div className="space-y-4">
            {error && (
              <div className="flex items-start gap-2 rounded-md bg-red-500/10 border border-red-500/20 p-3" data-testid="text-login-error">
                <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                <p className="text-sm text-red-300">{error}</p>
              </div>
            )}

            <button
              onClick={onLogin}
              disabled={loading}
              className="group relative w-full h-[52px] rounded-md font-semibold text-sm tracking-wide uppercase text-white transition-all duration-300 flex items-center justify-center gap-2 overflow-hidden shadow-lg shadow-indigo-500/20 bg-indigo-600 hover:bg-white hover:text-indigo-900 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-indigo-600 disabled:hover:text-white"
              data-testid="button-sign-in"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Connecting...</span>
                </>
              ) : (
                <>
                  <span className="absolute inset-0 bg-gradient-to-r from-indigo-400/0 via-indigo-400/10 to-indigo-400/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
                  <span className="relative">Sign in with Nostr</span>
                  <ArrowRight className="h-4 w-4 relative group-hover:translate-x-0.5 transition-transform" />
                </>
              )}
            </button>

            <p className="text-xs text-slate-500 text-center leading-relaxed">
              Uses your browser extension (<span className="text-indigo-400">nos2x</span>, <span className="text-indigo-400">Alby</span>, etc.) to securely sign in via NIP-07.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
