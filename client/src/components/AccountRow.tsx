/**
 * How one Account reads, wherever it is offered: the face and names of the
 * identity it signs for, and the chips that say which Signer stands behind it and
 * whether anything is wrong.
 *
 * Shared by the login picker and the in-app switcher, which are otherwise very
 * different surfaces — a full-width column on a page, and a 360px pane inside the
 * account panel. What must not differ is what a row *means*, so the badge and the
 * health chip come from here rather than being written twice.
 */
import { AlertTriangle, Chrome, KeyRound, Radio, ShieldAlert, Smartphone } from "lucide-react";

import type { PickerIdentity, PickerRow, RowHealth, SignerKind } from "@/accounts/picker";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Chip } from "@/components/ui/chip";
import { cn } from "@/lib/utils";

const SIGNERS: Record<SignerKind, { label: string; icon: typeof Chrome; tone: "indigo" | "amber" | "sky" | "emerald" }> = {
  extension: { label: "Extension", icon: Chrome, tone: "indigo" },
  key: { label: "Key", icon: KeyRound, tone: "amber" },
  remote: { label: "Remote signer", icon: Radio, tone: "sky" },
  amber: { label: "Amber", icon: Smartphone, tone: "emerald" },
};

/** "checking" and "ok" say nothing: a row with no chip is a row with no news. */
const HEALTH: Partial<Record<RowHealth, { label: string; icon: typeof AlertTriangle; tone: "warning" | "danger" }>> = {
  "no-backup": { label: "No backup", icon: AlertTriangle, tone: "warning" },
  "key-unavailable": { label: "Key unavailable", icon: ShieldAlert, tone: "danger" },
  "extension-missing": { label: "Extension missing", icon: ShieldAlert, tone: "danger" },
  "signer-unusable": { label: "Unavailable here", icon: ShieldAlert, tone: "danger" },
};

export function AccountFace({ identity, className }: { identity: PickerIdentity; className?: string }) {
  const initial = (identity.name || identity.npub || "?").charAt(0).toUpperCase();
  return (
    <Avatar className={cn("h-10 w-10 shrink-0", className)}>
      {identity.picture ? (
        <AvatarImage src={identity.picture} alt={identity.name || identity.npub} className="object-cover" />
      ) : null}
      <AvatarFallback className="bg-brand-primary/15 text-brand-primary font-bold">
        {initial}
      </AvatarFallback>
    </Avatar>
  );
}

export function AccountNames({ identity }: { identity: PickerIdentity }) {
  return (
    <span className="min-w-0 flex-1 text-left">
      <span className="block truncate text-sm font-semibold text-foreground">
        {identity.name || "Account"}
      </span>
      <span className="block truncate text-xs text-muted-foreground">{identity.npub}</span>
    </span>
  );
}

export function AccountRowChips({ row }: { row: PickerRow }) {
  const signer = SIGNERS[row.signer];
  const health = HEALTH[row.health];
  return (
    <>
      <Chip tone={signer.tone} size="sm" icon={signer.icon}>
        {signer.label}
      </Chip>
      {health && (
        <Chip
          tone={health.tone}
          size="sm"
          icon={health.icon}
          data-testid={`chip-health-${row.account.id}`}
        >
          {health.label}
        </Chip>
      )}
    </>
  );
}
