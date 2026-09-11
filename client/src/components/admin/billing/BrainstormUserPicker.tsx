import { useEffect, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { tone } from "@/lib/tones";
import { npubFromPubkey } from "@/lib/shareId";
import { UserResultRow } from "@/components/admin/scheduling/UserResultRow";
import { searchBrainstormUsers, type BrainstormUser, type UserSearchOutcome } from "./brainstormUserSearch";

/**
 * Pick one Brainstorm user by name, npub or hex — the same search the other
 * admin sections offer, narrowed to people who actually have an account.
 *
 * Choosing is not acting: the picker only reports who was chosen, and the
 * dialog around it still asks for the verb. A pasted key that resolves to an
 * account selects itself, since there is nothing to choose between; a name
 * shows its matches and waits.
 */
export function BrainstormUserPicker({
  value,
  onChange,
  inputTestId = "input-billing-attribute-pubkey",
  resultTestIdPrefix = "billing-attribute-result-",
}: {
  value: BrainstormUser | null;
  onChange: (user: BrainstormUser | null) => void;
  inputTestId?: string;
  resultTestIdPrefix?: string;
}) {
  const [query, setQuery] = useState("");
  const [outcome, setOutcome] = useState<UserSearchOutcome>({ kind: "idle" });
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setOutcome({ kind: "idle" });
      setSearching(false);
      setError(null);
      return;
    }
    let cancelled = false;
    setSearching(true);
    setError(null);
    const timer = setTimeout(async () => {
      try {
        const out = await searchBrainstormUsers(q);
        if (cancelled) return;
        setOutcome(out);
        // One key, one account: nothing to choose between.
        if (out.kind === "results" && out.exact && out.users[0]) onChange(out.users[0]);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Search failed");
        setOutcome({ kind: "idle" });
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // onChange is stable enough for this: re-running on its identity would
    // re-fire a search on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  if (value) {
    return (
      <div className="mt-3 space-y-2 text-left" data-testid="billing-attribute-picked">
        <UserResultRow
          pubkey={value.pubkey}
          npub={npubFromPubkey(value.pubkey)}
          name={value.name}
          picture={value.picture}
          active
          trailing={
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => {
                onChange(null);
                setQuery("");
                setOutcome({ kind: "idle" });
              }}
              data-testid="billing-attribute-change"
            >
              Change
            </Button>
          }
        />
      </div>
    );
  }

  const results = outcome.kind === "results" ? outcome.users : [];
  const dropped = outcome.kind === "results" ? outcome.withoutAccount : 0;
  const noMatch = outcome.kind === "results" && !outcome.exact && results.length === 0;

  return (
    // The dialog header centers its text on phones; a list of people reads left-aligned.
    <div className="mt-3 space-y-2 text-left">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search Brainstorm users by name, or paste an npub"
          className="pl-8 text-xs"
          autoComplete="off"
          data-testid={inputTestId}
        />
        {searching && (
          <Loader2 className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-slate-400" />
        )}
      </div>

      {error && (
        <p className={`text-[11px] ${tone("danger").text}`} data-testid="billing-attribute-search-error">
          {error}
        </p>
      )}
      {outcome.kind === "invalid-key" && (
        <p className={`text-[11px] ${tone("danger").text}`} data-testid="billing-attribute-key-invalid">
          That isn't a key we can read. Paste an npub or a 64-character hex pubkey, or search by name.
        </p>
      )}
      {outcome.kind === "no-account" && (
        <p className={`text-[11px] ${tone("warning").text}`} data-testid="billing-attribute-no-account">
          No Brainstorm account has that key. Only someone with an account can be granted a plan.
        </p>
      )}
      {noMatch && (
        <p className="text-[11px] text-slate-500 dark:text-slate-400" data-testid="billing-attribute-no-match">
          Nobody on Brainstorm matches "{query.trim()}".
          {dropped > 0 ? ` ${dropped} ${dropped === 1 ? "profile" : "profiles"} on Nostr matched but ${dropped === 1 ? "has" : "have"} no Brainstorm account.` : ""}
        </p>
      )}

      {results.length > 0 && (
        <div className="space-y-1 max-h-52 overflow-y-auto -mx-1 px-1">
          {results.map((u) => (
            <UserResultRow
              key={u.pubkey}
              pubkey={u.pubkey}
              npub={npubFromPubkey(u.pubkey)}
              name={u.name}
              picture={u.picture}
              onClick={() => onChange(u)}
              testId={`${resultTestIdPrefix}${u.pubkey.slice(0, 8)}`}
            />
          ))}
          {dropped > 0 && (
            <p className="px-1 pt-1 text-[11px] text-slate-500 dark:text-slate-400" data-testid="billing-attribute-dropped">
              {dropped} more on Nostr {dropped === 1 ? "matches" : "match"} without a Brainstorm account — not offered.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
