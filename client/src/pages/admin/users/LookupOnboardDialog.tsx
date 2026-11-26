import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiClient } from "@/services/api";
import { useQueryClient } from "@tanstack/react-query";
import { Search, XCircle, UserPlus, ArrowRight, User } from "lucide-react";
import { nip19 } from "nostr-tools";
import { useState, useCallback } from "react";
import { LookupQueryInput } from "@/components/admin/users/LookupQueryInput";
import { type ProfileBits } from "@/components/admin/users/matchUsersByName";
import { useUserLookup } from "@/components/admin/users/useUserLookup";
import { OnboardPanel } from "./OnboardPanel";
import { useOnboardQueue } from "./useOnboardQueue";

/**
 * The Users tab's Lookup / Onboard button and dialog: find a user by name,
 * pubkey or npub and jump to their row, or find people on Nostr and onboard
 * them. What is typed and found here is the dialog's own; the button starts it
 * afresh.
 */
export function LookupOnboardDialog({
  open: lookupOpen,
  setOpen: setLookupOpen,
  users,
  usersComplete,
  profiles,
  jumpToUser,
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
  /** Every user once loaded, else the page on screen: a name is matched against these. */
  users: readonly { pubkey: string }[];
  usersComplete: boolean;
  profiles: ReadonlyMap<string, ProfileBits>;
  jumpToUser: (pubkey: string, displayName?: string) => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [lookupMode, setLookupMode] = useState<"lookup" | "onboard">("lookup");
  const [onboardSearch, setOnboardSearch] = useState("");
  const [bulkPasteOpen, setBulkPasteOpen] = useState(false);
  const [bulkPasteInput, setBulkPasteInput] = useState("");

  // A key goes to the backend, which onboards it if it is new.
  const resolveLookupPubkey = useCallback(
    async (hexPubkey: string) => {
      const result = await apiClient.getBrainstormPubkey(hexPubkey);
      const data = typeof result === "object" && result !== null ? (result as Record<string, unknown>) : {};
      const isNew = data.created === true || data.is_new === true;
      if (isNew) {
        await queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
        toast({ title: "User Onboarded", description: "New user created — jumping to their row" });
      }
      return typeof data.pubkey === "string"
        ? data.pubkey
        : typeof data.brainstorm_pubkey === "string"
          ? data.brainstorm_pubkey
          : hexPubkey;
    },
    [queryClient, toast],
  );
  const onLookupFailed = useCallback(
    (message: string) => toast({ title: "Lookup Failed", description: message, variant: "destructive" }),
    [toast],
  );
  // A name is matched against every user, so the whole directory is read while
  // Lookup is open (needsAllUsers); until it lands, the page on screen stands in.
  const {
    lookup: handleLookup,
    nameResults: lookupNameResults,
    error: lookupError,
    setError: setLookupError,
    running: lookupRunning,
    reset: resetLookup,
  } = useUserLookup({
    users,
    usersComplete,
    profiles,
    resolvePubkey: resolveLookupPubkey,
    jumpToUser,
    onFailed: onLookupFailed,
  });
  const onboard = useOnboardQueue({ onStart: () => setLookupError(null) });
  const { setOnboardResults, setOnboardError, setOnboardQueue, onboardingAll, setOnboardProgress } = onboard;

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          setLookupOpen(true);
          setLookupMode("lookup");
          setLookupError(null);
          resetLookup();
          setOnboardSearch("");
          setOnboardResults([]);
          setOnboardError(null);
          setOnboardQueue([]);
          setBulkPasteOpen(false);
          setBulkPasteInput("");
          setOnboardProgress(null);
        }}
        className="no-default-hover-elevate no-default-active-elevate h-8 gap-1.5 text-xs"
        data-testid="button-lookup-pubkey"
      >
        <Search className="h-3.5 w-3.5" />
        Lookup / Onboard
      </Button>

      <Dialog
        open={lookupOpen}
        onOpenChange={(open) => {
          if (onboardingAll) return;
          setLookupOpen(open);
          if (!open) {
            setLookupError(null);
            setOnboardResults([]);
            setOnboardError(null);
            setOnboardProgress(null);
          }
        }}
      >
        <DialogContent className="max-w-[calc(100vw-2rem)] overflow-hidden sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {lookupMode === "lookup" ? (
                <Search className="h-5 w-5 text-brand-deep" />
              ) : (
                <UserPlus className="h-5 w-5 text-brand-deep" />
              )}
              {lookupMode === "lookup" ? "Lookup User" : "Onboard User"}
            </DialogTitle>
            <DialogDescription className="pt-1 text-sm text-slate-600 dark:text-slate-300">
              {lookupMode === "lookup"
                ? "Find a user by name, pubkey, or npub and jump to their row in the table."
                : "Search Nostr by name to find and onboard a user into Brainstorm."}
            </DialogDescription>
          </DialogHeader>

          <div
            className="flex gap-1 rounded-xl border border-slate-200 bg-slate-100 p-1 dark:border-slate-800 dark:bg-slate-800"
            data-testid="toggle-lookup-mode"
          >
            <button
              onClick={() => {
                setLookupMode("lookup");
                setLookupError(null);
                resetLookup();
              }}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${lookupMode === "lookup" ? "border border-slate-200 bg-white text-brand-deep shadow-sm dark:border-slate-800 dark:bg-slate-900" : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"}`}
              data-testid="button-mode-lookup"
            >
              <Search className="h-3 w-3" />
              Lookup
            </button>
            <button
              onClick={() => {
                setLookupMode("onboard");
                setLookupError(null);
              }}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${lookupMode === "onboard" ? "border border-slate-200 bg-white text-brand-deep shadow-sm dark:border-slate-800 dark:bg-slate-900" : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"}`}
              data-testid="button-mode-onboard"
            >
              <UserPlus className="h-3 w-3" />
              Onboard
            </button>
          </div>

          {lookupMode === "lookup" ? (
            <div className="space-y-3 overflow-hidden pt-1">
              <LookupQueryInput
                running={lookupRunning}
                onSubmit={(text) => void handleLookup(text)}
                onEdit={resetLookup}
              />

              {lookupNameResults.length > 0 && (
                <div className="space-y-1" data-testid="lookup-name-results">
                  <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    {lookupNameResults.length} user{lookupNameResults.length !== 1 ? "s" : ""} found
                  </p>
                  <div className="-mx-1 max-h-[200px] space-y-1 overflow-y-auto px-1">
                    {lookupNameResults.map((u) => {
                      const npub = nip19.npubEncode(u.pubkey);
                      return (
                        <div
                          key={u.pubkey}
                          className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-slate-200 bg-white/80 p-2 transition-all hover:border-brand-accent/30 hover:bg-brand-primary/10 dark:border-slate-800 dark:bg-slate-900/80"
                          onClick={() => jumpToUser(u.pubkey, u.name)}
                          data-testid={`lookup-name-result-${u.pubkey.slice(0, 8)}`}
                        >
                          {u.picture ? (
                            <img
                              src={u.picture}
                              alt=""
                              className="h-7 w-7 shrink-0 rounded-full border border-slate-200 object-cover dark:border-slate-800"
                            />
                          ) : (
                            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-accent/20 to-brand-deep/20">
                              <User className="h-3.5 w-3.5 text-brand-deep/60" />
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-semibold text-slate-800 dark:text-slate-200">
                              {u.name || "Unknown"}
                            </p>
                            <p className="truncate font-mono text-[11px] text-slate-400 dark:text-slate-500">
                              {npub.slice(0, 20)}...{npub.slice(-6)}
                            </p>
                          </div>
                          <ArrowRight className="h-3 w-3 shrink-0 text-slate-400 dark:text-slate-500" />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <OnboardPanel
              onboard={onboard}
              onboardSearch={onboardSearch}
              setOnboardSearch={setOnboardSearch}
              bulkPasteOpen={bulkPasteOpen}
              setBulkPasteOpen={setBulkPasteOpen}
              bulkPasteInput={bulkPasteInput}
              setBulkPasteInput={setBulkPasteInput}
            />
          )}

          {lookupError && lookupMode === "lookup" && (
            <div
              className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 dark:border-red-500/25 dark:bg-red-500/10"
              data-testid="lookup-error"
            >
              <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
              <p className="text-xs text-red-700 dark:text-red-300">{lookupError}</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
