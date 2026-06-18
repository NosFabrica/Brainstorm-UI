import { useState } from "react";
import { useLocation } from "wouter";
import { X, Download, Check, ArrowRight } from "lucide-react";
import { getCurrentUser, hasPersistentKey } from "@/services/nostr";
import { downloadAccountBackup } from "@/lib/accountBackup";
import { useToast } from "@/hooks/use-toast";
import bgPhoto from "@assets/generated_images/signup_bg_abstract.webp";

/** Profile icon (from supplied profile.svg), recolored via currentColor. */
function ProfileIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden="true">
      <path d="M12 14.18C9.81004 14.18 8.04004 12.4 8.04004 10.22C8.04004 8.03002 9.82004 6.26001 12 6.26001C14.18 6.26001 15.96 8.04002 15.96 10.22C15.96 12.4 14.19 14.18 12 14.18ZM12 7.75002C10.64 7.75002 9.54004 8.86002 9.54004 10.21C9.54004 11.57 10.65 12.67 12 12.67C13.35 12.67 14.46 11.56 14.46 10.21C14.46 8.86002 13.36 7.75002 12 7.75002Z" />
      <path d="M18.4202 22.23C18.0402 22.23 17.7102 21.94 17.6702 21.55C17.4202 18.86 14.9302 16.75 12.0002 16.75C9.06018 16.75 6.63017 18.78 6.34017 21.47C6.30017 21.88 5.92018 22.19 5.51018 22.13C5.10018 22.09 4.80017 21.71 4.85017 21.3C5.23017 17.85 8.30018 15.25 12.0002 15.25C15.7602 15.25 18.8402 17.9 19.1702 21.41C19.2102 21.82 18.9102 22.19 18.4902 22.23C18.4602 22.23 18.4402 22.23 18.4202 22.23Z" />
      <path d="M17 22.75H7C3.83 22.75 1.25 20.17 1.25 17V7C1.25 3.83 3.83 1.25 7 1.25H17C20.17 1.25 22.75 3.83 22.75 7V17C22.75 20.17 20.17 22.75 17 22.75ZM7 2.75C4.66 2.75 2.75 4.66 2.75 7V17C2.75 19.34 4.66 21.25 7 21.25H17C19.34 21.25 21.25 19.34 21.25 17V7C21.25 4.66 19.34 2.75 17 2.75H7Z" />
    </svg>
  );
}

/** Lock-in-circle icon (from supplied temp-lock.svg), recolored via currentColor. */
function BackupLockIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden="true">
      <path d="M21.3604 7.96977H18.1504C17.7404 7.96977 17.4004 7.62977 17.4004 7.21977C17.4004 6.80977 17.7404 6.46977 18.1504 6.46977H20.6104V4.00977C20.6104 3.59977 20.9504 3.25977 21.3604 3.25977C21.7704 3.25977 22.1104 3.59977 22.1104 4.00977V7.21977C22.1104 7.62977 21.7704 7.96977 21.3604 7.96977Z" />
      <path d="M12 22.75C6.07 22.75 1.25 17.93 1.25 12C1.25 6.07 6.07 1.25 12 1.25C15.94 1.25 19.55 3.4 21.44 6.86C21.64 7.22 21.5 7.68 21.14 7.88C20.78 8.08 20.32 7.94 20.12 7.58C18.5 4.6 15.38 2.75 12 2.75C6.9 2.75 2.75 6.9 2.75 12C2.75 17.1 6.9 21.25 12 21.25C17.1 21.25 21.25 17.1 21.25 12C21.25 11.59 21.59 11.25 22 11.25C22.41 11.25 22.75 11.59 22.75 12C22.75 17.93 17.93 22.75 12 22.75Z" />
      <path d="M13.2999 17.1897H10.6899C10.1399 17.1897 9.62988 16.9397 9.29988 16.4997C8.96988 16.0597 8.86988 15.5097 9.01988 14.9797L9.68988 12.6197C9.00988 11.9897 8.62988 11.0997 8.62988 10.1697C8.62988 9.11973 9.10988 8.14973 9.93988 7.50973C10.7699 6.86973 11.8399 6.64973 12.8899 6.91973C14.0199 7.21973 14.9499 8.13973 15.2499 9.26973C15.5699 10.4997 15.2099 11.7697 14.3099 12.6197L14.9799 14.9797C15.1299 15.5097 15.0299 16.0597 14.6999 16.4997C14.3699 16.9397 13.8599 17.1897 13.3099 17.1897H13.2999ZM11.9899 8.29973C11.5799 8.29973 11.1899 8.42973 10.8599 8.68973C10.3999 9.04973 10.1299 9.57973 10.1299 10.1697C10.1299 10.7097 10.3599 11.2197 10.7699 11.5797C11.1499 11.9097 11.3099 12.4097 11.1799 12.8797L10.4599 15.3997C10.4299 15.4997 10.4699 15.5697 10.4999 15.6097C10.5299 15.6497 10.5899 15.6997 10.6899 15.6997H13.2999C13.3999 15.6997 13.4599 15.6397 13.4899 15.6097C13.5199 15.5697 13.5599 15.4997 13.5299 15.3997L12.8099 12.8797C12.6799 12.4097 12.8299 11.9097 13.2199 11.5797C13.7699 11.0997 13.9899 10.3797 13.7899 9.65973C13.6299 9.04973 13.1099 8.53973 12.5099 8.37973C12.3399 8.33973 12.1599 8.30973 11.9899 8.30973V8.29973Z" />
    </svg>
  );
}

