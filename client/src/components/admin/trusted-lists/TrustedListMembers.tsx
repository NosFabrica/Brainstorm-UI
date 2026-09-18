import { useQuery } from "@tanstack/react-query";
import { Copy, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { PersonCell } from "@/components/admin/billing/DivergenceRows";
import { useToast } from "@/hooks/use-toast";
import { copyToClipboard } from "@/lib/clipboard";
import { fetchProfileMap } from "@/services/nostr";
import { loadTrustedList } from "./listMembers";

/** One published list's members, read back from the relay it went to. */
export function TrustedListMembers({
  observer,
  signingPubkey,
  dTag,
  testId,
}: {
  observer: string;
  signingPubkey: string;
  dTag: string;
  testId: string;
}) {
  const { toast } = useToast();
  const list = useQuery({
    queryKey: ["trusted-list", signingPubkey, dTag],
    queryFn: () => loadTrustedList({ observer, signingPubkey, dTag }),
  });
  const pubkeys = list.data?.members.map((m) => m.pubkey) ?? [];
  // Names and pictures are best-effort: a member without a kind-0 still shows.
  const profiles = useQuery({
    queryKey: ["trusted-list-profiles", signingPubkey, dTag],
    queryFn: () => fetchProfileMap(pubkeys),
    enabled: pubkeys.length > 0,
  });

  const note = "text-xs text-slate-500 dark:text-slate-400";
  return (
    <div className="mt-1 basis-full rounded-lg border border-slate-100 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-950/40" data-testid={testId}>
      {list.isPending && (
        <p className={`${note} inline-flex items-center gap-1.5`}>
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Reading the list from the relay…
        </p>
      )}
      {list.isError && (
        <p className="text-xs text-red-600 dark:text-red-400">
          {list.error instanceof Error ? list.error.message : "Couldn't read the list."}
        </p>
      )}
      {list.isSuccess && !list.data && (
        <p className={note}>Not on the relay yet — a new list can take a moment to appear.</p>
      )}
      {list.data?.retracted && <p className={note}>This list has been retracted.</p>}
      {list.data && !list.data.retracted && (
        <>
          <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
            <span className={note}>
              {list.data.members.length} {list.data.members.length === 1 ? "member" : "members"} · on {list.data.relay}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 text-xs"
              onClick={async () => {
                const ok = await copyToClipboard(list.data!.naddr);
                toast({ title: ok ? "Link copied" : "Couldn't copy the link", description: ok ? "Paste it into any Nostr app to open the list." : undefined });
              }}
            >
              <Copy className="h-3.5 w-3.5" /> Copy link
            </Button>
          </div>
          <ul className="space-y-1">
            {list.data.members.map((m) => {
              const p = profiles.data?.get(m.pubkey);
              return (
                <li key={m.pubkey} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                  <PersonCell pubkey={m.pubkey} profile={p ? { name: p.display_name || p.name, picture: p.picture } : undefined} />
                  <span className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    {m.endorsements !== undefined && (
                      <span>
                        {m.endorsements} {m.endorsements === 1 ? "endorsement" : "endorsements"}
                      </span>
                    )}
                    {m.score !== null && <Chip tone="brand" size="sm">score {m.score}</Chip>}
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
