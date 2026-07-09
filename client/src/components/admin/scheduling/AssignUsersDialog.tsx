import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { nip19 } from "nostr-tools";
import { Search, Loader2, Plus, Check, X, ClipboardList, Users2 } from "lucide-react";
import { apiClient } from "@/services/api";
import {
  searchNostrProfiles,
  fetchProfileMap,
  type NostrSearchResult,
} from "@/services/nostr";
import { parsePubkeys } from "@/lib/schedulingPubkeys";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { UserResultRow } from "./UserResultRow";

const POLICIES_KEY = ["/api/admin/scheduling"];
const STATS_KEY = ["/api/admin/scheduling/stats"];
const USERS_KEY = ["/api/admin/users"];

type Mode = "brainstorm" | "nostr";
type Source = "brainstorm" | "nostr" | "paste";
type ProfileLite = { pubkey: string; npub: string; name?: string; picture?: string };

function encodeNpub(pubkey: string): string {
  try {
    return nip19.npubEncode(pubkey);
  } catch {
    return pubkey;
  }
}

function fromSearchResult(r: NostrSearchResult): ProfileLite {
  return {
    pubkey: r.pubkey,
    npub: r.npub || encodeNpub(r.pubkey),
    name: r.displayName || r.name,
    picture: r.picture,
  };
}

