/**
 * The reader's AI keys beside their Brainstorm Assistant's (quartz
 * `plans/2026-11-11-observer-site.md`, "The Assistant as runner": its keys). The Assistant
 * prints the reader's Observer with its own NIP-FA list (kind 12000, signed by the
 * Assistant, encrypted to itself), never the reader's: the reader gives it a key ("Give to
 * Assistant") and takes one back ("Take back"), through brainstorm_server, which holds the
 * Assistant's key (`services/assistantAgentKeys`).
 *
 * Pure: matching the two lists, their labels, and the read-modify-write of the
 * Assistant's tag list. Only a provider and the key's last four characters ever reach the
 * screen; never log a key.
 */
import { addKey, apiRoot, parseAgentKeys, providerName, withAgentKeys, type AgentKey } from "@/lib/agentKeys";

/** Who holds a key: both of them, only the reader, only their Assistant. */
export type KeyHolder = "both" | "mine" | "assistant";

export const HOLDER_LABELS: Record<KeyHolder, string> = {
  both: "Yours and your Assistant's",
  mine: "Only yours",
  assistant: "Only your Assistant's",
};

export interface HeldKey {
  key: AgentKey;
  holder: KeyHolder;
}

/** One key, wherever it is kept: the same endpoint (as an API root) and the same key. */
export function sameKey(a: AgentKey, b: AgentKey): boolean {
  return a.key === b.key && apiRoot(a.url.trim()) === apiRoot(b.url.trim());
}

/**
 * Every key either of them holds, once, labelled by who holds it: the reader's in their
 * order, then the ones only the Assistant holds, in its order.
 */
export function compareKeys(mine: readonly AgentKey[], theirs: readonly AgentKey[]): HeldKey[] {
  const out: HeldKey[] = [];
  for (const key of mine) {
    if (out.some((h) => sameKey(h.key, key))) continue;
    out.push({ key, holder: theirs.some((t) => sameKey(t, key)) ? "both" : "mine" });
  }
  for (const key of theirs) {
    if (out.some((h) => sameKey(h.key, key))) continue;
    out.push({ key, holder: "assistant" });
  }
  return out;
}

/** The key's last four characters: all of a key the screen shows. Empty for a key-less endpoint. */
export function keySuffix(key: AgentKey): string {
  return key.key ? key.key.slice(-4) : "";
}

/** `OpenRouter ····a3f9` (or `Ollama · no key`): a key as this screen names it. */
export function keyName(key: AgentKey): string {
  const provider = providerName(key.url);
  return key.key ? `${provider} ····${keySuffix(key)}` : `${provider} · no key`;
}

/**
 * The Assistant's private tags with `key` given to it: added at the end of its keys (the
 * first is the one it prints with when the schedule names none), nothing else changed.
 * The same tags when it already holds it.
 */
export function withKeyGiven(tags: string[][], key: AgentKey): string[][] {
  const keys = parseAgentKeys(tags);
  if (keys.some((k) => sameKey(k, key))) return tags;
  return withAgentKeys(tags, addKey(keys, { key: key.key, url: apiRoot(key.url.trim()) }));
}

/** The Assistant's private tags without `key`; every other tag kept. The same tags when it didn't hold it. */
export function withKeyTaken(tags: string[][], key: AgentKey): string[][] {
  const keys = parseAgentKeys(tags);
  if (!keys.some((k) => sameKey(k, key))) return tags;
  return withAgentKeys(
    tags,
    keys.filter((k) => !sameKey(k, key)),
  );
}

/** The reader's keys with `key` copied in, at the end; the same list when they hold it already. */
export function withKeyCopied(keys: AgentKey[], key: AgentKey): AgentKey[] {
  return keys.some((k) => sameKey(k, key)) ? keys : addKey(keys, { key: key.key, url: apiRoot(key.url.trim()) });
}

/** The reader's keys without `key`. */
export function withKeyRemoved(keys: AgentKey[], key: AgentKey): AgentKey[] {
  return keys.filter((k) => !sameKey(k, key));
}
