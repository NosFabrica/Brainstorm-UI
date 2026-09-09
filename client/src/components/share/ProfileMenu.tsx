import { useState } from "react";
import { Link } from "wouter";
import { ExternalLink, Flag, Volume2, VolumeX } from "lucide-react";
import { DropdownMenuItem, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger } from "@/components/ui/dropdown-menu";
import { EntityMenu } from "@/components/share/EntityMenu";
import { muteUser, reportUser, unmuteUser } from "@/services/socialActions";
import { useToast } from "@/hooks/use-toast";
import { nostrUriFor, nprofileFor } from "@/lib/shareId";

const REPORT_REASONS = ["spam", "impersonation", "other"] as const;

/**
 * The public profile's ⋯ menu — for everyone, signed in or not. Copies of
 * the person's keys (npub, hex, an nprofile carrying their relays) and
 * "Open in" another Nostr client sit in it for any visitor; a signed-in
 * viewer on someone else's page gets Mute and Report first; an admin keeps
 * "Advanced view" last (the analytics page is operator telemetry — everyone
 * else gets redirected out of it, so the link is theirs alone). Before, the
 * menu lived inside the Follow control and a signed-out visitor had none;
 * the open-in links sat in a panel of their own at the foot of the page
 * (team feedback, 2026-09-08). Mute/Report are optimistic, reverting on
 * failure.
 */
export function ProfileMenu({
  pubkey,
  npub,
  relays,
  viewer,
  initialMuted,
  alreadyReported,
  ua,
}: {
  pubkey: string;
  npub: string;
  /** The person's relays (NIP-65, or the link's hints) — the nprofile carries up to four. */
  relays: string[];
  viewer: { loggedIn: boolean; isOwner: boolean; isAdmin: boolean };
  initialMuted: boolean;
  alreadyReported: boolean;
  /** Test seam for the platform read; the browser's user agent by default. */
  ua?: string;
}) {
  const { toast } = useToast();
  const [muted, setMuted] = useState(initialMuted);
  const [reported, setReported] = useState(alreadyReported);
  const [busy, setBusy] = useState(false);

  const toggleMute = async () => {
    setBusy(true);
    const res = muted ? await unmuteUser(pubkey) : await muteUser(pubkey);
    setBusy(false);
    if (res.cancelled) return;
    if (res.success) {
      setMuted((v) => !v);
      toast({ title: muted ? "Unmuted" : "Muted" });
    } else {
      toast({ variant: "destructive", title: "Couldn't update mute", description: res.error || "Try again." });
    }
  };

  const submitReport = async (reason: string) => {
    const res = await reportUser(pubkey, reason);
    if (res.cancelled) return;
    if (res.success) {
      setReported(true);
      toast({ title: "Reported", description: "This lowers their standing in your network." });
    } else {
      toast({ variant: "destructive", title: "Couldn't report", description: res.error || "Try again." });
    }
  };

  const nprofile = nprofileFor(pubkey, relays);
  // Each row says what its key is for — "why would they want this?"
  // (Benjamin, 2026-09-08). Share owns the human link; these are for machines.
  const copies = [
    { id: "npub", label: "Copy npub", value: npub, hint: "Their public key, for Nostr apps and mentions" },
    { id: "hex", label: "Copy public key (hex)", value: pubkey, hint: "The raw key, for developers and relay tools" },
    ...(nprofile ? [{ id: "nprofile", label: "Copy nprofile", value: nprofile, hint: "Their key plus the relays their posts live on" }] : []),
  ];

  const social = viewer.loggedIn && !viewer.isOwner;
  return (
    <EntityMenu
      entity={{ kind: "profile", bech32: npub, uri: nostrUriFor(pubkey, relays) }}
      copies={copies}
      triggerTestId="share-actions-menu"
      ua={ua}
      leading={
        social ? (
          <>
            <DropdownMenuItem className="gap-2" onClick={toggleMute} disabled={busy} data-testid="share-mute">
              {muted ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
              {muted ? "Unmute" : "Mute"}
            </DropdownMenuItem>
            {reported ? (
              <DropdownMenuItem className="gap-2 text-amber-600" disabled data-testid="share-report">
                <Flag className="h-4 w-4" /> Reported
              </DropdownMenuItem>
            ) : (
              <DropdownMenuSub>
                <DropdownMenuSubTrigger className="gap-2" data-testid="share-report">
                  <Flag className="h-4 w-4" /> Report
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {REPORT_REASONS.map((r) => (
                    <DropdownMenuItem key={r} className="capitalize" onClick={() => void submitReport(r)}>
                      {r}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            )}
          </>
        ) : undefined
      }
      trailing={
        viewer.isAdmin ? (
          <DropdownMenuItem asChild className="gap-2 text-slate-500 dark:text-slate-400">
            <Link href={`/profile/${npub}`} data-testid="share-advanced-view">
              <ExternalLink className="h-4 w-4" /> Advanced view
            </Link>
          </DropdownMenuItem>
        ) : undefined
      }
    />
  );
}
