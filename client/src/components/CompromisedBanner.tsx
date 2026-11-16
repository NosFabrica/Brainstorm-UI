import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { nip19 } from "nostr-tools";
import { KeyRound } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { apiClient, type CompromisedStatus } from "@/services/api";

/** How long a profile trusts its answer: marking a key is rare, and the banner is a warning, not a gate. */
const STALE_MS = 5 * 60_000;
/** The proof is quoted inline (its new holder can delete it from relays); longer posts are cut here. */
const PROOF_PREVIEW_CHARS = 600;

/**
 * Whether brainstorm_server marks `pubkey` (hex) compromised. Public, so it
 * answers the same for every viewer; `null` while loading or when the server
 * can't say, which reads as "not marked".
 */
export function useCompromisedStatus(pubkey: string | null | undefined, enabled = true) {
  return useQuery<CompromisedStatus | null>({
    queryKey: ["compromised", pubkey],
    queryFn: () => apiClient.getCompromisedStatus(pubkey as string),
    enabled: !!pubkey && enabled,
    staleTime: STALE_MS,
    retry: false,
  });
}

function formatDay(iso: string | null): string | null {
  if (!iso) return null;
  // The server's timestamps are naive UTC.
  const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString(undefined, { dateStyle: "medium" });
}

function proofLink(status: CompromisedStatus): string | null {
  const id = status.proof_event?.id ?? status.proof_event_id;
  if (!id) return null;
  try {
    return `/e/${nip19.neventEncode({ id, author: status.proof_event?.pubkey })}`;
  } catch {
    return null;
  }
}

function npubOf(hex: string): string | null {
  try {
    return nip19.npubEncode(hex);
  } catch {
    return null;
  }
}

/**
 * The warning a profile shows when its key is marked compromised: whoever holds
 * the key now isn't its owner, so what it signs may not be theirs, and its
 * scores are set to 0. Quotes the proof the server kept (the post may be gone
 * from relays) and links the owner's new account once it's known. Renders
 * nothing for an unmarked key.
 *
 * `overviewSays` is the profile overview's `compromised` flag, so the details
 * are fetched only for a marked key: `false` shows nothing with no request,
 * `null` waits for the overview, and `undefined` (no overview, or a server too
 * old to send the flag) asks `/compromised` directly.
 */
export function CompromisedBanner({
  pubkey,
  overviewSays,
  className,
}: {
  pubkey: string | null | undefined;
  overviewSays?: boolean | null;
  className?: string;
}) {
  const { data: status } = useCompromisedStatus(pubkey, overviewSays !== false && overviewSays !== null);
  const [showProof, setShowProof] = useState(false);
  if (overviewSays === false || !status?.compromised) return null;

  const since = formatDay(status.since);
  const proofHref = proofLink(status);
  const successorNpub = status.successor_pubkey ? npubOf(status.successor_pubkey) : null;
  // Short-line posts space every sentence with a blank line; one break reads the same in a quote.
  const proofText = (status.proof_event?.content ?? "").replace(/\n\s*\n+/g, "\n").trim();
  const proofDay = status.proof_event?.created_at
    ? new Date(status.proof_event.created_at * 1000).toLocaleDateString(undefined, { dateStyle: "medium" })
    : null;

  return (
    // `status`, not the Alert's `alert`: it appears once the check resolves, and an
    // assertive region would cut off whatever a screen reader is reading.
    <Alert
      variant="destructive"
      role="status"
      className={cn("px-3 py-2.5 [&>svg]:left-3 [&>svg]:top-3 [&>svg~*]:pl-6", className)}
      data-testid="banner-compromised"
    >
      <KeyRound className="h-4 w-4" />
      <AlertDescription className="text-xs leading-relaxed">
        <span className="font-bold text-red-700 dark:text-red-300">This account's key is compromised</span>
        <span className="text-red-700/90 dark:text-red-300/90">
          {" "}
          — someone else holds its private key{since ? ` (marked ${since})` : ""}. What it signs may not be from its
          owner, and its trust scores are set to 0.
        </span>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
          {successorNpub && (
            <Link
              href={`/p/${successorNpub}`}
              className="font-semibold text-red-700 underline underline-offset-2 hover:text-red-800 dark:text-red-300 dark:hover:text-red-200"
              data-testid="banner-compromised-successor"
            >
              Their new account
            </Link>
          )}
          {proofText && (
            <button
              type="button"
              onClick={() => setShowProof((v) => !v)}
              className="rounded font-medium text-red-700/80 underline underline-offset-2 hover:text-red-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400/40 dark:text-red-300/80 dark:hover:text-red-200"
              aria-expanded={showProof}
              data-testid="banner-compromised-proof-toggle"
            >
              {showProof ? "Hide the proof" : "Show the proof"}
            </button>
          )}
          {proofHref && (
            <Link
              href={proofHref}
              className="font-medium text-red-700/80 underline underline-offset-2 hover:text-red-800 dark:text-red-300/80 dark:hover:text-red-200"
              data-testid="banner-compromised-proof-link"
            >
              Open the post
            </Link>
          )}
        </div>
        {showProof && proofText && (
          <blockquote
            className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap break-words border-l-2 border-red-300 pl-2.5 text-[11px] text-red-900/80 dark:border-red-500/40 dark:text-red-200/80"
            data-testid="banner-compromised-proof"
          >
            {proofText.length > PROOF_PREVIEW_CHARS ? `${proofText.slice(0, PROOF_PREVIEW_CHARS)}…` : proofText}
            {proofDay && <span className="mt-1 block text-red-700/60 dark:text-red-300/60">Posted {proofDay}</span>}
          </blockquote>
        )}
      </AlertDescription>
    </Alert>
  );
}
