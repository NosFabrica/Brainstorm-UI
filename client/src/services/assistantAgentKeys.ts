/**
 * The Brainstorm Assistant's AI keys, through brainstorm_server, which holds the
 * Assistant's key for the reader (the contract: `GET`/`POST /user/assistantAgentKeys`, on
 * the signed-in router, the Assistant resolved from the session only). The Assistant's
 * NIP-FA list (kind 12000) is encrypted to itself; the server re-encrypts it to the
 * reader, Assistant → reader, and takes a new one encrypted reader → Assistant. The pure
 * half is `lib/assistantKeys`.
 *
 * An edit is a read-modify-write: the GET, the change, the POST naming the `createdAt`
 * it read (`previousCreatedAt`). The server answers 409 when the list moved meanwhile,
 * and the edit reads again and retries once.
 *
 * Keys stay safe: never logged, never in a URL or a query key, never in browser storage.
 * What is decrypted lives in memory for as long as the screen shows it.
 */
import { authenticatedFetch, getBrainstormApi, jsonBody } from "@/services/api/core";
import { decodePrivateTags } from "@/lib/agentKeys";
import { encryptFor, hasExternalSigner, signingFailure } from "@/accounts/signing";
import { classifySignerError } from "@/accounts/signer-errors";
import { NoUnlockPathError } from "@/accounts/local-signer";
import type { BrainstormAccount } from "@/accounts/metadata";

const PATH = "/user/assistantAgentKeys";
const TIMEOUT_MS = 20_000;
const HEX_KEY = /^[0-9a-f]{64}$/;

/** Why the server didn't hand over (or take) the list, as the screen tells it. */
export type AssistantKeysProblem =
  /** 404 with `X-Reason: no-assistant`: the reader has no Assistant yet. */
  | { status: "no-assistant" }
  /** 404 without that reason: this server doesn't have the endpoint yet. */
  | { status: "unavailable" }
  /** 502: too few of the Assistant's relays answered (or took the write). Worth retrying. */
  | { status: "relays" }
  /** Anything else: the server's own words, never a key. */
  | { status: "error"; message: string };

export type AssistantKeysFetch =
  | {
      status: "ok";
      /** The Assistant's key, as the server resolved it from the session. */
      assistant: string;
      /** NIP-44, Assistant → reader; null when it has no list yet. */
      ciphertext: string | null;
      /** Its list's `created_at`; null when it has none. */
      createdAt: number | null;
    }
  | AssistantKeysProblem;

export type AssistantKeysWrite =
  | { status: "ok"; createdAt: number }
  /** 409: the list changed since it was read. */
  | { status: "conflict" }
  | AssistantKeysProblem;

async function problem(response: Response): Promise<AssistantKeysProblem> {
  if (response.status === 404) {
    return response.headers.get("X-Reason") === "no-assistant" ? { status: "no-assistant" } : { status: "unavailable" };
  }
  if (response.status === 502) return { status: "relays" };
  const data = await response.json().catch(() => null);
  const detail = typeof data?.detail === "string" ? data.detail : typeof data?.message === "string" ? data.message : "";
  return { status: "error", message: detail || `The server answered ${response.status}.` };
}

const failed = (err: unknown): AssistantKeysProblem => ({
  status: "error",
  message: err instanceof Error && err.message ? err.message : "Couldn't reach Brainstorm.",
});

