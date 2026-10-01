/**
 * Blossom uploads (BUD-02), signed by the Active Account — profile pictures
 * (components/ImageUpload) and private-message attachments, which are
 * encrypted before they get here (lib/dm/fileCrypto).
 */
import { activeAccount, signAs } from "@/accounts/signing";

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

/** Upload a blob; resolves to its URL. `description` is the auth event's human-readable line. */
export async function uploadToBlossom(blob: Blob, description = "Upload image"): Promise<string> {
  const hash = await sha256Hex(blob);
  const auth = await nostrAuthHeader({
    kind: 24242,
    tags: [
      ["t", "upload"],
      ["x", hash],
      ["expiration", String(Math.floor(Date.now() / 1000) + 600)],
    ],
    content: description,
  });

  const response = await fetch(`${BLOSSOM_SERVER}/upload`, {
    method: "PUT",
    headers: { Authorization: auth, "Content-Type": blob.type || "application/octet-stream" },
    body: blob,
  });
  if (response.ok) {
    const data = await response.json();
    if (data?.url) return data.url as string;
  }
  throw new Error("blossom failed");
}
