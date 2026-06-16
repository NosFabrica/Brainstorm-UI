import { useState } from "react";
import { ShieldCheck, UserCircle, X, Download, Check, ArrowRight } from "lucide-react";
import { getCurrentUser, hasPersistentKey, exportEncryptedKey } from "@/services/nostr";
import { ProfileEditModal } from "@/components/ProfileEditModal";

/**
 * Calm, dismissible "finish setting up" nudge shown on the home page only for
 * in-app–created accounts that haven't backed up yet. Offers an optional
 * encrypted backup download and a shortcut to complete the profile. Never
 * blocks; self-gates (renders nothing for extension/nsec/anonymous users).
 */
export function PostSignupCard() {
  const user = getCurrentUser();
  const pubkey = user?.pubkey ?? "";
  const backupFlag = pubkey ? `brainstorm_backup_done:${pubkey}` : "";

  const [dismissed, setDismissed] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [backupMode, setBackupMode] = useState(false);
  const [pass, setPass] = useState("");
  const [backedUp, setBackedUp] = useState(() => {
    try {
      return !!backupFlag && localStorage.getItem(backupFlag) === "true";
    } catch {
      return false;
    }
  });

  // Only for accounts created in-app (a persistent local key exists).
  if (!user || !hasPersistentKey() || dismissed) return null;

  const handleDownload = () => {
    if (pass.length < 8) return;
    try {
      const ncryptsec = exportEncryptedKey(pass);
      const blob = new Blob([ncryptsec], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "brainstorm-account-backup.txt";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      try {
        if (backupFlag) localStorage.setItem(backupFlag, "true");
      } catch {}
      setBackedUp(true);
      setBackupMode(false);
      setPass("");
    } catch {
      // no-op; user can retry
    }
  };

  return (
    <>
      <div
        className="relative w-full max-w-3xl mx-auto mt-6 sm:mt-8 rounded-2xl border border-[#7c86ff]/25 bg-gradient-to-br from-white via-white to-indigo-50/60 shadow-sm p-5 sm:p-6"
        data-testid="card-post-signup"
      >
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="absolute top-3 right-3 h-7 w-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          aria-label="Dismiss"
          data-testid="button-post-signup-dismiss"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex items-center gap-2.5 mb-3">
          <span className="text-[11px] font-mono font-semibold tracking-[0.2em] text-[#7c86ff] uppercase">
            Finish setting up
          </span>
        </div>
        <h3
          className="text-lg font-bold text-slate-900 tracking-tight"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Welcome to Brainstorm{user.displayName ? `, ${user.displayName}` : ""}!
        </h3>
        <p className="mt-1 text-[14px] text-slate-600 leading-relaxed max-w-xl">
          Your account is ready. Take a few seconds to back it up and add a photo so people
          recognize you.
        </p>

        <div className="mt-4 grid sm:grid-cols-2 gap-3">
          {/* Back up */}
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-center gap-2.5 mb-1.5">
              <div className="h-8 w-8 rounded-lg bg-[#7c86ff]/10 border border-[#7c86ff]/20 flex items-center justify-center text-[#333286]">
                <ShieldCheck className="h-4 w-4" />
              </div>
              <span className="text-sm font-semibold text-slate-900">Back up your account</span>
            </div>
            {backedUp ? (
              <p className="text-[13px] text-emerald-700 flex items-center gap-1.5 mt-1">
                <Check className="h-4 w-4" /> Backup downloaded
              </p>
            ) : backupMode ? (
              <div className="mt-2">
                <p className="text-[12px] text-slate-500 mb-2">
                  Choose a password to encrypt your backup file (keep it safe — no one can reset it).
                </p>
                <input
                  type="password"
                  value={pass}
                  onChange={(e) => setPass(e.target.value)}
                  placeholder="At least 8 characters"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#7c86ff] focus:outline-none focus:ring-2 focus:ring-[#7c86ff]/30"
                  data-testid="input-backup-password"
                />
                <button
                  type="button"
                  onClick={handleDownload}
                  disabled={pass.length < 8}
                  className="mt-2 w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#3730a3] hover:bg-[#312e81] text-white text-sm font-semibold py-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  data-testid="button-download-backup"
                >
                  <Download className="h-4 w-4" /> Download backup
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setBackupMode(true)}
                className="mt-1 text-sm font-semibold text-indigo-600 hover:text-indigo-700 inline-flex items-center gap-1"
                data-testid="button-start-backup"
              >
                Save a backup file <ArrowRight className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Complete profile */}
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-center gap-2.5 mb-1.5">
              <div className="h-8 w-8 rounded-lg bg-[#7c86ff]/10 border border-[#7c86ff]/20 flex items-center justify-center text-[#333286]">
                <UserCircle className="h-4 w-4" />
              </div>
              <span className="text-sm font-semibold text-slate-900">Complete your profile</span>
            </div>
            <button
              type="button"
              onClick={() => setEditOpen(true)}
              className="mt-1 text-sm font-semibold text-indigo-600 hover:text-indigo-700 inline-flex items-center gap-1"
              data-testid="button-complete-profile"
            >
              Add a photo & bio <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      <ProfileEditModal open={editOpen} onOpenChange={setEditOpen} />
    </>
  );
}
