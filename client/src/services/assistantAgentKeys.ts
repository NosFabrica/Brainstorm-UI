/**
 * The Brainstorm Assistant's AI keys, through brainstorm_server, which holds the
 * Assistant's key for the reader (the contract: `GET`/`POST /user/assistantAgentKeys`, on
 * the signed-in router, the Assistant resolved from the session only). The Assistant's
 * NIP-FA list (kind 12000) is encrypted to itself; the server re-encrypts it to the
 * reader, Assistant → reader, and takes a new one encrypted reader → Assistant. The pure
 * half is `lib/assistantKeys`.
 *
 * An edit is a read-modify-write: the GET, the change, the POST naming the version it read
 * (`previousId`, the GET's `id`, and `previousCreatedAt`; both null when there was none).
 * The server answers 409 when the list moved meanwhile, or while another edit holds its
 * lock, and the edit reads again and retries once; 503 when its lock store is down, which
 * the screen offers to retry. A POST answers the new `id` and `createdAt`: the next edit
 * builds on them when the GET still has the older version.
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
  /** 503: the server couldn't take its edit lock just now. Worth retrying. */
  | { status: "busy" }
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
      /** Its list's event id; null when it has none. */
      id: string | null;
    }
  | AssistantKeysProblem;

export type AssistantKeysWrite =
  | { status: "ok"; createdAt: number; id: string }
  /** 409: the list changed since it was read, or another edit holds the lock. */
  | { status: "conflict" }
  | AssistantKeysProblem;

/** A version of the Assistant's list: what an edit names as the one it changed. Both null: none yet. */
export interface ListVersion {
  id: string | null;
  createdAt: number | null;
}

async function problem(response: Response): Promise<AssistantKeysProblem> {
  if (response.status === 404) {
    return response.headers.get("X-Reason") === "no-assistant" ? { status: "no-assistant" } : { status: "unavailable" };
  }
  if (response.status === 502) return { status: "relays" };
  if (response.status === 503) return { status: "busy" };
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
  const id = data?.id ?? null;
  if (
    typeof assistant !== "string" ||
    !HEX_KEY.test(assistant) ||
    (ciphertext !== null && typeof ciphertext !== "string") ||
    (createdAt !== null && !Number.isSafeInteger(createdAt)) ||
    (id !== null && (typeof id !== "string" || !HEX_KEY.test(id)))
  ) {
    return { status: "error", message: "Brainstorm's answer didn't make sense." };
  }
  return { status: "ok", assistant, ciphertext: ciphertext || null, createdAt, id };
}

/**
 * Hands the server the Assistant's new list, encrypted reader → Assistant, naming the
 * version it was built on (`previous`: the GET's `id` and `createdAt`, both null for none).
 */
export async function postAssistantKeys(ciphertext: string, previous: ListVersion): Promise<AssistantKeysWrite> {
  let response: Response;
  try {
    response = await authenticatedFetch(`${getBrainstormApi()}${PATH}`, {
      ...jsonBody("POST", { ciphertext, previousId: previous.id, previousCreatedAt: previous.createdAt }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    return failed(err);
  }
  if (response.status === 409) return { status: "conflict" };
  if (!response.ok) return problem(response);
  const json = await response.json().catch(() => null);
  const data = json?.data ?? json;
  const createdAt = data?.createdAt;
  const id = data?.id;
  return Number.isSafeInteger(createdAt) && typeof id === "string" && HEX_KEY.test(id)
    ? { status: "ok", createdAt, id }
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

/** A list this session already holds in the clear: the last one it read or wrote. */
export type KnownList = { assistant: string; tags: string[][] } & ListVersion;

/** What an edit came to; on success, the list as written and its version. */
export type AssistantKeysEdit =
  | ({ status: "ok"; assistant: string; tags: string[][] } & ListVersion)
  | AssistantKeysProblem
  | { status: "conflict" }
  /** The reader dismissed the unlock: nothing to tell them. */
  | { status: "cancelled" };

/**
 * Rewrites the Assistant's list as `change(current)`: read it, decrypt it, change it,
 * encrypt the whole list to the Assistant, and POST it naming the version read. On a 409
 * (it moved, or another edit holds the lock) it reads again and tries once more. Writes
 * nothing when it can't read what is there; a change that changes nothing is no write.
 *
 * `known` is the list this session last wrote (or read): when the GET answers with an
 * older version (a relay that hasn't the write yet), the edit builds on `known` and names
 * it, rather than undoing it.
 */
export async function editAssistantKeys(
  account: BrainstormAccount,
  change: (tags: string[][]) => string[][],
  known?: KnownList,
): Promise<AssistantKeysEdit> {
  for (let attempt = 0; ; attempt++) {
    const read = await fetchAssistantKeys();
    if (read.status !== "ok") return read;
    const newer =
      known &&
      known.assistant === read.assistant &&
      known.id !== null &&
      known.createdAt !== null &&
      (read.createdAt === null || known.createdAt > read.createdAt)
        ? known
        : null;
    let current: AssistantKeysRead;
    let version: ListVersion;
    if (newer) {
      current = { status: "ready", tags: newer.tags };
      version = { id: newer.id, createdAt: newer.createdAt };
    } else {
      try {
        current = await decryptAssistantKeys(account, read.assistant, read.ciphertext);
      } catch {
        return { status: "cancelled" };
      }
      // Both or neither: a version is named by its id and its time together.
      version = read.id !== null && read.createdAt !== null ? { id: read.id, createdAt: read.createdAt } : NO_VERSION;
    }
    if (current.status === "failed") return { status: "error", message: current.error };
    if (current.status !== "ready") {
      return { status: "error", message: "Couldn't read your Assistant's keys, so nothing was changed." };
    }
    const next = change(current.tags);
    if (next === current.tags) {
      return { status: "ok", assistant: read.assistant, tags: current.tags, ...version };
    }
    let ciphertext: string | null;
    try {
      // Always the JSON, `[]` included: NIP-44 can't encrypt an empty string.
      ciphertext = await encryptFor(account, read.assistant, JSON.stringify(next));
    } catch {
      return { status: "cancelled" };
    }
    if (!ciphertext) return { status: "error", message: "Couldn't encrypt to your Assistant." };
    const wrote = await postAssistantKeys(ciphertext, version);
    if (wrote.status === "conflict" && attempt === 0) {
      // Read again, from the server: what this session knew is what was refused.
      known = undefined;
      continue;
    }
    if (wrote.status !== "ok") return wrote;
    return { status: "ok", assistant: read.assistant, tags: next, createdAt: wrote.createdAt, id: wrote.id };
  }
}

const NO_VERSION: ListVersion = { id: null, createdAt: null };
