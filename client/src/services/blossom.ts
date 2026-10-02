/**
 * Blossom uploads (BUD-02), signed by the Active Account — profile pictures
 * (components/ImageUpload) and private-message attachments, which are
 * encrypted before they get here (lib/dm/fileCrypto).
 */
import type { NostrEvent } from "nostr-tools";
import { accountManager } from "@/accounts";
import { activeAccount, signAs, signingFailure, type PublishOutcome } from "@/accounts/signing";
import { eventStore } from "@/lib/eventStore";
import { BLOSSOM_SERVER_LIST_KIND, blossomServerTags } from "@/lib/blossomServers";
import { publishToRelays } from "@/services/nostr";

export async function nostrAuthHeader(template: { kind: number; tags: string[][]; content: string }): Promise<string> {
  const account = activeAccount();
  if (!account) throw new Error("Sign in to upload a file.");
  const signed = await signAs(account, template);
  return `Nostr ${btoa(JSON.stringify(signed))}`;
}

export async function sha256Hex(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export const BLOSSOM_SERVER = "https://blossom.primal.net";

/**
 * Upload a blob; resolves to its URL. `description` is the auth event's human-readable
 * line. Each server in `servers` is tried in turn until one takes it.
 */
export async function uploadToBlossom(
  blob: Blob,
  description = "Upload image",
  servers: string[] = [BLOSSOM_SERVER],
): Promise<string> {
  const hash = await sha256Hex(blob);
  // One signature serves every server: BUD-02 auth names the blob, not the server.
  const auth = await nostrAuthHeader({
    kind: 24242,
    tags: [
      ["t", "upload"],
      ["x", hash],
      ["expiration", String(Math.floor(Date.now() / 1000) + 600)],
    ],
    content: description,
  });
  for (const server of servers) {
    try {
      const response = await fetch(`${server}/upload`, {
        method: "PUT",
        headers: { Authorization: auth, "Content-Type": blob.type || "application/octet-stream" },
        body: blob,
      });
      if (!response.ok) continue;
      const data = await response.json();
      if (data?.url) return data.url as string;
    } catch {
      // Unreachable or not JSON: the next server.
    }
  }
  throw new Error("blossom failed");
}

/** Publish the account's Blossom server list (BUD-03, kind 10063) to its outbox relays. */
export async function publishBlossomServers(servers: string[]): Promise<PublishOutcome> {
  const account = accountManager.active;
  if (!account) return { success: false, error: "Sign in first." };
  let signed: NostrEvent;
  try {
    signed = await signAs(account, { kind: BLOSSOM_SERVER_LIST_KIND, tags: blossomServerTags(servers), content: "" });
  } catch (error) {
    return signingFailure(error);
  }
  eventStore.add(signed);
  return publishToRelays(signed, [], { need: 1, timeoutMs: 8000 });
}
