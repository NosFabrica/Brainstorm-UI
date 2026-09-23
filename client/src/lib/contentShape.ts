/**
 * What an event's content IS, before a row prints it. Kind-30078 app data
 * (Ditto, Armada, Nostr Mail settings) is NIP-44 ciphertext; a row that
 * printed 300 characters of base64 as a snippet said nothing to a person.
 */
export type ContentShape = { kind: "empty" } | { kind: "encrypted" } | { kind: "json"; fields: number } | { kind: "text" };

/** One base64 run with no whitespace, long enough that no word is one. */
const BASE64_BLOB = /^[A-Za-z0-9+/]{64,}={0,2}$/;
/** NIP-04: base64 ciphertext, "?iv=", base64 iv. */
const NIP04 = /^[A-Za-z0-9+/]+={0,2}\?iv=[A-Za-z0-9+/]+={0,2}$/;

export function contentShape(content: string): ContentShape {
  const s = content.trim();
  if (!s) return { kind: "empty" };
  if (NIP04.test(s) || BASE64_BLOB.test(s)) return { kind: "encrypted" };
  if (s[0] === "{" || s[0] === "[") {
    try {
      const parsed: unknown = JSON.parse(s);
      if (parsed && typeof parsed === "object") return { kind: "json", fields: Object.keys(parsed).length };
    } catch {
      /* not JSON after all — prose that starts with a bracket */
    }
  }
  return { kind: "text" };
}
