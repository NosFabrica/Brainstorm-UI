import { useCallback, useEffect, useState } from "react";
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
  // Each reveal() is a fresh ask, so a declined unlock can be tried again.
  const [asks, setAsks] = useState(0);
  const [state, setState] = useState<AgentKeysState>({ status: "loading" });

  useEffect(() => {
    if (!account || !event) {
      setState(list.settled ? { status: "none" } : { status: "loading" });
      return;
    }
    let live = true;
    void (async () => {
      if (asks === 0 && !(await canSignSilently(account))) {
        if (live) setState({ status: "locked" });
        return;
      }
      try {
        const tags = await decryptAgentKeyTags(account, event);
        if (live) setState(tags ? { status: "ready", keys: parseAgentKeys(tags) } : { status: "unreadable" });
      } catch {
        // They declined to unlock: still locked, not unreadable.
        if (live) setState({ status: "locked" });
      }
    })();
    return () => {
      live = false;
    };
  }, [account, event?.id, list.settled, asks]); // eslint-disable-line react-hooks/exhaustive-deps

  const reveal = useCallback(() => setAsks((n) => n + 1), []);
  return { ...state, reveal };
}
