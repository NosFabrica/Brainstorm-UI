import { use$, useAccountManager } from "applesauce-react/hooks";

import { backupNeedStream, type BackupNeed } from "@/accounts/backup";

/**
 * What the Active Account still needs backing up, live: `null` once there is
 * nothing left to ask. Every surface in the backup chain reads it from here, so
 * none of them can be asking for something another one has already collected.
 */
export function useBackupNeed(): BackupNeed | null {
  const manager = useAccountManager();
  return use$(() => backupNeedStream(manager), [manager]) ?? null;
}
