import { useState } from "react";
import { ArrowRight, Check, Copy, Download } from "lucide-react";

import {
  heldBackup,
  keyAccessMessage,
  keyReachableWithoutPassword,
  MIN_RECOVERY_PASSWORD_LENGTH,
  setRecoveryPassword,
  verifyRecoveryPassword,
} from "@/accounts/backup";
import type { UnlockFailure } from "@/accounts/restore";
import { deliverBackup, downloadBackupFile, type BackupCredential } from "@/lib/accountBackup";
import { afterPaint } from "@/lib/afterPaint";
import { useToast } from "@/hooks/use-toast";

const FAILURE_COPY: Record<UnlockFailure, string> = {
  "wrong-password": "That's not the recovery password for this account.",
  "unusable-backup":
    "This browser couldn't check your password — it needs more memory than it allows. Your backup is below; it opens with the password you set.",
};

const fieldClass =
  "w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3.5 py-2.5 text-[15px] text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-brand-accent focus:outline-none focus:ring-2 focus:ring-brand-accent/30";
const primaryButtonClass =
  "w-full inline-flex items-center justify-center gap-1.5 rounded-xl bg-brand-primary hover:bg-brand-primary-hover text-white text-sm font-semibold py-3 shadow-lg shadow-brand-primary/25 disabled:opacity-50 disabled:cursor-not-allowed transition-all";
const secondaryButtonClass =
  "inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors";

/**
 * Onboarding's last step: prove the Recovery password chosen at signup, then take
 * the Backup away.
 *
 * The verification is the password's only rehearsal on this device — the Unlock
 * cache means it is otherwise typed once and never again — so it is what catches
 * a signup typo. And because the key is still unlocked here, a password nobody
 * can produce can still be *replaced*: the one moment in an account's life where
 * forgetting it isn't terminal. Skipping is allowed, and hands off to the
 * post-signup card and then the recurring reminder.
 */
