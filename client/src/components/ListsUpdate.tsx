import { useSyncExternalStore } from "react";
import { Loader2 } from "lucide-react";
import { BrainLogo } from "@/components/BrainLogo";
import { useToast } from "@/hooks/use-toast";
import { useActiveAccountDisplay } from "@/hooks/useActiveAccountDisplay";
import { useSelfHistory } from "@/hooks/useSelf";
import { useTrustListsStatus } from "@/hooks/useTrustListsStatus";
import { publishBrainstormTrustAnchor, type TrustAnchorPublishResult } from "@/services/trustAnchor";
import { ToastAction } from "@/components/ui/toast";

/**
 * One update at a time across every surface that offers it. The header pill
 * and the setup page's line are separate components: a "busy" of their own
 * let a tap on the pill, a move to /setup and a tap on the line there ask for
 * a second signature and publish a second kind 10040 while the first was out.
 */
let updating = false;
const watchers = new Set<() => void>();
function setUpdating(next: boolean): void {
  updating = next;
  for (const watch of watchers) watch();
}
function watchUpdating(watch: () => void): () => void {
  watchers.add(watch);
  return () => watchers.delete(watch);
}
const isUpdating = () => updating;

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
  const busy = useSyncExternalStore(watchUpdating, isUpdating);
  const pending = !!pubkey && !!taPubkey && lists?.status === "missing" && !!lists.designation;

  function announce(res: TrustAnchorPublishResult) {
    if (res.status === "success") {
      toast({ title: "Updated — your lists are live.", variant: "brand" });
    } else if (res.status === "cancelled") {
      toast({
        title: "Update skipped",
        description: "Other apps can't find your new lists yet. Tap Update whenever you're ready.",
        variant: "brand",
      });
    } else {
      // The update is already signed: Retry sends it again without a second signature.
      const retry = res.retry;
      toast({
        title: "Couldn't reach your relays",
        description: retry ? "Your update is signed — Retry sends it again, no new signature." : res.message,
        variant: "destructive",
        action: retry ? (
          <ToastAction altText="Retry the update" onClick={() => void run(retry)}>
            Retry
          </ToastAction>
        ) : undefined,
      });
    }
  }

  async function run(send: () => Promise<TrustAnchorPublishResult>) {
    // Checked and set before the first await: a second tap in the same tick sees it.
    if (updating) return;
    setUpdating(true);
    let res: TrustAnchorPublishResult;
    try {
      res = await send();
    } finally {
      setUpdating(false);
    }
    announce(res);
  }

  async function update() {
    if (!pending || !pubkey || !taPubkey) return;
    await run(() => publishBrainstormTrustAnchor(pubkey, taPubkey, undefined, { lists: lists!.designation }));
  }

  return { pending, busy, update };
}

function UpdateButton({ busy, onClick }: { busy: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      // Thumb-sized on phones (about 40px tall); the slim chip from sm up.
      className="inline-flex min-h-[40px] items-center justify-center gap-1 whitespace-nowrap rounded-full bg-brand-primary px-4 py-1 text-[13px] font-bold text-white transition-colors hover:bg-brand-primary-hover disabled:opacity-70 sm:min-h-0 sm:px-3 sm:text-xs"
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
      <BrainLogo size={14} className="shrink-0" />
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
        <BrainLogo size={16} className="shrink-0" />
        Update available — new lists from your network
      </span>
      <UpdateButton busy={busy} onClick={() => void update()} />
    </div>
  );
}