export function AssignUsersDialog({
  open,
  onOpenChange,
  policyId,
  policyName,
  onAssigned,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  policyId: number;
  policyName: string;
  onAssigned?: () => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [mode, setMode] = useState<Mode>("brainstorm");
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [results, setResults] = useState<ProfileLite[]>([]);

  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");

  // Profile cache keyed by pubkey — fed by search + paste enrichment.
  const [profiles, setProfiles] = useState<Record<string, ProfileLite>>({});
  // Staging tray: ordered pubkeys + where each came from (nostr picks are
  // onboarded before assignment).
  const [tray, setTray] = useState<string[]>([]);
  const [traySource, setTraySource] = useState<Record<string, Source>>({});

  const [assigning, setAssigning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  // Reset everything each time the dialog is opened fresh.
  useEffect(() => {
    if (open) {
      setMode("brainstorm");
      setQuery("");
      setResults([]);
      setSearchError(null);
      setPasteOpen(false);
      setPasteText("");
      setProfiles({});
      setTray([]);
      setTraySource({});
      setAssigning(false);
      setProgress(null);
    }
  }, [open]);

  const parsedPaste = useMemo(() => parsePubkeys(pasteText), [pasteText]);

  function upsertProfiles(list: ProfileLite[]) {
    setProfiles((prev) => {
      const next = { ...prev };
      for (const p of list) next[p.pubkey] = { ...next[p.pubkey], ...p };
      return next;
    });
  }

  function addToTray(pubkey: string, source: Source) {
    setTray((prev) => (prev.includes(pubkey) ? prev : [...prev, pubkey]));
    setTraySource((prev) => ({ ...prev, [pubkey]: prev[pubkey] ?? source }));
  }

  function removeFromTray(pubkey: string) {
    setTray((prev) => prev.filter((pk) => pk !== pubkey));
  }

  function toggleTray(item: ProfileLite, source: Source) {
    upsertProfiles([item]);
    if (tray.includes(item.pubkey)) removeFromTray(item.pubkey);
    else addToTray(item.pubkey, source);
  }

  async function runSearch() {
    const q = query.trim();
    if (!q || searching) return;
    setSearching(true);
    setSearchError(null);
    try {
      if (mode === "nostr") {
        const res = await searchNostrProfiles(q, { limit: 15 });
        const lite = res.map(fromSearchResult);
        upsertProfiles(lite);
        setResults(lite);
      } else {
        const page = await apiClient.getAdminUsers({ search: q, size: 20 });
        const items = (page?.items ?? []) as Array<{ pubkey: string }>;
        const base: ProfileLite[] = items.map((i) => ({
          pubkey: i.pubkey,
          npub: encodeNpub(i.pubkey),
        }));
        setResults(base);
        upsertProfiles(base);
        // Enrich names/pictures from kind-0 (best-effort).
        const map = await fetchProfileMap(base.map((b) => b.pubkey)).catch(
          () => new Map(),
        );
        const enriched = base.map((b) => {
          const c = map.get(b.pubkey);
          return c
            ? { ...b, name: c.display_name || c.name, picture: c.picture }
            : b;
        });
        upsertProfiles(enriched);
        setResults((prev) =>
          prev.map((b) => enriched.find((e) => e.pubkey === b.pubkey) || b),
        );
      }
    } catch (e) {
      setSearchError(e instanceof Error ? e.message : "Search failed");
      setResults([]);
    } finally {
      setSearching(false);
    }
  }

  function addPasted() {
    if (!parsedPaste.valid.length) return;
    const lite = parsedPaste.valid.map((pk) => ({ pubkey: pk, npub: encodeNpub(pk) }));
    upsertProfiles(lite);
    lite.forEach((l) => addToTray(l.pubkey, "paste"));
    setPasteText("");
    // Best-effort profile enrichment for the pasted pubkeys.
    fetchProfileMap(parsedPaste.valid)
      .then((map) => {
        const enriched = lite.map((l) => {
          const c = map.get(l.pubkey);
          return c
            ? { ...l, name: c.display_name || c.name, picture: c.picture }
            : l;
        });
        upsertProfiles(enriched);
      })
      .catch(() => {});
  }

  async function handleAssign() {
    if (!tray.length || assigning) return;
    setAssigning(true);
    try {
      const toOnboard = tray.filter((pk) => traySource[pk] === "nostr");
      if (toOnboard.length) {
        setProgress({ done: 0, total: toOnboard.length });
        for (let i = 0; i < toOnboard.length; i++) {
          try {
            await apiClient.getBrainstormPubkey(toOnboard[i]);
          } catch {
            /* keep going — assignPolicyUsers will report any that failed */
          }
          setProgress({ done: i + 1, total: toOnboard.length });
        }
      }
      const { assigned } = await apiClient.assignPolicyUsers(policyId, tray);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["/api/admin/scheduling", policyId, "users"],
        }),
        queryClient.invalidateQueries({ queryKey: POLICIES_KEY }),
        queryClient.invalidateQueries({ queryKey: STATS_KEY }),
        queryClient.invalidateQueries({ queryKey: USERS_KEY }),
      ]);
      toast({
        title: `Assigned ${assigned} user${assigned === 1 ? "" : "s"} to ${policyName}`,
      });
      onAssigned?.();
      onOpenChange(false);
    } catch (e) {
      toast({
        title: "Assignment failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setAssigning(false);
      setProgress(null);
    }
  }

  const assignLabel = progress
    ? `Onboarding ${progress.done}/${progress.total}…`
    : assigning
      ? "Assigning…"
      : `Assign ${tray.length} user${tray.length === 1 ? "" : "s"}`;

  return (
    <Dialog open={open} onOpenChange={(o) => !assigning && onOpenChange(o)}>
      <DialogContent className="sm:max-w-2xl" data-testid="assign-users-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users2 className="h-5 w-5 text-[#333286]" />
            Assign users to “{policyName}”
          </DialogTitle>
          <DialogDescription>
            Search by name or npub, or paste a list of pubkeys. Review your
            selection, then assign them all to this tier.
          </DialogDescription>
        </DialogHeader>

        {/* Mode toggle */}
        <div className="flex gap-1 p-1 rounded-xl bg-slate-100 border border-slate-200">
          <button
            type="button"
            onClick={() => {
              setMode("brainstorm");
              setResults([]);
              setSearchError(null);
            }}
            className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              mode === "brainstorm"
                ? "bg-white text-[#333286] shadow-sm border border-slate-200"
                : "text-slate-500 hover:text-slate-700"
            }`}
            data-testid="assign-mode-brainstorm"
          >
            In Brainstorm
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("nostr");
              setResults([]);
              setSearchError(null);
            }}
            className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              mode === "nostr"
                ? "bg-white text-[#333286] shadow-sm border border-slate-200"
                : "text-slate-500 hover:text-slate-700"
            }`}
            data-testid="assign-mode-nostr"
          >
            From Nostr
          </button>
        </div>

        {/* Search */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") runSearch();
              }}
              placeholder={
                mode === "nostr"
                  ? "Search Nostr by name…"
                  : "Search Brainstorm users by name or npub…"
              }
              className="w-full pl-8 pr-3 py-2 text-xs rounded-xl border border-slate-200 bg-white/80 focus:outline-none focus:ring-2 focus:ring-[#7c86ff]/30 focus:border-[#7c86ff]/40"
              data-testid="assign-search-input"
            />
          </div>
          <Button
            size="sm"
            onClick={runSearch}
            disabled={searching || !query.trim()}
            className="text-xs gap-1.5 shrink-0 bg-[#333286] hover:bg-[#7c86ff] text-white no-default-hover-elevate no-default-active-elevate"
          >
            {searching ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Search className="h-3.5 w-3.5" />
            )}
            Search
          </Button>
        </div>

        {searchError && <p className="text-xs text-red-500">{searchError}</p>}

        {/* Results */}
        {results.length > 0 && (
          <div className="space-y-1 max-h-52 overflow-y-auto -mx-1 px-1">
            {results.map((r) => {
              const inTray = tray.includes(r.pubkey);
              const p = profiles[r.pubkey] ?? r;
              return (
                <UserResultRow
                  key={r.pubkey}
                  pubkey={p.pubkey}
                  npub={p.npub}
                  name={p.name}
                  picture={p.picture}
                  active={inTray}
                  onClick={() => toggleTray(p, mode)}
                  trailing={
                    inTray ? (
                      <Check className="h-4 w-4 text-emerald-600" />
                    ) : (
                      <Plus className="h-4 w-4 text-slate-400" />
                    )
                  }
                />
              );
            })}
          </div>
        )}

        {/* Paste a list */}
        <div className="rounded-xl border border-slate-200 bg-slate-50/60">
          <button
            type="button"
            onClick={() => setPasteOpen((v) => !v)}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-600"
            data-testid="assign-paste-toggle"
          >
            <ClipboardList className="h-3.5 w-3.5 text-slate-400" />
            Paste a list of pubkeys
          </button>
          {pasteOpen && (
            <div className="px-3 pb-3 space-y-2">
              <Label htmlFor="assign-paste-pubkeys" className="sr-only">
                Pubkeys (hex or npub, one per line)
              </Label>
              <textarea
                id="assign-paste-pubkeys"
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder="hex or npub, one per line"
                className="h-20 w-full rounded-lg border border-slate-200 bg-white p-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-[#7c86ff]/30 focus:border-[#7c86ff]/40"
              />
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-500 tabular-nums">
                  {parsedPaste.valid.length} valid
                  {parsedPaste.invalidCount > 0 &&
                    ` · ${parsedPaste.invalidCount} invalid`}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  disabled={parsedPaste.valid.length === 0}
                  onClick={addPasted}
                >
                  Add {parsedPaste.valid.length} to list
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Staging tray */}
        <div>
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Selected · {tray.length}
          </p>
          {tray.length === 0 ? (
            <p className="text-xs text-slate-400">
              Nothing selected yet — search or paste to build your list.
            </p>
          ) : (
            <div className="space-y-1 max-h-40 overflow-y-auto -mx-1 px-1">
              {tray.map((pk) => {
                const p = profiles[pk] ?? { pubkey: pk, npub: encodeNpub(pk) };
                return (
                  <UserResultRow
                    key={pk}
                    pubkey={p.pubkey}
                    npub={p.npub}
                    name={p.name}
                    picture={p.picture}
                    subtitle={
                      traySource[pk] === "nostr" ? "New — will be onboarded" : undefined
                    }
                    trailing={
                      <button
                        type="button"
                        aria-label="Remove from selection"
                        onClick={() => removeFromTray(pk)}
                        className="p-1 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    }
                  />
                );
              })}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            disabled={assigning}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            disabled={assigning || tray.length === 0}
            onClick={handleAssign}
            className="gap-1.5 bg-[#333286] hover:bg-[#7c86ff] text-white no-default-hover-elevate no-default-active-elevate"
            data-testid="assign-confirm"
          >
            {assigning && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {assignLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
