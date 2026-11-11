import { useCallback, useEffect, useRef, useState } from "react";
import { useActiveAccount } from "applesauce-react/hooks";
import { canSignSilently } from "@/accounts/signing";
import type { BrainstormAccount } from "@/accounts/metadata";
import { AGENT_KEYS_KIND, parseAgentKeys, type AgentKey } from "@/lib/agentKeys";
import { useStoreReplaceable } from "@/hooks/useStoreReplaceable";
import { decryptAgentKeyTags, loadAgentKeys } from "@/services/agentKeys";

export type AgentKeysState =
  | { status: "loading" }
  /** Asked, and there is no event: nothing saved yet. */
  | { status: "none" }
  /** There is one, but reading it would raise the unlock prompt: wait for the user to ask. */
  | { status: "locked" }
  | { status: "ready"; keys: AgentKey[] }
  /** There is one and this Account can't read it. */
  | { status: "unreadable" };

/**
 * The Active Account's AI agent keys, live from the store. Decrypting never raises
 * the unlock prompt by itself: a Locked local key that can't open silently reports
 * `locked`, and `reveal()` decrypts at the user's request.
 */
export function useAgentKeys(): AgentKeysState & { reveal: () => void } {
  const account = useActiveAccount() as BrainstormAccount | undefined;
  const pubkey = account?.pubkey;
  const list = useStoreReplaceable(AGENT_KEYS_KIND, pubkey, () => loadAgentKeys(pubkey!));
  const event = list.event;
  // Each reveal() is a fresh ask, so a declined unlock can be tried again. It is the
  // account's ask: switching accounts doesn't carry one account's unlock to the next.
  const [asks, setAsks] = useState({ pubkey, n: 0 });
  const askCount = asks.pubkey === pubkey ? asks.n : 0;
  // Tagged with whose keys they are: after a switch, the last account's keys read as
  // loading until this one's are decrypted, never as this account's.
  const [state, setState] = useState<{ pubkey: string | undefined; value: AgentKeysState }>({
    pubkey,
    value: { status: "loading" },
  });

  // The decrypt keys on whose keys and which event, never on the ask settling: an EOSE
  // landing while a decrypt is out (an extension prompt open) must not start a second.
  const accountRef = useRef(account);
  accountRef.current = account;
  const own = event && event.pubkey === pubkey ? event : undefined;
  useEffect(() => {
    const acct = accountRef.current;
    if (!acct || !own) return;
    const set = (value: AgentKeysState) => setState({ pubkey, value });
    let live = true;
    void (async () => {
      if (askCount === 0 && !(await canSignSilently(acct))) {
        if (live) set({ status: "locked" });
        return;
      }
      try {
        const tags = await decryptAgentKeyTags(acct, own);
        if (live) set(tags ? { status: "ready", keys: parseAgentKeys(tags) } : { status: "unreadable" });
      } catch {
        // They declined to unlock: still locked, not unreadable.
        if (live) set({ status: "locked" });
      }
    })();
    return () => {
      live = false;
    };
  }, [pubkey, own?.id, askCount]); // eslint-disable-line react-hooks/exhaustive-deps

  const reveal = useCallback(() => setAsks((a) => ({ pubkey, n: (a.pubkey === pubkey ? a.n : 0) + 1 })), [pubkey]);
  let value: AgentKeysState;
  if (!own) value = list.settled ? { status: "none" } : { status: "loading" };
  else value = state.pubkey === pubkey ? state.value : { status: "loading" };
  return { ...value, reveal };
}
