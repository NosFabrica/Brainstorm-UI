/**
 * X's "Translate post", quietly: appears under text that isn't in the
 * reader's language when the browser can translate it on-device; a tap swaps
 * in the translation with "Translated from Japanese · Show original". Rows
 * that are links stay untouched — the tap is for the translation only.
 * Renders nothing everywhere else, so browsers without the APIs never see it.
 */
import { useEffect, useState } from "react";
import { detectLanguage, languageName, readerLanguage, translateText, translationAvailable } from "@/lib/translate";

type Phase = "idle" | "working" | "shown" | "failed";

export function TranslateLine({ text, className = "" }: { text: string; className?: string }) {
  const reader = readerLanguage();
  const [from, setFrom] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [translated, setTranslated] = useState<string | null>(null);

  useEffect(() => {
    setFrom(null);
    setPhase("idle");
    setTranslated(null);
    if (!translationAvailable() || !text.trim()) return;
    let alive = true;
    void detectLanguage(text).then((lang) => {
      if (alive && lang && lang !== reader) setFrom(lang);
    });
    return () => {
      alive = false;
    };
  }, [text, reader]);

  if (!from || phase === "failed") return null;

  const stop = (e: React.SyntheticEvent) => {
    e.stopPropagation();
    e.preventDefault();
  };
  const run = async (e: React.MouseEvent) => {
    stop(e);
    if (translated) {
      setPhase("shown");
      return;
    }
    setPhase("working");
    try {
      const out = await translateText(text, { from, to: reader });
      setTranslated(out);
      setPhase("shown");
    } catch {
      setPhase("failed");
    }
  };

  if (phase === "shown" && translated) {
    return (
      <div className={`mt-1.5 ${className}`} onClick={stop}>
        <p className="text-[13px] leading-snug text-slate-800 dark:text-slate-100 break-words" data-testid="translated-text">
          {translated}
        </p>
        <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500" data-testid="translate-note">
          Translated from {languageName(from, reader)} ·{" "}
          <button
            type="button"
            onClick={(e) => {
              stop(e);
              setPhase("idle");
            }}
            className="font-medium text-brand-link hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40 rounded"
            data-testid="translate-original"
          >
            Show original
          </button>
        </p>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={run}
      disabled={phase === "working"}
      className={`mt-1 text-[11px] font-medium text-brand-link hover:underline disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40 rounded ${className}`}
      data-testid="translate-link"
    >
      {phase === "working" ? "Translating…" : "Translate"}
    </button>
  );
}
