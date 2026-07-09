import { npubToHex } from "./suggestedAccounts";

const HEX64 = /^[0-9a-f]{64}$/i;

export interface ParsedPubkeys {
  valid: string[];
  invalidCount: number;
}

/**
 * Parse a free-text blob of pubkeys (hex and/or npub, separated by whitespace
 * or commas) into deduped lowercase hex. Blank tokens are ignored; anything
 * that isn't 64-char hex or a decodable npub is counted as invalid.
 */
export function parsePubkeys(input: string): ParsedPubkeys {
  const tokens = input.split(/[\s,]+/).filter(Boolean);
  const seen = new Set<string>();
  const valid: string[] = [];
  let invalidCount = 0;

  for (const token of tokens) {
    let hex = "";
    if (HEX64.test(token)) hex = token.toLowerCase();
    else if (token.startsWith("npub")) hex = npubToHex(token);

    if (!hex) {
      invalidCount += 1;
      continue;
    }
    if (!seen.has(hex)) {
      seen.add(hex);
      valid.push(hex);
    }
  }

  return { valid, invalidCount };
}
