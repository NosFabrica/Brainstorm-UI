import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiClient } from "@/services/api";
import { searchNostrProfiles, type NostrSearchResult } from "@/services/nostr";
import { parseNpubList } from "./parseNpubList";
import { resultName } from "@/lib/displayName";

export type OnboardProgress = {
  done: number;
  total: number;
  results: { pubkey: string; name: string; success: boolean; message: string }[];
};

/**
 * Lookup's Onboard mode: people found by a Nostr name search or pasted as
 * keys, queued, then sent to the backend one by one, which onboards anyone
 * new. `onStart` runs as the queue starts going out.
 */
export function useOnboardQueue({ onStart }: { onStart: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [onboardSearching, setOnboardSearching] = useState(false);
  const [onboardResults, setOnboardResults] = useState<NostrSearchResult[]>([]);
  const [onboardError, setOnboardError] = useState<string | null>(null);
  const [onboardQueue, setOnboardQueue] = useState<NostrSearchResult[]>([]);
  const [onboardingAll, setOnboardingAll] = useState(false);
  const [onboardProgress, setOnboardProgress] = useState<OnboardProgress | null>(null);

  // The name typed is the search box's own (OnboardPanel); it arrives here on Search.
  const handleOnboardSearch = useCallback(async (onboardSearch: string) => {
    const q = onboardSearch.trim();
    if (!q || q.length < 2) {
      setOnboardError("Enter at least 2 characters to search");
      return;
    }
    setOnboardSearching(true);
    setOnboardError(null);
    setOnboardResults([]);
    try {
      const results = await searchNostrProfiles(q, { limit: 10 });
      if (results.length === 0) {
        setOnboardError("No profiles found — try a different name");
      } else {
        setOnboardResults(results);
      }
    } catch {
      setOnboardError("Search failed — the search relay may be unavailable");
    } finally {
      setOnboardSearching(false);
    }
  }, []);

  const addToOnboardQueue = useCallback((profile: NostrSearchResult) => {
    setOnboardQueue((prev) => {
      if (prev.some((p) => p.pubkey === profile.pubkey)) return prev;
      return [...prev, profile];
    });
  }, []);

  const removeFromOnboardQueue = useCallback((pubkey: string) => {
    setOnboardQueue((prev) => prev.filter((p) => p.pubkey !== pubkey));
  }, []);

  /** Queues a pasted list; true when anything was added (the paste box then empties). */
  const handleBulkPasteAdd = useCallback(
    (bulkPasteInput: string): boolean => {
      const { added, errors } = parseNpubList(bulkPasteInput, onboardQueue);
      if (added.length > 0) {
        setOnboardQueue((prev) => [...prev, ...added]);
        toast({
          title: `${added.length} added to queue`,
          description: errors.length > 0 ? `${errors.length} invalid entries skipped` : undefined,
        });
        return true;
      } else if (errors.length > 0) {
        setOnboardError(
          `Could not parse: ${errors.slice(0, 3).join(", ")}${errors.length > 3 ? ` (+${errors.length - 3} more)` : ""}`,
        );
      }
      return false;
    },
    [onboardQueue, toast],
  );

  const handleOnboardAll = useCallback(async () => {
    if (onboardQueue.length === 0) return;
    setOnboardingAll(true);
    onStart();
    const total = onboardQueue.length;
    const results: OnboardProgress["results"] = [];
    setOnboardProgress({ done: 0, total, results });

    for (let i = 0; i < onboardQueue.length; i++) {
      const profile = onboardQueue[i];
      const displayName = resultName(profile) ?? profile.pubkey.slice(0, 12) + "...";
      try {
        const result = await apiClient.getBrainstormPubkey(profile.pubkey);
        const data = typeof result === "object" && result !== null ? (result as Record<string, unknown>) : {};
        const isNew = data.created === true || data.is_new === true;
        results.push({
          pubkey: profile.pubkey,
          name: displayName,
          success: true,
          message: isNew ? "Onboarded" : "Already exists",
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed";
        results.push({ pubkey: profile.pubkey, name: displayName, success: false, message: msg });
      }
      setOnboardProgress({ done: i + 1, total, results: [...results] });
    }

    const successCount = results.filter((r) => r.success).length;
    const failCount = results.filter((r) => !r.success).length;
    toast({
      title: `Onboarding complete`,
      description: `${successCount} succeeded${failCount > 0 ? `, ${failCount} failed` : ""}`,
    });
    setOnboardQueue([]);
    setOnboardingAll(false);
    void queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
  }, [onboardQueue, toast, queryClient, onStart]);

  return {
    onboardSearching,
    onboardResults,
    setOnboardResults,
    onboardError,
    setOnboardError,
    onboardQueue,
    setOnboardQueue,
    onboardingAll,
    onboardProgress,
    setOnboardProgress,
    handleOnboardSearch,
    addToOnboardQueue,
    removeFromOnboardQueue,
    handleBulkPasteAdd,
    handleOnboardAll,
  };
}

export type OnboardQueue = ReturnType<typeof useOnboardQueue>;
