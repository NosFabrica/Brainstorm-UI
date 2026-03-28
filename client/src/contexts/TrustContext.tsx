import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

export type TrustMethod = "graperank" | "follow_list" | "trusted_list" | "trust_everyone";

interface TrustState {
  povPubkey: string;
  method: TrustMethod;
  trustedListId: string;
  setPovPubkey: (pk: string) => void;
  setMethod: (m: TrustMethod) => void;
  setTrustedListId: (id: string) => void;
  resetToSelf: () => void;
  isSelf: boolean;
}

const TrustContext = createContext<TrustState | null>(null);

const LS_KEY_METHOD = "brainstorm_trust_method";
const LS_KEY_POV = "brainstorm_trust_pov";

const VALID_METHODS: TrustMethod[] = ["graperank", "follow_list", "trusted_list", "trust_everyone"];

export function TrustProvider({ selfPubkey, children }: { selfPubkey: string; children: ReactNode }) {
  const [povPubkey, setPovPubkeyState] = useState(() => {
    const saved = localStorage.getItem(LS_KEY_POV);
    return saved && saved.length === 64 ? saved : selfPubkey;
  });
  const [method, setMethodState] = useState<TrustMethod>(() => {
    const saved = localStorage.getItem(LS_KEY_METHOD) as TrustMethod | null;
    if (saved && VALID_METHODS.includes(saved)) return saved;
    return "trust_everyone";
  });
  const [trustedListId, setTrustedListIdState] = useState("");

  const setPovPubkey = useCallback((pk: string) => {
    setPovPubkeyState(pk);
    localStorage.setItem(LS_KEY_POV, pk);
  }, []);
  const setMethod = useCallback((m: TrustMethod) => {
    setMethodState(m);
    localStorage.setItem(LS_KEY_METHOD, m);
  }, []);
  const setTrustedListId = useCallback((id: string) => setTrustedListIdState(id), []);
  const resetToSelf = useCallback(() => {
    setPovPubkeyState(selfPubkey);
    localStorage.setItem(LS_KEY_POV, selfPubkey);
  }, [selfPubkey]);

  const isSelf = povPubkey === selfPubkey;

  return (
    <TrustContext.Provider value={{ povPubkey, method, trustedListId, setPovPubkey, setMethod, setTrustedListId, resetToSelf, isSelf }}>
      {children}
    </TrustContext.Provider>
  );
}

export function useTrust(): TrustState {
  const ctx = useContext(TrustContext);
  if (!ctx) throw new Error("useTrust must be used within TrustProvider");
  return ctx;
}
