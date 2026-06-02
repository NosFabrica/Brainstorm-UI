import React from "react";
import {
  Brain,
  KeyRound,
  ArrowRight,
  ChevronDown,
} from "lucide-react";

export function ImmersiveHero() {
  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden font-sans bg-[#0f172a]">
      {/* Full-bleed background image with indigo wash */}
      <div className="absolute inset-0 z-0">
        <img
          src="/__mockup/images/immersive-hero-bg.png"
          alt="People connecting"
          className="h-full w-full object-cover opacity-80"
        />
        {/* Gradients to ensure text readability and add brand color */}
        <div className="absolute inset-0 bg-indigo-900/30 mix-blend-multiply" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0f172a]/80 via-transparent to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#0f172a]/20 to-[#0f172a]/80" />
      </div>

      {/* Floating Card */}
      <div className="relative z-10 w-full max-w-[440px] px-4 md:ml-auto md:mr-[10%]">
        <div className="overflow-hidden rounded-3xl border border-white/20 bg-white/70 shadow-2xl backdrop-blur-xl supports-[backdrop-filter]:bg-white/60">
          <div className="p-8 sm:p-10">
            {/* Header */}
            <div className="mb-8 flex flex-col items-center text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-lg">
                <Brain size={32} strokeWidth={2} />
              </div>
              <h1 className="font-['Space_Grotesk'] text-3xl font-bold tracking-tight text-slate-900">
                Brainstorm
              </h1>
              <p className="mt-2 text-sm text-slate-600">
                Discover who you can trust on Nostr.
              </p>
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-4">
              {/* Primary Action */}
              <button
                type="button"
                className="group flex w-full items-center gap-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 transition-all hover:bg-slate-50 hover:ring-indigo-300 hover:shadow-md active:scale-[0.98]"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                  <svg
                    className="h-5 w-5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M8.90002 6.74084V1.6709H21.5V20.7008H8.90002L8.91003 15.7108" />
                    <path d="M2 11.1914H14.88" />
                    <path d="M12.65 7.83105L16 11.191L12.65 14.5411" />
                  </svg>
                </div>
                <div className="flex-1 text-left">
                  <p className="text-sm font-semibold text-slate-900">
                    Sign in with your extension
                  </p>
                  <p className="text-xs text-slate-500">
                    Alby, Nos2x & other signers
                  </p>
                </div>
                <ArrowRight className="h-5 w-5 text-slate-400 transition-transform group-hover:translate-x-1 group-hover:text-indigo-600" />
              </button>

              {/* Secondary Action */}
              <div className="flex justify-center">
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-indigo-700 transition-colors hover:text-indigo-800"
                >
                  <KeyRound className="h-4 w-4" />
                  Use your private key?
                </button>
              </div>
            </div>

            {/* Divider */}
            <div className="my-8 flex items-center gap-4">
              <div className="h-px flex-1 bg-slate-200/60" />
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                New to Brainstorm?
              </span>
              <div className="h-px flex-1 bg-slate-200/60" />
            </div>

            {/* Sign Up */}
            <div className="flex flex-col items-center">
              <button
                type="button"
                className="group flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-6 py-3.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-indigo-500 hover:shadow active:scale-[0.98]"
              >
                Create your account
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </button>
              <p className="mt-3 text-xs text-slate-500">
                Free, takes a minute — no email required
              </p>
            </div>
          </div>

          {/* Anonymous Browsing Note */}
          <div className="bg-slate-50/50 p-6 text-center text-sm">
            <p className="text-slate-600 leading-relaxed">
              Not your device? Keep your identity private — you can browse
              Brainstorm anonymously without signing in.
            </p>
            <button
              type="button"
              className="mt-2 font-semibold text-indigo-700 transition-colors hover:text-indigo-800"
            >
              Learn about anonymous browsing
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-4 px-2 text-xs font-medium text-slate-300 md:text-slate-400 mix-blend-plus-lighter">
          <button
            type="button"
            className="flex items-center gap-1.5 transition-colors hover:text-white"
          >
            English (United States) <ChevronDown className="h-3 w-3" />
          </button>
          <div className="flex gap-4">
            <button type="button" className="transition-colors hover:text-white">
              Help
            </button>
            <button type="button" className="transition-colors hover:text-white">
              Privacy
            </button>
            <button type="button" className="transition-colors hover:text-white">
              Terms
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
