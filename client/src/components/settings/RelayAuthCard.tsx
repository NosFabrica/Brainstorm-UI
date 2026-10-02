/**
 * The consent switch for signing in to other people's relays that ask (NIP-42).
 * The reader's own relays — their relay list and inbox list — are always
 * signed in to (services/relayAuth); this covers the rest, such as a
 * recipient's inbox relay, and is what Messages' "Allow sign-in" turns on.
 *
 * Some relays gate even reads, or a private message, behind a login. Brainstorm never
 * waits for that — a screen is never held by one relay's login — but with
 * this on, the account's signer answers such a relay's challenge so its
 * events join the next read. Off until the reader turns it on: the login is a
 * signing prompt per relay in nos2x or Amber until "always allow" is ticked,
 * and an unasked-for prompt is not a setting anyone chose. Kept per account
 * on this device (lib/relayAuthPref).
 */
import { useState } from "react";
import { KeyRound } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useActiveAccountDisplay } from "@/hooks/useActiveAccountDisplay";
import { relayAuthAllowed, setRelayAuthAllowed } from "@/lib/relayAuthPref";

export function RelayAuthCard() {
  const pubkey = useActiveAccountDisplay()?.pubkey ?? "";
  const [on, setOn] = useState(() => (pubkey ? relayAuthAllowed(pubkey) : false));

  const change = (next: boolean) => {
    if (!pubkey) return;
    setRelayAuthAllowed(pubkey, next);
    setOn(next);
  };

  return (
    <Card className="overflow-hidden" data-testid="card-relay-auth">
      <div className="flex items-start gap-3 border-b border-border bg-slate-50 px-5 py-4 dark:bg-slate-900">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-100 bg-white shadow-sm ring-1 ring-slate-100 dark:border-slate-800/60 dark:bg-slate-900 dark:ring-slate-800/60">
          <KeyRound className="h-4 w-4 text-brand-deep" />
        </div>
        <div className="min-w-0 flex-1">
          <h2
            className="text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100"
            style={{ fontFamily: "var(--font-display)" }}
            data-testid="text-relay-auth-title"
          >
            Other relays that ask you to sign in
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Relays in your own relay and inbox lists are always signed in to. Some others — like a recipient&rsquo;s
            inbox — only take your messages after a login.
          </p>
        </div>
      </div>
      <div className="flex items-start justify-between gap-4 p-5">
        <div className="min-w-0">
          <label htmlFor="relay-auth-switch" className="text-sm font-medium text-slate-900 dark:text-slate-100">
            Sign in to other relays that ask
          </label>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Answers their login with your signer so their events show up too. Expect a signing prompt per relay in nos2x
            or Amber until you tick &ldquo;always allow&rdquo;.
          </p>
        </div>
        <Switch
          id="relay-auth-switch"
          checked={on}
          onCheckedChange={change}
          disabled={!pubkey}
          aria-label="Sign in to other relays that ask"
          data-testid="switch-relay-auth"
        />
      </div>
    </Card>
  );
}
