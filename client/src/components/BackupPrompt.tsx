import { useState } from "react";
import { Check, Copy, Download } from "lucide-react";

import {
  keyAccessMessage,
  MIN_RECOVERY_PASSWORD_LENGTH,
  setRecoveryPassword,
  type BackupNeed,
} from "@/accounts/backup";
import { deliverBackup, downloadBackupFile, type BackupCredential } from "@/lib/accountBackup";
import { afterPaint } from "@/lib/afterPaint";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { tone } from "@/lib/tones";

/**
 * One card, two messages: what the chain says depends only on what the Account is
 * missing next. Kept beside the form that collects it so the post-signup card and
 * the recurring reminder can't word the same ask two different ways.
 */
export const BACKUP_MESSAGE: Record<BackupNeed, { title: string; body: string }> = {
  "recovery-password": {
    title: "Make your account portable",
    body: "Your account only exists in this browser. Set a recovery password and take the backup file with you — that pair is what gets you back in anywhere else.",
  },
  download: {
    title: "Back up your account",
    body: "Your backup file is the only way back in if you lose this browser — there's no reset.",
  },
};

/**
 * The ask itself, wherever the chain makes it — the post-signup card and the
 * recurring reminder both render this, so they are one sequence rather than two
 * places offering the same button.
 *
 * A migrated Account has no ciphertext yet, so it is asked for a password, and
 * setting it **mints the Backup and hands the file over in the same submit**:
 * they leave holding both halves rather than being nagged twice. Everyone else
 * already holds a Backup and is asked only to take it.
 *
 * It points at the encrypted Backup and never the raw-key export: the raw nsec
 * stays available where someone deliberately goes looking for it, but it is not
 * what a nudge steers people toward.
 */
export function BackupPrompt({
  need,
  onDelivered,
}: {
  need: BackupNeed | null;
  onDelivered?: () => void;
}) {
  const { toast } = useToast();
  const [pass, setPass] = useState("");
  const [confirm, setConfirm] = useState("");
  /** The NIP-49 derivation freezes the tab, so the button says so and shows no spinner. */
  const [busy, setBusy] = useState(false);
  const [credential, setCredential] = useState<BackupCredential | null>(null);

  const mismatch = confirm.length > 0 && pass !== confirm;
  const canSet = pass.length >= MIN_RECOVERY_PASSWORD_LENGTH && pass === confirm;

  const deliver = () => {
    const delivered = deliverBackup();
    if (!delivered) throw new Error("No backup to deliver");
    setCredential(delivered);
    onDelivered?.();
  };

  const failed = (err: unknown, title: string) => {
    const message = keyAccessMessage(err);
    if (message) toast({ variant: "destructive", title, description: message });
  };

  const download = () => {
    try {
      deliver();
    } catch (err) {
      failed(err, "Couldn't reach your backup");
    }
  };

  const setPasswordAndDownload = async () => {
    if (!canSet || busy) return;
    setBusy(true);
    await afterPaint();
    try {
      await setRecoveryPassword(pass);
      deliver();
    } catch (err) {
      failed(err, "Couldn't set your recovery password");
    } finally {
      setBusy(false);
    }
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

  if (credential) {
    return (
      <div className="space-y-2" data-testid="backup-prompt-delivered">
        <div className={`flex items-center gap-2 text-sm font-semibold ${tone("success").text}`}>
          <Check className="h-4 w-4" /> Backup file downloaded
        </div>
        <p className="text-[13px] text-muted-foreground">
          Saved to your password manager too, where your browser supports it. Downloads are easy to
          lose on a phone — copy the key somewhere you'll find it.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => downloadBackupFile(credential)}
            data-testid="backup-prompt-download-again"
          >
            <Download className="h-4 w-4" /> Download again
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={copyKey} data-testid="backup-prompt-copy">
            <Copy className="h-4 w-4" /> Copy recovery key
          </Button>
        </div>
      </div>
    );
  }

  if (!need) return null;

  if (need === "download") {
    return (
      <Button type="button" size="sm" onClick={download} data-testid="backup-prompt-download">
        <Download className="h-4 w-4" /> Download backup
      </Button>
    );
  }

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); void setPasswordAndDownload(); }}
      className="space-y-2"
      data-testid="backup-prompt-set-form"
    >
      <label htmlFor="backup-prompt-password" className="sr-only">Recovery password</label>
      <Input
        id="backup-prompt-password"
        name="recovery-password"
        type="password"
        value={pass}
        onChange={(e) => setPass(e.target.value)}
        placeholder={`Recovery password — at least ${MIN_RECOVERY_PASSWORD_LENGTH} characters`}
        autoComplete="new-password"
        disabled={busy}
        data-testid="backup-prompt-password"
      />
      <label htmlFor="backup-prompt-confirm" className="sr-only">Confirm recovery password</label>
      <Input
        id="backup-prompt-confirm"
        name="recovery-password-confirm"
        type="password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        placeholder="Confirm password"
        autoComplete="new-password"
        disabled={busy}
        data-testid="backup-prompt-confirm"
      />
      {mismatch && (
        <p className={`text-xs font-medium ${tone("danger").text}`} data-testid="backup-prompt-mismatch">
          Passwords don't match.
        </p>
      )}
      {/* Two files under two passwords is the confusion this warns about: the old
          one still opens, and nothing here invalidates it. */}
      <p className="text-xs text-muted-foreground" data-testid="backup-prompt-note">
        There's no reset, so keep it somewhere safe. Any backup file you saved before still opens
        with the password you used then — this one doesn't replace it.
      </p>
      <Button type="submit" size="sm" disabled={!canSet || busy} data-testid="backup-prompt-set">
        {busy ? "Setting password…" : <><Download className="h-4 w-4" /> Set password &amp; download backup</>}
      </Button>
    </form>
  );
}
