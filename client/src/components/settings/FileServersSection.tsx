/**
 * The account's Blossom servers (BUD-03, kind 10063), edited beside its inbox
 * relays: private-message attachments are uploaded there first.
 */
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { HardDrive, Loader2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { ENCRYPTED_BLOSSOM_SERVERS, loadBlossomServers, normalizeServer } from "@/lib/blossomServers";
import { publishBlossomServers } from "@/services/blossom";

const host = (url: string) => url.replace(/^https?:\/\//, "");

export function FileServersSection({ pubkey }: { pubkey: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const current = useQuery({
    queryKey: ["blossom-servers", pubkey],
    queryFn: () => loadBlossomServers(pubkey),
    enabled: !!pubkey,
    staleTime: 5 * 60_000,
  });
  const [draft, setDraft] = useState<string[] | null>(null);
  const [adding, setAdding] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const servers = draft ?? current.data?.servers ?? [];
  const dirty = draft !== null;
  useEffect(() => setDraft(null), [pubkey]);

  const add = () => {
    const url = normalizeServer(adding);
    if (!url) {
      setAddError("That isn't a server address (https://…).");
      return;
    }
    setAddError(null);
    setDraft(servers.includes(url) ? servers : [...servers, url]);
    setAdding("");
  };

  const publish = async () => {
    setBusy(true);
    const outcome = await publishBlossomServers(servers);
    setBusy(false);
    if (outcome.cancelled) return;
    if (outcome.success) {
      setDraft(null);
      void queryClient.invalidateQueries({ queryKey: ["blossom-servers", pubkey] });
      toast({ title: "File servers published" });
    } else {
      toast({ title: "Couldn't publish your file servers", description: outcome.error, variant: "destructive" });
    }
  };

  return (
    <section className="flex flex-col gap-3" data-testid="section-file-servers">
      <div>
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">File servers</h3>
        <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
          Where files you send are uploaded, encrypted, first one first. Many servers refuse encrypted files; if all of
          yours do, Brainstorm uses {ENCRYPTED_BLOSSOM_SERVERS.map(host).join(" or ")}. Published as your kind 10063
          list.
        </p>
      </div>
      {current.isPending ? (
        <span className="flex items-center gap-2 text-xs text-slate-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Looking up your list…
        </span>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-xl border border-border">
          {servers.length === 0 && (
            <li className="px-3 py-2.5 text-xs text-slate-500">
              None yet — files go to {ENCRYPTED_BLOSSOM_SERVERS.map(host).join(" or ")}.
            </li>
          )}
          {servers.map((url) => (
            <li key={url} className="flex items-center gap-2.5 px-3 py-2">
              <HardDrive className="h-3.5 w-3.5 shrink-0 text-slate-500" />
              <span className="min-w-0 flex-1 truncate font-mono text-xs">{host(url)}</span>
              <button
                type="button"
                onClick={() => setDraft(servers.filter((s) => s !== url))}
                aria-label={`Remove ${host(url)}`}
                className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <Input
          value={adding}
          onChange={(e) => setAdding(e.target.value)}
          placeholder="https://"
          aria-label="File server address"
          className="font-mono text-xs"
        />
        <Button type="submit" variant="outline" disabled={!adding.trim()}>
          <Plus className="mr-1 h-4 w-4" /> Add
        </Button>
      </form>
      {addError && <p className="text-xs text-red-600 dark:text-red-400">{addError}</p>}
      {!servers.length && !dirty && !current.isPending && (
        <button
          type="button"
          onClick={() => setDraft(ENCRYPTED_BLOSSOM_SERVERS)}
          className="self-start text-xs font-semibold text-brand-link hover:underline"
          data-testid="button-suggest-file-servers"
        >
          Use suggested servers
        </button>
      )}
      <div className="flex items-center gap-3">
        {dirty && <span className="text-xs text-slate-500">Unsaved changes</span>}
        <Button
          className="ml-auto"
          onClick={() => void publish()}
          disabled={!dirty || !servers.length || busy}
          data-testid="button-publish-file-servers"
        >
          {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Publish server list
        </Button>
      </div>
    </section>
  );
}
