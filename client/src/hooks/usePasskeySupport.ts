import { useEffect, useState } from "react";

import { passkeyMethod, passkeySupport, type PasskeyMethod, type PasskeySupport } from "@/accounts/passkey";

/**
 * Whether this browser can lock a key with a passkey, and what this device calls
 * one. `support` is null until the capability probe answers — render nothing for
 * the passkey path until then, rather than a button that might vanish.
 */
export function usePasskeySupport(): { support: PasskeySupport | null; method: PasskeyMethod } {
  const [support, setSupport] = useState<PasskeySupport | null>(null);
  useEffect(() => {
    let live = true;
    void passkeySupport().then((answer) => {
      if (live) setSupport(answer);
    });
    return () => {
      live = false;
    };
  }, []);
  return { support, method: passkeyMethod() };
}