/** The Assistant's list as the server holds it, still encrypted. */
export async function fetchAssistantKeys(): Promise<AssistantKeysFetch> {
  let response: Response;
  try {
    response = await authenticatedFetch(`${getBrainstormApi()}${PATH}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (err) {
    return failed(err);
  }
  if (!response.ok) return problem(response);
  const json = await response.json().catch(() => null);
  const data = json?.data ?? json;
  const assistant = data?.assistant;
  const ciphertext = data?.ciphertext ?? null;
  const createdAt = data?.createdAt ?? null;
  if (
    typeof assistant !== "string" ||
    !HEX_KEY.test(assistant) ||
    (ciphertext !== null && typeof ciphertext !== "string") ||
    (createdAt !== null && !Number.isSafeInteger(createdAt))
  ) {
    return { status: "error", message: "Brainstorm's answer didn't make sense." };
  }
  return { status: "ok", assistant, ciphertext: ciphertext || null, createdAt };
}

/** Hands the server the Assistant's new list, encrypted reader → Assistant. */
export async function postAssistantKeys(
  ciphertext: string,
  previousCreatedAt: number | null,
): Promise<AssistantKeysWrite> {
  let response: Response;
  try {
    response = await authenticatedFetch(`${getBrainstormApi()}${PATH}`, {
      ...jsonBody("POST", { ciphertext, previousCreatedAt }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    return failed(err);
  }
  if (response.status === 409) return { status: "conflict" };
  if (!response.ok) return problem(response);
  const json = await response.json().catch(() => null);
  const createdAt = (json?.data ?? json)?.createdAt;
  return Number.isSafeInteger(createdAt)
    ? { status: "ok", createdAt }
    : { status: "error", message: "Brainstorm's answer didn't make sense." };
}

/** What decrypting the list came to, as `services/agentKeys`' read says it. */
export type AssistantKeysRead =
  { status: "ready"; tags: string[][] } | { status: "unreadable" } | { status: "failed"; error: string };

/**
 * The list's private tags: the ciphertext opened with the reader's key, the Assistant as
 * peer. No ciphertext is an empty list. Rethrows a declined unlock.
 */
export async function decryptAssistantKeys(
  account: BrainstormAccount,
  assistant: string,
  ciphertext: string | null,
): Promise<AssistantKeysRead> {
  if (!ciphertext) return { status: "ready", tags: [] };
  if (!account.nip44) return { status: "unreadable" };
  let plain: string;
  try {
    plain = await account.nip44.decrypt(assistant, ciphertext);
  } catch (error) {
    const kind = classifySignerError(error);
    if (kind === "cancelled") throw error;
    if (error instanceof NoUnlockPathError) {
      return { status: "failed", error: "Your key couldn't be unlocked in this browser." };
    }
    if (!hasExternalSigner(account) || kind === "bad-payload") return { status: "unreadable" };
    return {
      status: "failed",
      error: signingFailure(error, "Your signer didn't decrypt your Assistant's keys.").error!,
    };
  }
  const tags = typeof plain === "string" ? decodePrivateTags(plain) : null;
  return tags ? { status: "ready", tags } : { status: "unreadable" };
}

/** What an edit came to; on success, the list as written and its `createdAt`. */
export type AssistantKeysEdit =
  | { status: "ok"; assistant: string; tags: string[][]; createdAt: number | null }
  | AssistantKeysProblem
  | { status: "conflict" }
  /** The reader dismissed the unlock: nothing to tell them. */
  | { status: "cancelled" };

/**
 * Rewrites the Assistant's list as `change(current)`: read it, decrypt it, change it,
 * encrypt the whole list to the Assistant, and POST it naming the `createdAt` read. On a
 * 409 it reads again and tries once more. Writes nothing when it can't read what is there;
 * a change that changes nothing is no write.
 */
export async function editAssistantKeys(
  account: BrainstormAccount,
  change: (tags: string[][]) => string[][],
): Promise<AssistantKeysEdit> {
  for (let attempt = 0; ; attempt++) {
    const read = await fetchAssistantKeys();
    if (read.status !== "ok") return read;
    let current: AssistantKeysRead;
    try {
      current = await decryptAssistantKeys(account, read.assistant, read.ciphertext);
    } catch {
      return { status: "cancelled" };
    }
    if (current.status === "failed") return { status: "error", message: current.error };
    if (current.status !== "ready") {
      return { status: "error", message: "Couldn't read your Assistant's keys, so nothing was changed." };
    }
    const next = change(current.tags);
    if (next === current.tags) {
      return { status: "ok", assistant: read.assistant, tags: current.tags, createdAt: read.createdAt };
    }
    let ciphertext: string | null;
    try {
      // Always the JSON, `[]` included: NIP-44 can't encrypt an empty string.
      ciphertext = await encryptFor(account, read.assistant, JSON.stringify(next));
    } catch {
      return { status: "cancelled" };
    }
    if (!ciphertext) return { status: "error", message: "Couldn't encrypt to your Assistant." };
    const wrote = await postAssistantKeys(ciphertext, read.createdAt);
    if (wrote.status === "conflict" && attempt === 0) continue;
    if (wrote.status !== "ok") return wrote;
    return { status: "ok", assistant: read.assistant, tags: next, createdAt: wrote.createdAt };
  }
}
