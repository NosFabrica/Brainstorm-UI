/**
 * The relay and signer half of the user's AI agent keys (lib/agentKeys holds the
 * format). Reads fill the EventStore (docs/adr/0005); an edit is a read-modify-write
 * that asks the relays first, because it replaces the event, and refuses to write
 * when it can't tell what is there: a replaceable event overwritten from a blank
 * guess loses every key the user saved from another app.
 */
import type { NostrEvent } from "nostr-tools";
import { eventStore } from "@/lib/eventStore";
import { loadReplaceable } from "@/lib/loaders";
import { PROFILE_RELAYS } from "@/lib/relays";
import { requestNewestWithReach } from "@/lib/relayRequest";
import { outboxRelays } from "@/lib/relayRouting";
import {
  AGENT_KEYS_ALT,
  AGENT_KEYS_KIND,
  decodePrivateTags,
  modelsRequest,
  parseAgentKeys,
  readTestAnswer,
  withAgentKeys,
  type AgentKey,
  type KeyTestResult,
} from "@/lib/agentKeys";
import {
  activeAccount,
  decryptFromSelf,
  encryptToSelf,
  signAs,
  signingFailure,
  type PublishOutcome,
} from "@/accounts/signing";
import type { BrainstormAccount } from "@/accounts/metadata";
import { publishToRelays } from "@/services/nostr";

/** The user's kind 12000 into the store: the ask behind `useAgentKeys`. */
export async function loadAgentKeys(pubkey: string, timeoutMs = 6000): Promise<NostrEvent | undefined> {
  const relays = await outboxRelays(pubkey, PROFILE_RELAYS, { timeoutMs: Math.min(timeoutMs, 2500) }).catch(
    () => PROFILE_RELAYS,
  );
  const event = await loadReplaceable(AGENT_KEYS_KIND, pubkey, { relays, timeoutMs });
  return event ?? (eventStore.getReplaceable(AGENT_KEYS_KIND, pubkey) as NostrEvent | undefined);
}

/** The event's private tags, decrypted; null when this Account can't read them. */
export async function decryptAgentKeyTags(account: BrainstormAccount, event: NostrEvent): Promise<string[][] | null> {
  if (event.pubkey !== account.pubkey || !event.content) return null;
  const plain = await decryptFromSelf(account, event.content);
  return plain === null ? null : decodePrivateTags(plain);
}

/**
 * Replaces the keys with `change(current)`, keeping every private tag that isn't a
 * key and the event's public tags. Fails, writing nothing, when too few relays
 * answered to be sure there is no event, or when the newest one can't be read.
 */
export async function updateAgentKeys(change: (keys: AgentKey[]) => AgentKey[]): Promise<PublishOutcome> {
  const account = activeAccount();
  if (!account) return { success: false, error: "Not logged in" };
  try {
    const relays = await outboxRelays(account.pubkey, PROFILE_RELAYS);
    const { newest, reach } = await requestNewestWithReach(
      relays,
      { kinds: [AGENT_KEYS_KIND], authors: [account.pubkey], limit: 1 },
      6000,
    );
    let privateTags: string[][] = [];
    if (newest) {
      const read = await decryptAgentKeyTags(account, newest);
      if (!read) return { success: false, error: "Couldn't read the keys you saved before, so nothing was changed." };
      privateTags = read;
    } else if (reach.answered.length * 2 <= reach.asked.length) {
      return { success: false, error: "Too few of your relays answered to be sure. Nothing was changed; try again." };
    }

    const next = withAgentKeys(privateTags, change(parseAgentKeys(privateTags)));
    // Always the JSON, `[]` included: NIP-44 can't encrypt an empty string.
    const ciphertext = await encryptToSelf(account, JSON.stringify(next));
    if (!ciphertext) return { success: false, error: "Could not encrypt" };

    const publicTags = newest?.tags.filter((t) => t[0] !== "alt") ?? [];
    const now = Math.floor(Date.now() / 1000);
    const signed = await signAs(account, {
      kind: AGENT_KEYS_KIND,
      tags: [["alt", AGENT_KEYS_ALT], ...publicTags],
      content: ciphertext,
      // Past the copy we read, so relays keep this one even when this clock lags.
      created_at: newest ? Math.max(now, newest.created_at + 1) : now,
    });
    return await publishToRelays(signed);
  } catch (err) {
    return signingFailure(err, "Failed to sign");
  }
}

/**
 * Asks the provider for its model list with this key, from this page. A thrown
 * fetch is a host that is down, wrong, or that doesn't let web pages call it.
 */
export async function testAgentKey(entry: AgentKey, timeoutMs = 10_000): Promise<KeyTestResult> {
  const { url, headers } = modelsRequest(entry);
  try {
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
    const body = await response.json().catch(() => null);
    return readTestAnswer(response.status, body);
  } catch {
    return { status: "unreachable" };
  }
}
