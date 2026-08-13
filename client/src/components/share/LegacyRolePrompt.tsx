import { useState } from "react";
import { Loader2, Sparkles, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useApplyTag, useProfileTags } from "@/hooks/useTags";
import { resolveOrMintTag } from "@/services/tags";

/**
 * The one-time offer to turn someone's retired "What you do" roles into tags.
 *
 * `Start.md` Q2 sanctions migrating the host's existing role chips to protocol
 * tags as "a one-time, owner-prompted conversion". We had the conversion but
 * not the prompt: the roles were only offered inside the tag picker, which
 * meant discovering them required opening a menu you had no reason to open.
 * This is the prompt half.
 *
 * Owner-consented by construction — it publishes nothing until they press the
 * button. Their roles were a private-ish profile setting; pushing them to a
 * public hub on their behalf would be a different act from what they agreed to.
 *
 * Dismissal is per-account and permanent (localStorage). "One-time" has to mean
 * once, or it's nagging.
 */
const DISMISSED_KEY = "brainstorm.legacyRolePrompt.dismissed";

function dismissedFor(pubkey: string): boolean {
  try {
    const raw = window.localStorage?.getItem(DISMISSED_KEY);
    return !!raw && (JSON.parse(raw) as string[]).includes(pubkey);
  } catch {
    return false;
  }
}

function rememberDismissal(pubkey: string) {
  try {
    const raw = window.localStorage?.getItem(DISMISSED_KEY);
    const list: string[] = raw ? (JSON.parse(raw) as string[]) : [];
    if (!list.includes(pubkey)) list.push(pubkey);
    window.localStorage?.setItem(DISMISSED_KEY, JSON.stringify(list));
  } catch {
    // Storage blocked — the prompt comes back next session. Annoying, not broken.
  }
}

export function LegacyRolePrompt({
  pubkey,
  legacyRoles,
}: {
  pubkey: string;
  /** Roles saved under the retired editor. Empty for almost everyone. */
  legacyRoles: string[];
}) {
  const [dismissed, setDismissed] = useState(() => dismissedFor(pubkey));
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();
  const { data } = useProfileTags(pubkey);
  const applyTag = useApplyTag(pubkey);

  const taken = new Set((data?.tags ?? []).map((t) => t.name.toLowerCase()));
  const pending = legacyRoles.filter((r) => !taken.has(r.toLowerCase()));

  if (dismissed || !pending.length) return null;

  function dismiss() {
    rememberDismissal(pubkey);
    setDismissed(true);
  }

  async function addAll() {
    setBusy(true);
    let added = 0;
    // Sequential on purpose: each one may mint a tag-element and then assert
    // against it, and each publish needs its own signature. Firing them in
    // parallel means a burst of signer prompts that reads as a hijack.
    for (const role of pending) {
      try {
        const tag = await resolveOrMintTag(role);
        const result = await applyTag.mutateAsync({ tag, displayName: role });
        if (!result.failedAt) added++;
      } catch {
        // Keep going — a partial migration is better than an all-or-nothing
        // failure, and whatever didn't land stays offered in the picker.
      }
    }
    setBusy(false);
    dismiss();
    toast({
      title: added ? `Added ${added} ${added === 1 ? "tag" : "tags"}` : "Couldn't add those",
      description: added
        ? "They're on your profile now, and other people can back them up."
        : "Give it another try from the Add a tag menu.",
      variant: added ? undefined : "destructive",
    });
  }

  return (
    <div
      className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-border bg-slate-50 px-3 py-2 dark:bg-slate-900"
      data-testid="legacy-role-prompt"
    >
      <Sparkles className="h-3.5 w-3.5 shrink-0 text-brand-primary" />
      <p className="min-w-0 flex-1 text-xs text-slate-600 dark:text-slate-300">
        You used to list{" "}
        <span className="font-semibold text-slate-900 dark:text-slate-100">
          {pending.join(", ")}
        </span>
        . Add {pending.length === 1 ? "it" : "them"} as tags so other people can back{" "}
        {pending.length === 1 ? "it" : "them"} up?
      </p>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={addAll}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-full bg-brand-primary px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-brand-primary-hover disabled:opacity-50"
          data-testid="legacy-role-add-all"
        >
          {busy && <Loader2 className="h-3 w-3 animate-spin" />}
          Add {pending.length === 1 ? "it" : "them"}
        </button>
        <button
          type="button"
          onClick={dismiss}
          disabled={busy}
          aria-label="No thanks"
          className="rounded-full p-1.5 text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-600 disabled:opacity-50 dark:hover:bg-slate-800"
          data-testid="legacy-role-dismiss"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
