import { useCallback, useState } from "react";
import { nip19 } from "nostr-tools";
import { matchUsersByName, type NameMatch, type ProfileBits } from "./matchUsersByName";

/**
 * The Users tab's Lookup: a name is matched against every user (`users` is the
 * whole directory, not the page on screen), a key goes to the backend, which
 * onboards it if it is new.
 */
export function useUserLookup({
  users,
  usersComplete,
  profiles,
  resolvePubkey,
  jumpToUser,
  onFailed,
}: {
  users: readonly { pubkey: string }[];
  /** False while the directory is still loading: a miss then is not yet a "no". */
  usersComplete: boolean;
  profiles: ReadonlyMap<string, ProfileBits>;
  resolvePubkey: (hex: string) => Promise<string>;
  jumpToUser: (pubkey: string, displayName?: string) => void;
  /** A key lookup that failed, for a toast. */
  onFailed?: (message: string) => void;
}) {
  const [nameResults, setNameResults] = useState<NameMatch[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const reset = useCallback(() => {
    setNameResults((prev) => (prev.length ? [] : prev));
    setError(null);
  }, []);

  const lookup = useCallback(
    async (input: string) => {
      const raw = input.trim();
      if (!raw) {
        setError("Please enter a name, pubkey, or npub");
        return;
      }
      setNameResults([]);
      setError(null);

      let hexPubkey: string | null = null;
      if (raw.startsWith("npub")) {
        try {
          const decoded = nip19.decode(raw);
          if (decoded.type === "npub") hexPubkey = decoded.data;
        } catch {}
      } else if (/^[0-9a-fA-F]{64}$/.test(raw)) {
        hexPubkey = raw.toLowerCase();
      }

      if (!hexPubkey) {
        const matches = matchUsersByName(users, profiles, raw, { pubkeys: true });
        if (matches.length === 1) jumpToUser(matches[0].pubkey, matches[0].name);
        else if (matches.length > 1) setNameResults(matches);
        else if (!usersComplete) setError("Still loading every user's name. Try again in a moment.");
        else setError(`No users found matching "${raw}" in your database`);
        return;
      }

      setRunning(true);
      try {
        jumpToUser(await resolvePubkey(hexPubkey));
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unknown error";
        setError(message);
        onFailed?.(message);
      } finally {
        setRunning(false);
      }
    },
    [users, usersComplete, profiles, resolvePubkey, jumpToUser, onFailed],
  );

  return { lookup, nameResults, error, setError, running, reset };
}
