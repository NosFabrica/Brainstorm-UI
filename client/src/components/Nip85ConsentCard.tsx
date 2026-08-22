import { useEffect, useRef, useState } from "react";
import { AlertCircle, Check, ChevronDown, Share2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Switch } from "@/components/ui/switch";
import { checkExistingTrustProvider, type TrustProviderStatus } from "@/services/trustAnchor";
import { nip85ExplainerSections } from "@/components/nip85Explainer";

interface Nip85ConsentCardProps {
  pubkey?: string | null;
  /** The user's assigned Brainstorm service key, when /user/history has it. */
  taPubkey?: string | null;
  value: boolean;
  onChange: (v: boolean) => void;
  /**
   * Skip the relay pre-check. For a key minted in this app minutes ago, a
   * kind-10040 can't exist yet — don't spend a relay timeout looking for one
   * in the middle of onboarding.
   */
  skipProviderCheck?: boolean;
  className?: string;
}

/**
 * The "also publish your NIP-85 declaration?" ask that sits next to every
 * "calculate my scores" CTA. Consent is captured here, up front — the 10040 is
 * independent of scoring and is published right at commit when the service key
 * is known (see `publishBrainstormTrustAnchor`), instead of the old silent
 * background publish minutes later. The pre-check reads their outbox relays: a
 * declaration already naming Brainstorm collapses the card to a done-chip, one
 * naming a different provider flips the default to off behind a replace
 * warning — we never overwrite a provider choice by default.
 */
export function Nip85ConsentCard({
  pubkey,
  taPubkey,
  value,
  onChange,
  skipProviderCheck = false,
  className = "",
}: Nip85ConsentCardProps) {
  const [providerStatus, setProviderStatus] = useState<TrustProviderStatus | "checking">(
    skipProviderCheck ? "none" : "checking",
  );
  // Once the user has touched the switch, the pre-check result must not fight
  // their choice — it only sets defaults while the card is still untouched.
  const touchedRef = useRef(false);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (skipProviderCheck || !pubkey) return;
    let cancelled = false;
    setProviderStatus("checking");
    (async () => {
      const status = await checkExistingTrustProvider(pubkey, taPubkey);
      if (cancelled) return;
      setProviderStatus(status);
      if (touchedRef.current) return;
      // Already declared: nothing to consent to. Another provider: opt-in only.
      if (status === "brainstorm" || status === "other") onChangeRef.current(false);
    })();
    return () => { cancelled = true; };
  }, [pubkey, taPubkey, skipProviderCheck]);

  const [expanded, setExpanded] = useState(false);
  const explainer = nip85ExplainerSections.find((s) => s.key === "what");

  if (providerStatus === "brainstorm") {
    return (
      <Card className={`p-4 ${className}`} data-testid="nip85-consent-card">
        <div className="flex items-center gap-2.5">
          <Chip tone="emerald" icon={Check} data-testid="nip85-consent-already-set">Already set up</Chip>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Brainstorm is your trusted-assertions provider — other apps can already find your scores.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <Card className={`p-4 ${className}`} data-testid="nip85-consent-card">
      <div className="flex items-start gap-3">
        <div className="h-8 w-8 rounded-lg bg-brand-primary/10 dark:bg-brand-primary/15 border border-brand-primary/15 dark:border-brand-primary/25 flex items-center justify-center text-brand-link shrink-0">
          <Share2 className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
            Share your scores with other apps
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            Also signs one nostr note (NIP-85) telling compatible apps like Amethyst and Nostria
            where to find your personalized scores. Your signer will ask you to approve it.
          </p>
        </div>
        <Switch
          checked={value}
          onCheckedChange={(v) => {
            touchedRef.current = true;
            onChange(v);
          }}
          aria-label="Publish your NIP-85 trusted-assertions note"
          data-testid="nip85-consent-toggle"
        />
      </div>

      {providerStatus === "other" && (
        <div
          className="mt-3 flex items-start gap-2 px-3 py-2.5 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/25"
          data-testid="nip85-consent-replace-warning"
        >
          <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-px" />
          <p className="text-[12px] leading-relaxed text-amber-800 dark:text-amber-200">
            Another provider is already publishing your scores. Turning this on will{" "}
            <strong className="font-bold">replace it</strong> with Brainstorm for your trusted
            assertions going forward.
          </p>
        </div>
      )}

      {explainer && (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="inline-flex items-center gap-1 text-xs font-semibold text-brand-link hover:text-brand-primary transition-colors"
            data-testid="nip85-consent-explainer-toggle"
          >
            {explainer.title}
            <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`} />
          </button>
          {expanded && (
            <div className="mt-2" data-testid="nip85-consent-explainer">
              {explainer.content}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
