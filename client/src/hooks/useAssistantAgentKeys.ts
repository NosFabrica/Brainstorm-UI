import { useCallback, useEffect, useRef, useState } from "react";
import { useActiveAccount } from "applesauce-react/hooks";
import { canSignSilently } from "@/accounts/signing";
import type { BrainstormAccount } from "@/accounts/metadata";
import { parseAgentKeys, type AgentKey } from "@/lib/agentKeys";
import {
  decryptAssistantKeys,
  fetchAssistantKeys,
  type AssistantKeysFetch,
  type AssistantKeysProblem,
} from "@/services/assistantAgentKeys";

export type AssistantKeysState =
  | { status: "loading" }
  | AssistantKeysProblem
  /** Reading them would raise the unlock prompt: waits for the reader to ask (`reveal`). */
  | { status: "locked" }
  /** The signer didn't decrypt them: `reveal` asks again. */
  | { status: "failed"; error: string }
  /** This sign-in can't decrypt them. */
  | { status: "unreadable" }
  | { status: "ready"; assistant: string; tags: string[][]; keys: AgentKey[]; createdAt: number | null };

export type AssistantKeys = AssistantKeysState & {
  /** Decrypt at the reader's request: Unlock, or Retry after the signer failed. */
  reveal: () => void;
  /** Ask the server again (Retry after a 502 or an error). */
  reload: () => void;
  /** What an edit wrote, shown without asking again. */
  wrote: (assistant: string, tags: string[][], createdAt: number | null) => void;
};

/**
 * The Active Account's Assistant's AI keys, from brainstorm_server, decrypted in memory
 * only: not react-query (its keys and devtools would see them), not browser storage. As
 * the reader's own keys (`useAgentKeys`), decrypting never raises the unlock prompt by
 * itself: a Locked key reports `locked` until `reveal()`.
 */
export function useAssistantAgentKeys(): AssistantKeys {
  const account = useActiveAccount() as BrainstormAccount | undefined;
  const pubkey = account?.pubkey;
  const accountRef = useRef(account);
  accountRef.current = account;
  const [fetchCount, setFetchCount] = useState(0);
  const [askCount, setAskCount] = useState(0);
  const [fetched, setFetched] = useState<{ pubkey: string; value: AssistantKeysFetch } | null>(null);
  const [state, setState] = useState<{ pubkey: string; value: AssistantKeysState } | null>(null);

  useEffect(() => {
    if (!pubkey) return;
    let live = true;
    setState({ pubkey, value: { status: "loading" } });
    void fetchAssistantKeys().then((value) => {
      if (live) setFetched({ pubkey, value });
    });
    return () => {
      live = false;
    };
  }, [pubkey, fetchCount]);

  useEffect(() => {
    const acct = accountRef.current;
    if (!acct || !pubkey || !fetched || fetched.pubkey !== pubkey) return;
    const got = fetched.value;
    let live = true;
    const set = (value: AssistantKeysState) => {
      if (live) setState({ pubkey, value });
    };
    if (got.status !== "ok") {
      set(got);
      return;
    }
    void (async () => {
      if (got.ciphertext && askCount === 0 && !(await canSignSilently(acct))) {
        set({ status: "locked" });
        return;
      }
      try {
        const read = await decryptAssistantKeys(acct, got.assistant, got.ciphertext);
        if (read.status === "ready") {
          set({
            status: "ready",
            assistant: got.assistant,
            tags: read.tags,
            keys: parseAgentKeys(read.tags),
            createdAt: got.createdAt,
          });
        } else set(read.status === "failed" ? { status: "failed", error: read.error } : { status: "unreadable" });
      } catch {
        // They declined to unlock: still locked.
        set({ status: "locked" });
      }
    })();
    return () => {
      live = false;
    };
  }, [pubkey, fetched, askCount]);

  const reveal = useCallback(() => setAskCount((n) => n + 1), []);
  const reload = useCallback(() => setFetchCount((n) => n + 1), []);
  const wrote = useCallback(
    (assistant: string, tags: string[][], createdAt: number | null) => {
      if (!pubkey) return;
      // The written list stands over the read it was built from: a later Unlock mustn't
      // decrypt the older ciphertext back over it.
      setFetched(null);
      setState({
        pubkey,
        value: { status: "ready", assistant, tags, keys: parseAgentKeys(tags), createdAt },
      });
    },
    [pubkey],
  );

  const value: AssistantKeysState = state && state.pubkey === pubkey ? state.value : { status: "loading" };
  return { ...value, reveal, reload, wrote };
}
