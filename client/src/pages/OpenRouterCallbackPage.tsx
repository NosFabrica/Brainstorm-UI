/**
 * Where OpenRouter sends the user back after "Connect with OpenRouter"
 * (`/settings/openrouter?code=…&state=…`). Trades the code for a key, drops the code
 * from the address bar, and lands on Settings › Assistants › AI model with the key
 * handed over in memory (lib/openRouterOAuth). Nothing is saved here: the user reviews
 * the key there and presses Save.
 */
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Loader2 } from "lucide-react";
import { AI_MODEL_SETTINGS_PATH, handOff } from "@/lib/openRouterOAuth";
import { completeOpenRouterConnect } from "@/services/openRouterOAuth";

export default function OpenRouterCallbackPage() {
  const [, navigate] = useLocation();
  // Read once, at first render: the effect below strips it, and may run twice.
  const [search] = useState(() => window.location.search);

  useEffect(() => {
    // The code is single-use, but it still has no business in history or a shared URL.
    window.history.replaceState(window.history.state, "", window.location.pathname);
    let cancelled = false;
    void completeOpenRouterConnect(search).then((outcome) => {
      handOff(outcome);
      if (!cancelled) navigate(AI_MODEL_SETTINGS_PATH, { replace: true });
    });
    return () => {
      cancelled = true;
    };
  }, [navigate, search]);

  return (
    <div
      className="flex min-h-[40vh] items-center justify-center gap-2 text-sm text-slate-500"
      data-testid="openrouter-callback"
    >
      <Loader2 className="h-4 w-4 animate-spin" /> Getting your key from OpenRouter…
    </div>
  );
}
