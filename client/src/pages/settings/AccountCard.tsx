/**
 * Settings › Profile › Account: the public ID, passkeys, the backup and the
 * recovery key (useAccountBackup), the profile link and signing out everywhere.
 */
import { useLocation } from "wouter";
import { AlertTriangle, ArrowRight, Check, Copy, Download, Key, Loader2, ShieldCheck, User } from "lucide-react";
import { InfoHint } from "@/components/InfoHint";
import { PasskeySettings } from "@/components/PasskeySettings";
import { SignOutEverywhereRow } from "@/components/settings/SignOutEverywhereRow";
import { canBackUp } from "@/accounts/backup";
import type { AccountDisplay } from "@/accounts/display";
import { useToast } from "@/hooks/use-toast";
import { copyToClipboard } from "@/lib/clipboard";
import type { AccountBackup } from "./useAccountBackup";

const inputCls =
  "w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3.5 py-2.5 text-[15px] text-slate-900 dark:text-slate-100 placeholder:text-slate-500 dark:placeholder:text-slate-400 shadow-sm focus:border-brand-accent focus:outline-none focus:ring-2 focus:ring-brand-accent/30 transition disabled:opacity-60";

export function AccountCard({
  user,
  backup,
  highlightBackup,
  onSignedOut: handleLogout,
}: {
  user: AccountDisplay;
  backup: AccountBackup;
  /** A `?focus=backup` link is pulsing the backup button. */
  highlightBackup: boolean;
  onSignedOut: () => void;
}) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const {
    backedUp,
    backupMode,
    setBackupMode,
    backupPass,
    setBackupPass,
    backupConfirm,
    setBackupConfirm,
    backupMismatch,
    needsRecoveryPassword,
    canBackup,
    backupBusy,
    handleBackupDownload,
    showSecret,
    setShowSecret,
    secretNsec,
    setSecretNsec,
    revealBusy,
    handleRevealSecret,
  } = backup;
  return (
    <div
      className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"
      data-testid="card-settings-account"
    >
      {" "}
      <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-100 bg-white shadow-sm ring-1 ring-slate-100 dark:border-slate-800/60 dark:bg-slate-900 dark:ring-slate-800/60">
            <ShieldCheck className="h-4 w-4 text-brand-deep" />
          </div>
          <div className="min-w-0">
            <h2
              className="text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100"
              style={{ fontFamily: "var(--font-display)" }}
              data-testid="text-account-title"
            >
              Account
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400" data-testid="text-account-subtitle">
              Your identity and backup
            </p>
          </div>
        </div>
      </div>
      <div className="space-y-4 p-5">
        {canBackUp() && (!backedUp || !user?.picture) && (
          <div
            className="bg-brand-accent/8 flex items-start rounded-xl border border-brand-accent/20 px-3.5 py-3"
            data-testid="hint-finish-setup"
          >
            <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">
              <span className="font-semibold text-slate-900 dark:text-slate-100">Finish setting up.</span>{" "}
              {!backedUp && !user?.picture
                ? "Back up your account and add a profile photo below."
                : !backedUp
                  ? "Back up your account below so you can sign in on another device."
                  : "Add a profile photo so people recognize you."}
            </p>
          </div>
        )}
        <div className="flex items-center justify-between gap-3" data-testid="row-account-npub">
          <div className="min-w-0">
            <p className="mb-0.5 flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Your public ID
              <InfoHint label="About your public ID">
                Your public address on the network (your "npub") — safe to share with anyone.
              </InfoHint>
            </p>
            <p className="truncate font-mono text-xs text-slate-600 dark:text-slate-300">{user.npub}</p>
          </div>
          <button
            type="button"
            onClick={() => {
              void copyToClipboard(user.npub).then((ok) =>
                toast(
                  ok
                    ? { title: "Copied!", description: "npub copied to clipboard" }
                    : { title: "Couldn't copy", variant: "destructive" },
                ),
              );
            }}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            data-testid="button-account-copy-npub"
          >
            <Copy className="h-3.5 w-3.5" /> Copy
          </button>
        </div>

        <PasskeySettings />

        {canBackUp() && (
          <div
            id="account-backup-section"
            className="scroll-mt-20 border-t border-slate-100 pt-4 dark:border-slate-800/60"
            data-testid="row-account-backup"
          >
            {backedUp ? (
              <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-500/25 dark:bg-emerald-500/10">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-emerald-200 bg-white text-emerald-600 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-400">
                  <Check className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">Backed up</div>
                  <div className="text-xs text-emerald-700 dark:text-emerald-400">Encrypted backup file downloaded</div>
                </div>
              </div>
            ) : backupMode ? (
              <div>
                <label
                  htmlFor="account-backup-pass"
                  className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200"
                >
                  Back up your account
                </label>
                <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
                  {needsRecoveryPassword
                    ? "Choose a recovery password. It encrypts your backup file and unlocks your account — keep it safe, no one can reset it."
                    : "Your encrypted backup file, ready to download. It opens with the recovery password you already chose — this file plus that password is how you sign in on another device."}
                </p>
                {needsRecoveryPassword && (
                  <>
                    <input
                      id="account-backup-pass"
                      type="password"
                      value={backupPass}
                      onChange={(e) => setBackupPass(e.target.value)}
                      placeholder="Password — at least 8 characters"
                      autoComplete="new-password"
                      className={inputCls}
                      data-testid="input-account-backup-password"
                    />
                    <input
                      id="account-backup-confirm"
                      type="password"
                      value={backupConfirm}
                      onChange={(e) => setBackupConfirm(e.target.value)}
                      placeholder="Confirm password"
                      autoComplete="new-password"
                      className={inputCls + " mt-2"}
                      data-testid="input-account-backup-confirm"
                    />
                    {backupMismatch && (
                      <p className="mt-1.5 text-xs font-medium text-red-600" data-testid="text-account-backup-mismatch">
                        Passwords don't match.
                      </p>
                    )}
                  </>
                )}
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void handleBackupDownload()}
                    disabled={!canBackup || backupBusy}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-brand-primary px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
                    data-testid="button-account-download-backup"
                  >
                    {backupBusy ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" /> Preparing backup…
                      </>
                    ) : (
                      <>
                        <Download className="h-4 w-4" /> Download backup
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setBackupMode(false);
                      setBackupPass("");
                      setBackupConfirm("");
                    }}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setBackupMode(true)}
                className={`flex w-full items-center gap-3 rounded-xl border bg-white p-3 text-left transition-all hover:border-brand-accent/50 hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40 dark:bg-slate-900 ${highlightBackup ? "animate-attention-ring border-brand-accent/70" : "border-slate-200 dark:border-slate-800"}`}
                data-testid="button-account-backup"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-brand-accent/20 bg-brand-accent/10 text-brand-deep">
                  <ShieldCheck className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Back up your account</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">Download an encrypted backup file</div>
                </div>
                <ArrowRight className="ml-auto h-4 w-4 shrink-0 text-slate-300 dark:text-slate-600" />
              </button>
            )}
          </div>
        )}

        {canBackUp() && (
          <div className="border-t border-slate-100 pt-4 dark:border-slate-800/60" data-testid="row-account-secret">
            {showSecret ? (
              <div>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Your recovery key
                </p>
                <div className="mb-2 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-amber-800">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span className="text-xs font-medium">
                    Anyone with this key has full control of your account. Never share it or paste it into a site you
                    don't trust.
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <code
                    className="min-w-0 flex-1 truncate rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
                    data-testid="text-account-nsec"
                  >
                    {secretNsec}
                  </code>
                  <button
                    type="button"
                    onClick={() => {
                      void copyToClipboard(secretNsec).then((ok) =>
                        toast(
                          ok
                            ? { title: "Copied!", description: "Secret key copied to clipboard" }
                            : {
                                title: "Couldn't copy",
                                description: "Select the key and copy it by hand.",
                                variant: "destructive",
                              },
                        ),
                      );
                    }}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                    data-testid="button-account-copy-nsec"
                  >
                    <Copy className="h-3.5 w-3.5" /> Copy
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowSecret(false);
                      setSecretNsec("");
                    }}
                    className="inline-flex shrink-0 items-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                    data-testid="button-account-hide-nsec"
                  >
                    Hide
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => void handleRevealSecret()}
                  disabled={revealBusy}
                  className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 transition-colors hover:text-brand-deep disabled:cursor-not-allowed disabled:opacity-50 dark:text-slate-300"
                  data-testid="button-account-reveal-secret"
                >
                  {revealBusy ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Unlocking…
                    </>
                  ) : (
                    <>
                      <Key className="h-4 w-4" /> Show recovery key
                    </>
                  )}
                </button>
                <InfoHint label="About your recovery key">
                  This is the password-equivalent for your account (your "nsec"). Anyone with it has full control —
                  never share it.
                </InfoHint>
              </div>
            )}
          </div>
        )}

        <div className="border-t border-slate-100 pt-4 dark:border-slate-800/60">
          <button
            type="button"
            onClick={() => navigate(`/p/${user.npub}`)}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            data-testid="button-account-view-profile"
          >
            <User className="h-4 w-4" /> View profile
          </button>
        </div>

        <SignOutEverywhereRow onSignedOut={handleLogout} />
      </div>
    </div>
  );
}