export function OnboardingBackupStep({
  onSkip,
  onFinish,
}: {
  onSkip: () => void;
  onFinish: () => void;
}) {
  const { toast } = useToast();
  // "verify" where there is a Backup to check a password against; "set" where
  // there is none (a migrated or pasted key), or where they couldn't produce it.
  const [pane, setPane] = useState<"verify" | "set" | "delivered">(() =>
    heldBackup() ? "verify" : "set",
  );
  const [pass, setPass] = useState("");
  const [newPass, setNewPass] = useState("");
  const [confirm, setConfirm] = useState("");
  const [failure, setFailure] = useState<UnlockFailure | null>(null);
  /** Locked, with only the old password left — so it can't be replaced after all. */
  const [replaceBlocked, setReplaceBlocked] = useState(false);
  const [credential, setCredential] = useState<BackupCredential | null>(null);
  /** Every NIP-49 derivation freezes the tab for up to a second — the button says so. */
  const [busy, setBusy] = useState(false);

  const mismatch = confirm.length > 0 && newPass !== confirm;
  const canSetPassword = newPass.length >= MIN_RECOVERY_PASSWORD_LENGTH && newPass === confirm;
  /** Replacing a password leaves anything already saved opening on the old one. */
  const replacingPassword = pane === "set" && !!heldBackup();

  /**
   * Hand the Backup over — the file, the password manager and the mark, as every
   * surface in the chain does it — then offer the key itself on the next pane.
   * All of it from the ncryptsec the account already holds: the password has just
   * been checked against it, so minting a copy would cost a second derivation for
   * the same bytes.
   */
  const deliver = () => {
    const held = deliverBackup();
    if (!held) throw new Error("No backup to deliver");
    setCredential(held);
    setPane("delivered");
  };

  const failed = (err: unknown, title: string) => {
    const message = keyAccessMessage(err);
    if (message) toast({ variant: "destructive", title, description: message });
  };

  const verifyAndDownload = async () => {
    if (!pass || busy) return;
    setFailure(null);
    setBusy(true);
    await afterPaint();
    try {
      const result = await verifyRecoveryPassword(pass);
      if (!result.ok) {
        setFailure(result.reason);
        // A check this browser can't run is no reason to withhold the file: it
        // is the ciphertext they already have a password for, and it opens
        // wherever scrypt fits.
        if (result.reason === "unusable-backup") deliver();
        return;
      }
      deliver();
    } catch (err) {
      failed(err, "Couldn't reach your backup");
    } finally {
      setBusy(false);
    }
  };

  const setPasswordAndDownload = async () => {
    if (!canSetPassword || busy) return;
    setBusy(true);
    await afterPaint();
    try {
      await setRecoveryPassword(newPass);
      deliver();
    } catch (err) {
      failed(err, "Couldn't set your recovery password");
    } finally {
      setBusy(false);
    }
  };

  // Only offer to replace the password where the key can actually be reached
  // without it. Anywhere else, "set a new one" would mean asking for the old one.
  const openReplacePane = async () => {
    setFailure(null);
    if (await keyReachableWithoutPassword()) setPane("set");
    else setReplaceBlocked(true);
  };

  const copyKey = async () => {
    if (!credential) return;
    try {
      await navigator.clipboard.writeText(credential.ncryptsec);
      toast({ title: "Recovery key copied", description: "Paste it somewhere safe — you'll need your password to open it." });
    } catch {
      toast({ variant: "destructive", title: "Couldn't copy", description: "Download the file instead." });
    }
  };

  return (
    <div data-testid="onboarding-step-backup">
      <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 dark:text-slate-100 tracking-tight leading-[1.08]" style={{ fontFamily: "var(--font-display)" }}>
        {pane === "delivered" ? "Keep that safe." : "Back up your account."}
      </h1>
      <p className="mt-4 text-lg text-slate-600 dark:text-slate-300 leading-relaxed">
        {pane === "delivered"
          ? "That file plus your password is the only way back into your account on another device. No one can reset it for you."
          : "Your key is stored in this browser only. Take an encrypted copy with you so you can sign in somewhere else."}
      </p>

      {pane === "verify" && (
        <form
          onSubmit={(e) => { e.preventDefault(); void verifyAndDownload(); }}
          className="mt-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3"
        >
          <label htmlFor="ob-backup-password" className="block text-sm font-medium text-slate-700 dark:text-slate-200">
            Enter the recovery password you chose
          </label>
          <input
            id="ob-backup-password"
            name="recovery-password"
            type="password"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            placeholder="Recovery password"
            autoComplete="current-password"
            autoFocus
            disabled={busy}
            className={fieldClass}
            data-testid="onboarding-backup-password"
          />
          {failure && (
            <p className="text-xs font-medium text-red-600 dark:text-red-400" data-testid="onboarding-backup-error">
              {FAILURE_COPY[failure]}
            </p>
          )}
          <button type="submit" disabled={!pass || busy} className={primaryButtonClass} data-testid="onboarding-backup-download">
            {/* No spinner: the thread is blocked, so an animation would visibly stall. */}
            {busy ? "Checking password…" : <><Download className="h-4 w-4" /> Download backup</>}
          </button>
          {replaceBlocked ? (
            <p className="text-xs text-slate-500 dark:text-slate-400" data-testid="onboarding-backup-replace-blocked">
              Only that password opens your key on this device, so it can't be replaced here. You can
              still finish setting up and sign in later with your key or an older backup file.
            </p>
          ) : (
            <button
              type="button"
              onClick={() => void openReplacePane()}
              disabled={busy}
              className="w-full text-center text-xs font-medium text-brand-link hover:underline disabled:opacity-50"
              data-testid="onboarding-backup-forgotten"
            >
              I don't remember it — set a new one
            </button>
          )}
        </form>
      )}

      {pane === "set" && (
        <form
          onSubmit={(e) => { e.preventDefault(); void setPasswordAndDownload(); }}
          className="mt-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3"
        >
          <p className="text-sm text-slate-600 dark:text-slate-300" data-testid="onboarding-backup-set-note">
            {replacingPassword
              ? "Your key is still unlocked here, so you can set a new password now — this is the only time that's possible. Any older backup file, and whatever your password manager saved, still belongs to the old password."
              : "Choose a recovery password. It encrypts your backup, and there's no reset."}
          </p>
          <input
            id="ob-backup-new-password"
            name="recovery-password"
            type="password"
            value={newPass}
            onChange={(e) => setNewPass(e.target.value)}
            placeholder={`New password — at least ${MIN_RECOVERY_PASSWORD_LENGTH} characters`}
            autoComplete="new-password"
            disabled={busy}
            className={fieldClass}
            data-testid="onboarding-backup-new-password"
          />
          <input
            id="ob-backup-new-confirm"
            name="recovery-password-confirm"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Confirm password"
            autoComplete="new-password"
            disabled={busy}
            className={fieldClass}
            data-testid="onboarding-backup-new-confirm"
          />
          {mismatch && <p className="text-xs font-medium text-red-600 dark:text-red-400">Passwords don't match.</p>}
          <button type="submit" disabled={!canSetPassword || busy} className={primaryButtonClass} data-testid="onboarding-backup-set">
            {busy ? "Setting password…" : <><Download className="h-4 w-4" /> Set password &amp; download backup</>}
          </button>
        </form>
      )}

      {pane === "delivered" && (
        <div className="mt-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3" data-testid="onboarding-backup-delivered">
          <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700 dark:text-emerald-400">
            <Check className="h-4 w-4" /> Backup file downloaded
          </div>
          {failure === "unusable-backup" && (
            <p className="text-xs font-medium text-amber-700 dark:text-amber-400" data-testid="onboarding-backup-error">
              {FAILURE_COPY[failure]}
            </p>
          )}
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Saved to your password manager too, where your browser supports it. Downloads are easy to
            lose on a phone — copy the key somewhere you'll find it.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => credential && downloadBackupFile(credential)}
              className={secondaryButtonClass}
              data-testid="onboarding-backup-download-again"
            >
              <Download className="h-4 w-4" /> Download again
            </button>
            <button type="button" onClick={copyKey} className={secondaryButtonClass} data-testid="onboarding-backup-copy">
              <Copy className="h-4 w-4" /> Copy recovery key
            </button>
          </div>
          <button type="button" onClick={onFinish} className={primaryButtonClass} data-testid="onboarding-backup-finish">
            Finish <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="mt-6 flex items-center justify-between gap-3">
        {pane === "delivered" ? (
          <span />
        ) : (
          <button type="button" onClick={onSkip} className="text-sm font-semibold text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300" data-testid="onboarding-backup-skip">
            Skip for now
          </button>
        )}
        <span className="inline-flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400"><Check className="h-3.5 w-3.5" /> Scores are calculating</span>
      </div>
    </div>
  );
}
