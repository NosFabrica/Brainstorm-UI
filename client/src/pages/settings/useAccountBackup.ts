/**
 * Settings › Account's key handling: back up (asking for a Recovery password
 * only where the Account has no Backup yet) and show the recovery key. Each
 * waits for the Account to unlock, and says so on its button.
 */
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useBackupNeed } from "@/hooks/useBackupNeed";
import { deliverBackup } from "@/lib/accountBackup";
import {
  heldBackup,
  keyAccessMessage,
  MIN_RECOVERY_PASSWORD_LENGTH,
  revealSecretKey,
  setRecoveryPassword,
} from "@/accounts/backup";

export function useAccountBackup() {
  const { toast } = useToast();
  const [backupMode, setBackupMode] = useState(false);
  const [backupPass, setBackupPass] = useState("");
  const [backupConfirm, setBackupConfirm] = useState("");
  /** The same answer the nag chain reads, so Settings can't say "backed up" while it asks. */
  const backedUp = useBackupNeed() === null;

  const backupMismatch = backupConfirm.length > 0 && backupPass !== backupConfirm;
  /**
   * A password is asked for only where the Account has no Backup yet — a migrated
   * one, whose key opens from the Unlock cache and nowhere else. Then it *is* the
   * Account's Recovery password, set here, exactly as `BackupPrompt` does it.
   *
   * Where a Backup already exists there is nothing to ask: it was minted at signup
   * under a password the user chose, and that is what the file's own instructions
   * tell them to use. This used to mint a second one under whatever was typed
   * here, so those files opened with a password the instructions never mentioned —
   * and "wrong password" on a backup reads as a corrupt file, not a wrong key.
   */
  const needsRecoveryPassword = !heldBackup();
  const canBackup =
    !needsRecoveryPassword || (backupPass.length >= MIN_RECOVERY_PASSWORD_LENGTH && backupPass === backupConfirm);
  /** Reaching the key waits for the account to unlock — the button says so. */
  const [backupBusy, setBackupBusy] = useState(false);
  const handleBackupDownload = async () => {
    if (!canBackup || backupBusy) return;
    setBackupBusy(true);
    try {
      // The same hand-over every other backup surface performs — file, password
      // manager and the mark, in one place, so this one cannot drift from them
      // again.
      if (needsRecoveryPassword) await setRecoveryPassword(backupPass);
      if (!deliverBackup()) throw new Error("No backup to deliver");
      setBackupMode(false);
      setBackupPass("");
      setBackupConfirm("");
      toast({
        title: "Backup saved",
        description: "Saved to your password manager where supported — keep the file too.",
      });
    } catch (err) {
      const message = keyAccessMessage(err);
      if (message) toast({ variant: "destructive", title: "Couldn't create your backup", description: message });
    } finally {
      setBackupBusy(false);
    }
  };

  const [showSecret, setShowSecret] = useState(false);
  const [secretNsec, setSecretNsec] = useState("");
  const [revealBusy, setRevealBusy] = useState(false);
  const handleRevealSecret = async () => {
    if (revealBusy) return;
    setRevealBusy(true);
    try {
      setSecretNsec(await revealSecretKey());
      setShowSecret(true);
    } catch (err) {
      const message = keyAccessMessage(err);
      if (message) toast({ variant: "destructive", title: "Couldn't reach your key", description: message });
    } finally {
      setRevealBusy(false);
    }
  };

  return {
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
  };
}

export type AccountBackup = ReturnType<typeof useAccountBackup>;
