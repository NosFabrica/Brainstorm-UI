/**
 * The two network ends of "Connect with OpenRouter" (lib/openRouterOAuth has the rest):
 * sending the user to OpenRouter, and trading the code they come back with for a key.
 */
import {
  OPENROUTER_CALLBACK_PATH,
  OPENROUTER_KEYS_URL,
  authUrl,
  codeChallenge,
  exchangeBody,
  keepPending,
  randomToken,
  readCallback,
  readExchangeAnswer,
  takePending,
  type ConnectOutcome,
} from "@/lib/openRouterOAuth";

/**
 * Sends this tab to OpenRouter's consent page. False when this browser won't keep the
 * verifier for the round trip (storage blocked), in which case nothing navigates.
 */
export async function startOpenRouterConnect(assign: (url: string) => void = (url) => window.location.assign(url)) {
  const verifier = randomToken();
  const state = randomToken();
  if (!keepPending({ verifier, state })) return false;
  const challenge = await codeChallenge(verifier);
  assign(authUrl({ callbackUrl: `${window.location.origin}${OPENROUTER_CALLBACK_PATH}`, challenge, state }));
  return true;
}

let inFlight: { search: string; outcome: Promise<ConnectOutcome> } | null = null;

/**
 * Checks the callback's `?code=…&state=…` against this tab's pending sign-in and trades
 * the code for a key. The same search answers once, however often it is asked (a
 * remount, StrictMode), because a code is good for one exchange.
 */
export function completeOpenRouterConnect(search: string, timeoutMs = 15_000): Promise<ConnectOutcome> {
  if (inFlight?.search === search) return inFlight.outcome;
  const outcome = (async (): Promise<ConnectOutcome> => {
    const pending = takePending();
    const callback = readCallback(search, pending);
    if ("error" in callback) return callback;
    try {
      const response = await fetch(OPENROUTER_KEYS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: exchangeBody(callback.code, pending!.verifier),
        signal: AbortSignal.timeout(timeoutMs),
      });
      const body = await response.json().catch(() => null);
      return readExchangeAnswer(response.status, body);
    } catch {
      return { error: "failed" };
    }
  })();
  const entry = { search, outcome };
  inFlight = entry;
  // Settled, it answers no one: the code it traded is spent, and the key it holds
  // shouldn't sit in memory for a later visit (or another account) to pick up.
  void outcome.finally(() => {
    if (inFlight === entry) inFlight = null;
  });
  return outcome;
}
