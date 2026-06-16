import { useState, type FormEvent } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { BrainLogo } from "@/components/BrainLogo";
import { Loader2, Check, AlertCircle, ArrowRight } from "lucide-react";
import { createAccount, type NostrUser } from "@/services/nostr";

interface CreateAccountModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (user: NostrUser) => void;
}

type CreateState = "idle" | "creating" | "success" | "error";

/**
 * Express account creation — one screen: pick a display name → "Create account".
 * Generates a keypair client-side, logs in, and fires the background first-run
 * setup. Brand-matched to ActivateBrainstormModal. Crypto stays hidden: the user
 * is "creating an account," not "generating a key."
 */
export function CreateAccountModal({ open, onOpenChange, onCreated }: CreateAccountModalProps) {
  const [name, setName] = useState("");
  const [state, setState] = useState<CreateState>("idle");
  const [error, setError] = useState("");

  const busy = state === "creating";
  const trimmed = name.trim();
  const canSubmit = trimmed.length >= 1 && trimmed.length <= 50 && !busy;

  const handleClose = (nextOpen: boolean) => {
    if (busy) return; // never close mid-creation
    if (!nextOpen) {
      setState("idle");
      setError("");
      setName("");
    }
    onOpenChange(nextOpen);
  };

  const handleSubmit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!canSubmit) return;
    setState("creating");
    setError("");
    try {
      const user = await createAccount(trimmed);
      setState("success");
      setTimeout(() => onCreated(user), 700);
    } catch (err) {
      setState("error");
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className="sm:max-w-[460px] rounded-3xl border border-[#7c86ff]/20 bg-gradient-to-b from-white/92 via-white/88 to-indigo-50/60 backdrop-blur-xl shadow-[0_60px_140px_-70px_rgba(51,50,134,0.75)] overflow-hidden p-0"
        data-testid="modal-create-account"
      >
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-32 -right-32 h-[420px] w-[420px] rounded-full bg-[#7c86ff]/20 blur-[90px]" />
          <div className="absolute -bottom-40 -left-40 h-[520px] w-[520px] rounded-full bg-[#333286]/15 blur-[110px]" />
        </div>

        <div className="relative">
          <div className="h-1.5 w-full bg-gradient-to-r from-[#7c86ff] via-[#333286] to-[#7c86ff] animate-gradient-x" />

          <div className="px-5 sm:px-6 pt-5 sm:pt-6 pb-5 sm:pb-6">
            <DialogHeader>
              <div className="flex items-center gap-2.5 mb-4">
                <span className="text-[11px] font-mono font-semibold tracking-[0.25em] text-[#7c86ff] uppercase">
                  Create your account
                </span>
                <div className="h-px w-10 bg-[#7c86ff]/40" />
              </div>
              <div className="flex items-start gap-3">
                <div className="h-11 w-11 rounded-2xl bg-white/70 border border-[#7c86ff]/20 shadow-sm flex items-center justify-center text-[#333286] shrink-0">
                  <BrainLogo size={22} />
                </div>
                <div className="min-w-0">
                  <DialogTitle
                    className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight leading-tight"
                    style={{ fontFamily: "var(--font-display)" }}
                    data-testid="text-create-title"
                  >
                    Let's set up your <span className="text-[#333286]">account</span>
                  </DialogTitle>
                  <DialogDescription className="text-sm text-slate-500 mt-1.5 leading-relaxed">
                    Pick a name to get started. No email, no password.
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            {state === "success" ? (
              <div
                className="mt-6 flex items-center justify-center gap-3 h-12 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700"
                data-testid="status-create-success"
              >
                <div className="h-6 w-6 rounded-full bg-emerald-500 flex items-center justify-center">
                  <Check className="h-3.5 w-3.5 text-white" />
                </div>
                <span className="text-sm font-bold">Account created! Taking you in…</span>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="mt-6">
                <label
                  htmlFor="create-display-name"
                  className="block text-sm font-medium text-slate-700 mb-1.5"
                >
                  Display name
                </label>
                <input
                  id="create-display-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={50}
                  autoFocus
                  disabled={busy}
                  placeholder="e.g. Alex Rivera"
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-[15px] text-slate-900 placeholder:text-slate-400 shadow-sm focus:border-[#7c86ff] focus:outline-none focus:ring-2 focus:ring-[#7c86ff]/30 transition disabled:opacity-60"
                  data-testid="input-create-display-name"
                />
                <p className="mt-1.5 text-xs text-slate-400">You can change this anytime.</p>

                {state === "error" && (
                  <div
                    className="mt-4 flex items-start gap-2 px-3 py-2.5 rounded-xl bg-red-50 border border-red-200 text-red-700"
                    data-testid="status-create-error"
                  >
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span className="text-xs font-medium">{error}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={!canSubmit}
                  className="mt-5 w-full h-12 rounded-xl bg-[#3730a3] hover:bg-[#312e81] text-white font-semibold text-sm tracking-wide shadow-lg shadow-[#3730a3]/20 transition-all duration-200 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  data-testid="button-create-submit"
                >
                  {busy ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" /> Setting up your account…
                    </>
                  ) : (
                    <>
                      Create account <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>

                <p className="mt-3 text-center text-xs text-slate-400">
                  Free · no email · about 30 seconds
                </p>
              </form>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
