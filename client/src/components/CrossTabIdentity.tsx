/**
 * What a tab does when another tab changes who it is.
 *
 * The manager has already followed by the time this runs — the mirror applies
 * the change at module level, because `authenticatedFetch` reads the Active
 * Account and isn't waiting for React. What's left is everything React owns: the
 * cached answers belong to the previous identity, the page might be one of
 * theirs, and the switch happened somewhere the user isn't looking, so it has to
 * be said out loud.
 *
 * The notice deliberately doesn't promise the key came too. It can't — the
 * unlocked key is per-tab, so this tab arrives Locked and unlocks on its own
 * next publish.
 */
import { useEffect, useRef } from "react";
import { useLocation } from "wouter";

import { accountMirror } from "@/accounts";
import { displayNameOf, npubOf } from "@/accounts/display";
import { leaveScopedRoute } from "@/accounts/scoped-routes";
import type { BrainstormAccount } from "@/accounts/metadata";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";

function nameOf(account: BrainstormAccount): string {
  const npub = npubOf(account);
  return displayNameOf(account) || (npub ? `${npub.slice(0, 12)}…` : "another account");
}

export function CrossTabIdentity() {
  const [location, navigate] = useLocation();
  const { toast } = useToast();

  // Read at message time, not at subscribe time — the subscription outlives navigation.
  const here = useRef(location);
  here.current = location;

  useEffect(() => {
    const subscription = accountMirror.changes$.subscribe(({ account, previous }) => {
      queryClient.clear();

      if (!account) {
        toast({ title: "Signed out", description: "Another tab signed out of this browser." });
        return;
      }

      toast({
        title: `Now signed in as ${nameOf(account)}`,
        description: "Another tab switched accounts.",
      });

      const to = leaveScopedRoute(here.current, {
        previousNpub: previous ? npubOf(previous) : null,
        nextNpub: npubOf(account),
      });
      if (to) navigate(to, { replace: true });
    });
    return () => subscription.unsubscribe();
  }, [navigate, toast]);

  return null;
}
