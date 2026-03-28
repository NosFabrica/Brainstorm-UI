import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

export type TrustMethod = "graperank" | "follow_list" | "trust_everyone";

interface TrustState {
  povPubkey: string;
  method: TrustMethod;
  setPovPubkey: (pk: string) => void;
  setMethod: (m: TrustMethod) => void;
  resetToSelf: () => void;
}

const TrustContext = createContext<TrustState | null>(null);

const LS_KEY_METHOD = "brainstorm_trust_method";

export function TrustProvider({ selfPubkey, children }: { selfPubkey: string; children: ReactNode }) {
  const [povPubkey, setPovPubkeyState] = useState(selfPubkey);
  const [method, setMethodState] = useState<TrustMethod>(() => {
    const saved = localStorage.getItem(LS_KEY_METHOD);
    if (saved === "graperank" || saved === "follow_list" || saved === "trust_everyone") return saved;
    return "trust_everyone";
  });

  const setPovPubkey = useCallback((pk: string) => setPovPubkeyState(pk), []);
  const setMethod = useCallback((m: TrustMethod) => {
    setMethodState(m);
    localStorage.setItem(LS_KEY_METHOD, m);
  }, []);
  const resetToSelf = useCallback(() => setPovPubkeyState(selfPubkey), [selfPubkey]);

  return (
    <TrustContext.Provider value={{ povPubkey, method, setPovPubkey, setMethod, resetToSelf }}>
      {children}
    </TrustContext.Provider>
  );
}

export function useTrust(): TrustState {
  const ctx = useContext(TrustContext);
  if (!ctx) throw new Error("useTrust must be used within TrustProvider");
  return ctx;
}