/**
 * Calm, dismissible "finish setting up" nudge shown on the home page only for
 * in-app–created accounts that haven't backed up yet. Matches the light
 * editorial aesthetic of /about, /how-search-works, /what-is-wot: a soft abstract
 * backdrop fades into the card behind a white wash (text stays fully readable),
 * and both action tiles are entirely clickable. Self-gates (renders nothing for
 * extension/nsec/anonymous users).
 */
export function PostSignupCard() {
  const [, navigate] = useLocation();
  const user = getCurrentUser();
  const pubkey = user?.pubkey ?? "";
  const backupFlag = pubkey ? `brainstorm_backup_done:${pubkey}` : "";
  const dismissFlag = pubkey ? `brainstorm_postsignup_dismissed:${pubkey}` : "";

  const [dismissed, setDismissed] = useState(() => {
    try {
      return !!dismissFlag && localStorage.getItem(dismissFlag) === "true";
    } catch {
      return false;
    }
  });
  const [backupMode, setBackupMode] = useState(false);
  const [pass, setPass] = useState("");
  const [confirm, setConfirm] = useState("");
  const { toast } = useToast();
  const [backedUp, setBackedUp] = useState(() => {
    try {
      return !!backupFlag && localStorage.getItem(backupFlag) === "true";
    } catch {
      return false;
    }
  });

  // The two setup steps: back up your key + add a profile photo. Once both are
  // done the nudge has served its purpose, so it auto-hides (Google-style).
  const hasPhoto = !!user?.picture;
  const setupComplete = backedUp && hasPhoto;

  // Only for accounts created in-app (a persistent local key exists). Hide once
  // the user has finished setup, or has explicitly dismissed it (persisted).
  if (!user || !hasPersistentKey() || dismissed || setupComplete) return null;

  const handleDismiss = () => {
    try {
      if (dismissFlag) localStorage.setItem(dismissFlag, "true");
    } catch {}
    setDismissed(true);
  };

  const mismatch = confirm.length > 0 && pass !== confirm;
  const canBackup = pass.length >= 8 && pass === confirm;
  const handleDownload = () => {
    if (!canBackup) return;
    try {
      downloadAccountBackup(pass);
      try {
        if (backupFlag) localStorage.setItem(backupFlag, "true");
      } catch {}
      setBackedUp(true);
      setBackupMode(false);
      setPass("");
      setConfirm("");
      toast({ title: "Backup saved", description: "Keep the file somewhere safe — it's how you sign in elsewhere." });
    } catch {
      // no-op; user can retry
    }
  };

  const tileBase =
    "group relative w-full text-left rounded-2xl bg-white/80 border border-slate-200 p-4 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7c86ff]/40";
  const tileClickable = tileBase + " hover:border-[#7c86ff]/50 hover:shadow-md active:scale-[0.995]";

  return (
    <>
      <div
        className="relative w-full max-w-3xl mx-auto mt-6 sm:mt-8 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
        data-testid="card-post-signup"
      >
        {/* Faded person photo + white wash so dark text stays readable */}
        <img
          src={bgPhoto}
          alt=""
          aria-hidden="true"
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover object-center"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-white/90 via-white/70 to-white/45" />
        <div className="absolute inset-0 bg-gradient-to-t from-white/60 via-transparent to-transparent" />

        <div className="relative z-10 p-5 sm:p-6">
          <button
            type="button"
            onClick={handleDismiss}
            className="absolute top-0 right-0 h-7 w-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            aria-label="Dismiss"
            data-testid="button-post-signup-dismiss"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="flex items-center gap-2.5 mb-3">
            <span className="text-[11px] font-mono font-semibold tracking-[0.25em] text-[#7c86ff] uppercase">
              Finish setting up
            </span>
            <div className="h-px w-10 bg-[#7c86ff]/40" />
            <span
              className="text-[11px] font-semibold text-slate-500 tabular-nums"
              data-testid="text-post-signup-progress"
            >
              {(backedUp ? 1 : 0) + (hasPhoto ? 1 : 0)} of 2 done
            </span>
          </div>
          <h3
            className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Welcome to <span className="text-[#333286]">Brainstorm</span>
            {user.displayName ? `, ${user.displayName}` : ""}!
          </h3>
          <p className="mt-1.5 text-[15px] text-slate-600 leading-relaxed max-w-xl">
            Your account is ready. Back it up — that file is how you sign in on another device or
            get back in if you clear your browser — and add a photo so people recognize you.
          </p>

          <div className="mt-5 grid sm:grid-cols-2 gap-3">
            {/* Back up your account */}
            {backedUp ? (
              <div className={tileBase} data-testid="tile-backup-done">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 shrink-0">
                    <Check className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="text-[15px] font-semibold text-slate-900">Backed up</div>
                    <div className="text-[13px] text-emerald-700">Backup file downloaded</div>
                  </div>
                </div>
              </div>
            ) : backupMode ? (
              <div className={tileBase} data-testid="tile-backup-form">
                <div className="flex items-center gap-2.5 mb-2.5">
                  <div className="h-10 w-10 rounded-xl bg-[#7c86ff]/10 border border-[#7c86ff]/20 flex items-center justify-center text-[#333286] shrink-0">
                    <BackupLockIcon className="h-5 w-5" />
                  </div>
                  <span className="text-[15px] font-semibold text-slate-900">Back up your account</span>
                </div>
                <p className="text-[12px] text-slate-500 mb-2">
                  Choose a password to encrypt your backup file — keep it safe, no one can reset it.
                </p>
                <input
                  type="password"
                  value={pass}
                  onChange={(e) => setPass(e.target.value)}
                  placeholder="Password — at least 8 characters"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#7c86ff] focus:outline-none focus:ring-2 focus:ring-[#7c86ff]/30"
                  data-testid="input-backup-password"
                />
                <input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Confirm password"
                  className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#7c86ff] focus:outline-none focus:ring-2 focus:ring-[#7c86ff]/30"
                  data-testid="input-backup-confirm"
                />
                {mismatch && (
                  <p className="mt-1.5 text-[12px] font-medium text-red-600" data-testid="text-backup-mismatch">Passwords don't match.</p>
                )}
                <button
                  type="button"
                  onClick={handleDownload}
                  disabled={!canBackup}
                  className="mt-2 w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#3730a3] hover:bg-[#312e81] text-white text-sm font-semibold py-2.5 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  data-testid="button-download-backup"
                >
                  <Download className="h-4 w-4" /> Download backup
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setBackupMode(true)}
                className={tileClickable}
                data-testid="tile-backup"
              >
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-[#7c86ff]/10 border border-[#7c86ff]/20 flex items-center justify-center text-[#333286] shrink-0">
                    <BackupLockIcon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[15px] font-semibold text-slate-900">Back up your account</div>
                    <div className="text-[13px] font-semibold text-indigo-600 inline-flex items-center gap-1">
                      Save a backup file
                      <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
                    </div>
                  </div>
                </div>
              </button>
            )}

            {/* Complete your profile */}
            <button
              type="button"
              onClick={() => navigate("/settings?tab=profile")}
              className={tileClickable}
              data-testid="tile-complete-profile"
            >
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-[#7c86ff]/10 border border-[#7c86ff]/20 flex items-center justify-center text-[#333286] shrink-0">
                  <ProfileIcon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <div className="text-[15px] font-semibold text-slate-900">Complete your profile</div>
                  <div className="text-[13px] font-semibold text-indigo-600 inline-flex items-center gap-1">
                    Add a photo &amp; bio
                    <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
                  </div>
                </div>
              </div>
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
