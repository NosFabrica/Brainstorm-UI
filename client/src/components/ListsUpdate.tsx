import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useActiveAccountDisplay } from "@/hooks/useActiveAccountDisplay";
import { useSelfHistory } from "@/hooks/useSelf";
import { useTrustListsStatus } from "@/hooks/useTrustListsStatus";
import { publishBrainstormTrustAnchor } from "@/services/trustAnchor";

/**
 * The update Brainstorm asks for once a user's network has produced Trusted
 * Lists their kind-10040 doesn't name yet (Benjamin, 2026-09-18). Their account
 * already works, so this is worded as an update, not a setup step, and asked
 * for in one tap — the signer prompt is the confirmation. A decline is fine: a
 * gentle toast, and the Update stays where it was until they sign. Nothing
 * here ever asks for a signature on its own.
 */
export function useListsUpdate() {
  const user = useActiveAccountDisplay();
  const pubkey = user?.pubkey;
  const history = useSelfHistory(pubkey);
  const taPubkey = (history.data as { data?: { ta_pubkey?: string | null } } | undefined)?.data?.ta_pubkey;
  const lists = useTrustListsStatus(pubkey, taPubkey).data;
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const pending = !!pubkey && !!taPubkey && lists?.status === "missing" && !!lists.designation;

  async function update() {
    if (!pending || busy || !pubkey || !taPubkey) return;
    setBusy(true);
    const res = await publishBrainstormTrustAnchor(pubkey, taPubkey, undefined, { lists: lists!.designation });
    setBusy(false);
    if (res.status === "success") {
      toast({ title: "Updated — your lists are live across Nostr." });
    } else if (res.status === "cancelled") {
      toast({ title: "Update skipped", description: "Other apps can't find your new lists yet. Tap Update whenever you're ready." });
    } else {
      toast({ title: "Couldn't update", description: res.message, variant: "destructive" });
    }
  }

  return { pending, busy, update };
}

function UpdateButton({ busy, onClick }: { busy: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-brand-primary px-3 py-1 text-xs font-bold text-white transition-colors hover:bg-brand-primary-hover disabled:opacity-70"
      data-testid="button-lists-update"
    >
      {busy ? (
        <>
          <Loader2 className="h-3 w-3 animate-spin" /> Updating…
        </>
      ) : (
        "Update"
      )}
    </button>
  );
}

/** The header's update pill: purple, not a warning — nothing is broken. */
export function ListsUpdatePill() {
  const { pending, busy, update } = useListsUpdate();
  if (!pending) return null;
  return (
    <div
      className="inline-flex max-w-full items-center gap-2 rounded-full border border-brand-primary/25 bg-brand-primary/[0.06] py-1 pl-3 pr-1 dark:bg-brand-primary/15"
      data-testid="pill-lists-update"
    >
      <Sparkles className="h-3.5 w-3.5 shrink-0 text-brand-primary dark:text-brand-link" />
      <span className="hidden whitespace-nowrap text-[13px] font-bold text-slate-800 dark:text-slate-100 sm:block">
        New lists from your network
      </span>
      <UpdateButton busy={busy} onClick={() => void update()} />
    </div>
  );
}

/** The same update as a line, under the ✓ Activate step where the header pill hides. */
export function ListsUpdateLine() {
  const { pending, busy, update } = useListsUpdate();
  if (!pending) return null;
  return (
    <div
      className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-brand-primary/20 bg-brand-primary/[0.04] px-3 py-2 dark:bg-brand-primary/10"
      data-testid="line-lists-update"
    >
      <span className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
        <Sparkles className="h-4 w-4 shrink-0 text-brand-primary dark:text-brand-link" />
        Update available — new lists from your network
      </span>
      <UpdateButton busy={busy} onClick={() => void update()} />
    </div>
  );
}
