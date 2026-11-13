/**
 * Routstr as a provider in Settings › Assistants › AI model: pick a node from the kind
 * 38421 announcements, see what its models cost in sats, and either buy a key there
 * (Lightning, or a Cashu token) or paste one you have. A bought key goes into the reader's
 * kind 12000 like any other (services/routstrPurchase holds the money rules).
 *
 * Also here, for the rest of the page: the purchases still in flight, a Routstr key's
 * balance and Top up on its key card, and the low-balance note the print card and the
 * schedule show.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import {
  AlertTriangle,
  ArrowLeft,
  BadgeCheck,
  Check,
  Copy,
  ExternalLink,
  Eye,
  KeyRound,
  Loader2,
  Search,
  ShieldAlert,
  Wallet,
  Zap,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { LazyQRCode } from "@/components/LazyQRCode";
import { activeAccount } from "@/accounts/signing";
import { useStoreEvents } from "@/hooks/useStoreEvents";
import { useNow } from "@/hooks/useNow";
import { useToast } from "@/hooks/use-toast";
import { copyToClipboard } from "@/lib/clipboard";
import { cn } from "@/lib/utils";
import { formatAgo } from "@/lib/scheduledTasks";
import { isWebLNAvailable, lightningUriForInvoice, payWithWebLN } from "@/lib/zap";
import type { AgentKey } from "@/lib/agentKeys";
import { keySuffix } from "@/lib/assistantKeys";
import { rankModels, editionTokens } from "@/lib/frontPage/writer";
import { DEFAULT_DIGEST_BUDGET } from "@/lib/frontPage/corpus";
import { readModel } from "@/lib/frontPage/modelMemory";
import {
  KEY_AMOUNTS,
  MAX_INVOICE_SATS,
  ROUTSTR_KIND,
  cashuToken,
  estimateCost,
  estimateSats,
  formatSats,
  formatUsd,
  isVerified,
  lowBalance,
  msatsToSats,
  nodeApiUrl,
  nodeBase,
  nodeHost,
  nodesFrom,
  satsNeeded,
  searchNodes,
  textModels,
  usableBase,
  type CashuChange,
  type RoutstrInfo,
  type RoutstrModel,
  type RoutstrNode,
} from "@/lib/routstr";
import { purchaseState, type PendingPurchase, type PurchasePurpose } from "@/lib/routstrPurchase";
import {
  RoutstrError,
  getBalance,
  getNodeInfo,
  getNodeModels,
  loadRoutstrNodes,
  markRoutstr,
  refreshBalance,
  useIsRoutstr,
  useRoutstrBalance,
} from "@/services/routstr";
import {
  buyWithCashu,
  changeTaken,
  forgetPurchase,
  markPaidHere,
  pollPurchase,
  startLightningPurchase,
  topUpWithCashu,
  usePurchases,
} from "@/services/routstrPurchase";

const NODE_FILTERS = [{ kinds: [ROUTSTR_KIND] }];
const NODES_WINDOW = { minMs: 10 * 60_000 };
const AI_SETTINGS = "/settings?tab=assistants&view=ai";

/** The tokens one edition is estimated at: the same estimate as the print card's. */
let editionCache: ReturnType<typeof editionTokens> | null = null;
export function editionEstimate() {
  editionCache ??= editionTokens(DEFAULT_DIGEST_BUDGET);
  return editionCache;
}

function errorText(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

/**
 * The Active Account, read as AiModelTab reads it: the page re-renders on a switch (its keys
 * do), and the purchases below follow whose they are through their own subscription.
 */
function usePubkey(): string | null {
  return activeAccount()?.pubkey ?? null;
}

// --- the panel -------------------------------------------------------------------

type View =
  | { at: "nodes" }
  | { at: "node"; node: RoutstrNode }
  | { at: "buy"; node: RoutstrNode; token?: string }
  | { at: "invoice"; node: RoutstrNode; id: string }
  | { at: "paste"; node: RoutstrNode };

/**
 * What the Routstr tile opens, in KeyEntry's place: the steps one at a time, with Back.
 * `onSave` is the page's own save (the kind 12000 editor), used for a pasted key; a bought
 * one is saved by the purchase itself.
 */
export function RoutstrPanel({
  busy,
  onSave,
  onChange,
  onBought,
}: {
  busy: boolean;
  onSave: (entry: AgentKey) => Promise<boolean>;
  onChange: () => void;
  /** A bought key was saved: the page closes the panel. */
  onBought: () => void;
}) {
  const [view, setView] = useState<View>({ at: "nodes" });
  const back = () =>
    setView((v) => (v.at === "nodes" ? v : v.at === "node" ? { at: "nodes" } : { at: "node", node: v.node }));

  return (
    <div className="flex flex-col gap-3" data-testid="routstr-panel">
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand-primary to-brand-accent font-display text-sm font-semibold text-white shadow-md shadow-brand-primary/25"
        >
          RS
        </span>
        <div className="min-w-0 flex-1">
          <span className="block truncate font-display text-base font-semibold text-foreground">Routstr</span>
          <span className="block truncate text-xs text-muted-foreground">Pay per use in sats, no account</span>
        </div>
        {view.at === "nodes" ? (
          <Button variant="ghost" size="sm" onClick={onChange} data-testid="ai-model-change">
            Change
          </Button>
        ) : (
          <Button variant="ghost" size="sm" onClick={back} data-testid="routstr-back">
            <ArrowLeft /> Back
          </Button>
        )}
      </div>
      {view.at === "nodes" && <NodeList onPick={(node) => setView({ at: "node", node })} />}
      {view.at === "node" && (
        <NodeDetail
          node={view.node}
          onBuy={() => setView({ at: "buy", node: view.node })}
          onPaste={() => setView({ at: "paste", node: view.node })}
        />
      )}
      {view.at === "buy" && (
        <BuyKey
          node={view.node}
          purpose="create"
          initialToken={view.token}
          onInvoice={(id) => setView({ at: "invoice", node: view.node, id })}
          onDone={onBought}
        />
      )}
      {view.at === "invoice" && <InvoiceStep id={view.id} onDone={onBought} />}
      {view.at === "paste" && (
        <PasteKey
          node={view.node}
          busy={busy}
          onSave={onSave}
          onCashu={(token) => setView({ at: "buy", node: view.node, token })}
        />
      )}
    </div>
  );
}

// --- 1. pick a node -----------------------------------------------------------------

function NodeList({ onPick }: { onPick: (node: RoutstrNode) => void }) {
  const { events, loading } = useStoreEvents("routstr:nodes", NODE_FILTERS, () => loadRoutstrNodes(), NODES_WINDOW);
  const now = useNow();
  const { fresh, stale } = useMemo(() => nodesFrom(events, Math.floor(now / 1000)), [events, now]);
  const [query, setQuery] = useState("");
  const [showStale, setShowStale] = useState(false);
  const shown = searchNodes(showStale ? [...fresh, ...stale] : fresh, query);

  return (
    <div className="flex flex-col gap-3" data-testid="routstr-nodes">
      <h3 className="text-sm font-semibold text-foreground">Pick a node</h3>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          aria-label="Search nodes"
          placeholder="Search by name"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-9"
          data-testid="routstr-search"
        />
      </div>
      {loading && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="routstr-nodes-loading">
          <Loader2 className="h-4 w-4 animate-spin" /> Looking for nodes…
        </p>
      )}
      {!loading && shown.length === 0 && (
        <p className="text-sm text-muted-foreground" data-testid="routstr-nodes-empty">
          {query ? "No node by that name." : "No node announced itself this week."}
        </p>
      )}
      <ul className="flex max-h-[26rem] flex-col gap-2 overflow-y-auto pr-0.5">
        {shown.map((node) => (
          <li key={node.id}>
            <NodeRow node={node} now={now} onPick={() => onPick(node)} />
          </li>
        ))}
      </ul>
      {stale.length > 0 && (
        <Button
          variant="ghost"
          size="sm"
          className="self-start"
          onClick={() => setShowStale((v) => !v)}
          data-testid="routstr-show-stale"
        >
          {showStale ? "Hide nodes not seen this week" : `Show ${stale.length} not seen this week`}
        </Button>
      )}
      <TypedNode onPick={onPick} />
    </div>
  );
}

function NodeRow({ node, now, onPick }: { node: RoutstrNode; now: number; onPick: () => void }) {
  const models = node.models;
  return (
    <button
      type="button"
      onClick={onPick}
      className="flex w-full min-w-0 flex-col gap-1.5 rounded-xl border border-border bg-card p-3 text-left transition-colors hover:border-brand-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent"
      data-testid="routstr-node"
    >
      <div className="flex min-w-0 items-baseline gap-2">
        <span className="truncate text-sm font-semibold text-foreground">{node.name}</span>
        <span className="ml-auto shrink-0 text-xs text-muted-foreground">
          {node.typed ? "typed" : formatAgo(node.seenAt * 1000, now)}
        </span>
      </div>
      {node.about && <span className="line-clamp-2 text-xs text-muted-foreground">{node.about}</span>}
      <div className="flex flex-wrap items-center gap-1.5">
        <Chip tone="slate" size="sm">
          {nodeHost(node)}
        </Chip>
        <Chip tone="slate" size="sm">
          https
        </Chip>
        {node.onion && (
          <Chip tone="slate" size="sm">
            onion
          </Chip>
        )}
        {node.version && (
          <Chip tone="slate" size="sm">
            v{node.version.replace(/\+.*$/, "")}
          </Chip>
        )}
        <Chip tone="slate" size="sm">
          {node.mints.length} {node.mints.length === 1 ? "mint" : "mints"}
        </Chip>
      </div>
      <span className="truncate text-xs text-muted-foreground" data-testid="routstr-node-models">
        {models ? models.slice(0, 4).join(", ") + (models.length > 4 ? ` +${models.length - 4}` : "") : "—"}
      </span>
    </button>
  );
}

/** "Enter a node URL": checked through its `/v1/info` before it is offered. */
function TypedNode({ onPick }: { onPick: (node: RoutstrNode) => void }) {
  const [url, setUrl] = useState("");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const check = async () => {
    const base = usableBase(url, { typed: true });
    if (!base) {
      setError("Needs an https:// address");
      return;
    }
    setChecking(true);
    setError(null);
    try {
      const info = await getNodeInfo(nodeApiUrl(base));
      if (!info) setError("That isn't a Routstr node");
      else {
        markRoutstr(nodeApiUrl(base));
        onPick({
          pubkey: "",
          identifier: "",
          id: base,
          name: info.name || nodeHost({ https: [base] }),
          about: info.description,
          version: info.version,
          mints: info.mints,
          models: null,
          endpoints: [base],
          https: [base],
          onion: !!info.onionUrl,
          seenAt: 0,
          typed: true,
        });
      }
    } catch (err) {
      setError(errorText(err, "Couldn't reach it"));
    } finally {
      setChecking(false);
    }
  };
  return (
    <div className="flex flex-col gap-1 border-t border-border pt-3">
      <label className="text-xs font-medium text-muted-foreground" htmlFor="routstr-typed-url">
        Or enter a node URL
      </label>
      <div className="flex gap-2">
        <Input
          id="routstr-typed-url"
          placeholder="https://…"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void check();
          }}
          autoComplete="off"
          spellCheck={false}
          className={cn("min-w-0 flex-1", url && "font-mono")}
          data-testid="routstr-typed-url"
        />
        <Button variant="outline" disabled={!url.trim() || checking} onClick={() => void check()}>
          {checking ? <Loader2 className="animate-spin" /> : null} Check
        </Button>
      </div>
      {error && (
        <p className="text-xs text-red-600 dark:text-red-400" role="status" data-testid="routstr-typed-error">
          {error}
        </p>
      )}
    </div>
  );
}

// --- 2. the node --------------------------------------------------------------------

type Loaded<T> = { status: "loading" } | { status: "ready"; value: T } | { status: "failed"; error: string };

function useNodeData(apiUrl: string) {
  const [info, setInfo] = useState<Loaded<RoutstrInfo | null>>({ status: "loading" });
  const [models, setModels] = useState<Loaded<RoutstrModel[]>>({ status: "loading" });
  useEffect(() => {
    let live = true;
    setInfo({ status: "loading" });
    setModels({ status: "loading" });
    getNodeInfo(apiUrl).then(
      (value) => live && setInfo({ status: "ready", value }),
      (err) => live && setInfo({ status: "failed", error: errorText(err, "No answer") }),
    );
    getNodeModels(apiUrl).then(
      (value) => live && setModels({ status: "ready", value }),
      (err) => live && setModels({ status: "failed", error: errorText(err, "No answer") }),
    );
    return () => {
      live = false;
    };
  }, [apiUrl]);
  return { info, models };
}

/** The node's text models, best writers first. */
function writers(models: RoutstrModel[]): RoutstrModel[] {
  const byId = new Map(textModels(models).map((m) => [m.id, m]));
  return rankModels([...byId.keys()]).map((id) => byId.get(id)!);
}

function NodeDetail({ node, onBuy, onPaste }: { node: RoutstrNode; onBuy: () => void; onPaste: () => void }) {
  const apiUrl = nodeApiUrl(node.https[0]);
  const { info, models } = useNodeData(apiUrl);
  const verified = info.status === "ready" && isVerified(info.value, node.pubkey);
  const notNode = info.status === "ready" && !info.value;
  const tokens = editionEstimate();
  const list = models.status === "ready" ? writers(models.value) : [];

  return (
    <div className="flex flex-col gap-3" data-testid="routstr-node-detail">
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-display text-lg font-semibold text-foreground">{node.name}</h3>
          {verified && (
            <Chip tone="success" icon={BadgeCheck} data-testid="routstr-verified">
              Verified
            </Chip>
          )}
        </div>
        <span className="font-mono text-xs text-muted-foreground">{nodeHost(node)}</span>
        {node.about && <p className="text-sm text-muted-foreground">{node.about}</p>}
        {info.status === "ready" && info.value && !verified && !node.typed && (
          <p className="text-xs text-amber-700 dark:text-amber-400" data-testid="routstr-unverified">
            Its own key isn&apos;t the one that announced it.
          </p>
        )}
        {notNode && (
          <p className="text-xs text-red-600 dark:text-red-400" data-testid="routstr-not-node">
            It doesn&apos;t answer as a Routstr node.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between px-0.5">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Models</h4>
          <span className="text-xs text-muted-foreground">≈ per Observer edition</span>
        </div>
        {models.status === "loading" && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Asking the node…
          </p>
        )}
        {models.status === "failed" && (
          <p className="text-sm text-amber-700 dark:text-amber-400" data-testid="routstr-models-failed">
            {models.error}
          </p>
        )}
        {models.status === "ready" && list.length === 0 && (
          <p className="text-sm text-muted-foreground">It lists no text models.</p>
        )}
        {list.length > 0 && (
          <ul className="flex max-h-72 flex-col divide-y divide-border overflow-y-auto rounded-xl border border-border">
            {list.map((m) => {
              const sats = estimateSats(m, tokens);
              const usd = estimateCost(m.usd, tokens);
              const needs = satsNeeded(m, sats);
              return (
                <li key={m.id} className="flex items-center gap-3 px-3 py-2" data-testid="routstr-model">
                  <span className="min-w-0 flex-1 truncate font-mono text-xs text-foreground">{m.id}</span>
                  <span className="shrink-0 text-right">
                    <span className="block text-xs font-semibold text-foreground" data-testid="routstr-model-sats">
                      {sats === null ? "—" : `≈ ${formatSats(sats)}`}
                    </span>
                    {(usd !== null || needs !== null) && (
                      <span className="block text-[11px] text-muted-foreground">
                        {usd !== null ? `≈ ${formatUsd(usd)}` : ""}
                        {usd !== null && needs !== null ? " · " : ""}
                        {needs !== null ? `needs ${formatSats(needs)}` : ""}
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        {list.length > 0 && (
          <p className="px-0.5 text-[11px] text-muted-foreground">
            &ldquo;Needs&rdquo; is what the node holds back per request: your balance must cover it.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button className="sm:flex-1" onClick={onBuy} disabled={notNode} data-testid="routstr-get-key">
          <Zap /> Get a key
        </Button>
        <Button variant="outline" className="sm:flex-1" onClick={onPaste} data-testid="routstr-have-key">
          <KeyRound /> I have a key
        </Button>
      </div>
    </div>
  );
}

// --- 3. get a key / top up ------------------------------------------------------------

/**
 * The amount and the way to pay. Lightning makes an invoice, kept on this device before it
 * is shown; Cashu turns a pasted token into a key (or onto a key's balance) in one call.
 */
export function BuyKey({
  node,
  purpose,
  entry,
  initialToken,
  onInvoice,
  onDone,
  suggest,
}: {
  node: RoutstrNode | { name: string; https: string[] };
  purpose: PurchasePurpose;
  /** The key a top-up adds to. */
  entry?: AgentKey;
  initialToken?: string;
  onInvoice: (id: string) => void;
  onDone: () => void;
  /** Sats to suggest first (a top-up's shortfall). */
  suggest?: number;
}) {
  const pubkey = usePubkey();
  const { toast } = useToast();
  const [method, setMethod] = useState<"lightning" | "cashu">(initialToken ? "cashu" : "lightning");
  const [amount, setAmount] = useState<number | null>(suggest ?? KEY_AMOUNTS[1]);
  const [custom, setCustom] = useState(suggest && !KEY_AMOUNTS.includes(suggest) ? String(suggest) : "");
  const [token, setToken] = useState(initialToken ?? "");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [change, setChange] = useState<CashuChange | null>(null);
  const apiUrl = nodeApiUrl(node.https[0]);
  const customSats = custom.trim() ? Number(custom.replace(/[,\s]/g, "")) : null;
  const sats = customSats ?? amount;
  const validSats = !!sats && Number.isInteger(sats) && sats > 0 && sats <= MAX_INVOICE_SATS;
  const parsedToken = cashuToken(token);
  const best = useBestWriter(apiUrl);
  const bestNeeds = best ? satsNeeded(best, estimateSats(best, editionEstimate())) : null;

  const invoice = async () => {
    if (!pubkey || !validSats) return;
    setWorking(true);
    setError(null);
    try {
      const record = await startLightningPurchase({
        pubkey,
        node: apiUrl,
        nodeName: node.name,
        amountSats: sats!,
        purpose,
        topUpKey: entry?.key,
      });
      onInvoice(record.id);
    } catch (err) {
      setError(errorText(err, "The node couldn't make an invoice."));
    } finally {
      setWorking(false);
    }
  };

  const redeem = async () => {
    if (!pubkey || !parsedToken) return;
    setWorking(true);
    setError(null);
    try {
      if (purpose === "topup" && entry) {
        const result = await topUpWithCashu({ pubkey, entry, token: parsedToken, nodeName: node.name });
        setToken("");
        toast({ title: result.sats ? `Added ${formatSats(result.sats)}` : "Topped up" });
        if (result.change) setChange(result.change);
        else onDone();
      } else {
        const result = await buyWithCashu({ pubkey, node: apiUrl, nodeName: node.name, token: parsedToken });
        setToken("");
        if (result.outcome === "saved") toast({ title: "Key saved" });
        else toast({ title: "Your key was bought but not saved yet", description: "Retry it above." });
        if (result.change) setChange(result.change);
        else onDone();
      }
    } catch (err) {
      setError(
        err instanceof RoutstrError
          ? err.message
          : // Silence: the token may or may not have been taken. The node gives the same key for it again.
            "No answer from the node. Keep the token: sending it again gives back the same key if it was taken.",
      );
    } finally {
      setWorking(false);
    }
  };

  if (change) {
    return (
      <ChangeCard
        change={change}
        onTaken={() => {
          setChange(null);
          onDone();
        }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3" data-testid="routstr-buy">
      <h3 className="text-sm font-semibold text-foreground">
        {purpose === "topup" ? `Top up at ${node.name}` : `Get a key at ${node.name}`}
      </h3>
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        className="justify-start"
        value={method}
        onValueChange={(v) => (v === "lightning" || v === "cashu") && setMethod(v)}
        aria-label="Pay with"
      >
        <ToggleGroupItem value="lightning" data-testid="routstr-method-lightning">
          <Zap className="h-4 w-4" /> Lightning
        </ToggleGroupItem>
        <ToggleGroupItem value="cashu" data-testid="routstr-method-cashu">
          <Wallet className="h-4 w-4" /> Cashu
        </ToggleGroupItem>
      </ToggleGroup>

      {method === "lightning" ? (
        <>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Amount">
            {KEY_AMOUNTS.map((a) => (
              <button
                key={a}
                type="button"
                role="radio"
                aria-checked={!custom.trim() && amount === a}
                onClick={() => {
                  setAmount(a);
                  setCustom("");
                }}
                className={cn(
                  "h-10 rounded-xl border px-3 text-sm font-semibold transition-colors",
                  !custom.trim() && amount === a
                    ? "border-brand-primary bg-brand-primary/10 text-foreground dark:border-brand-accent/60"
                    : "border-border bg-card text-foreground hover:border-brand-accent/40",
                )}
                data-testid={`routstr-amount-${a}`}
              >
                {formatSats(a)}
              </button>
            ))}
            <Input
              aria-label="Custom amount in sats"
              inputMode="numeric"
              placeholder="Custom"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              className="h-10 w-28"
              data-testid="routstr-amount-custom"
            />
          </div>
          {best && bestNeeds !== null && validSats && sats! < bestNeeds && purpose === "create" && (
            <p className="text-xs text-amber-700 dark:text-amber-400" data-testid="routstr-amount-hint">
              {best.id} needs {formatSats(bestNeeds)} on the balance per request: this amount can&apos;t run it.
            </p>
          )}
          {custom.trim() && !validSats && (
            <p className="text-xs text-red-600 dark:text-red-400">Whole sats, up to {formatSats(MAX_INVOICE_SATS)}.</p>
          )}
          <Button
            onClick={() => void invoice()}
            disabled={!validSats || working || !pubkey}
            className="w-full sm:w-auto sm:self-end"
            data-testid="routstr-make-invoice"
          >
            {working ? <Loader2 className="animate-spin" /> : <Zap />} Make invoice
          </Button>
        </>
      ) : (
        <>
          <Textarea
            aria-label="Cashu token"
            placeholder="cashuB…"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            rows={3}
            spellCheck={false}
            className="font-mono text-xs"
            data-testid="routstr-cashu-token"
          />
          {token.trim() && !parsedToken && <p className="text-xs text-red-600 dark:text-red-400">Not a Cashu token.</p>}
          <p className="text-xs text-muted-foreground">
            A token from a mint the node doesn&apos;t use may come back with change. You keep it.
          </p>
          <Button
            onClick={() => void redeem()}
            disabled={!parsedToken || working || !pubkey}
            className="w-full sm:w-auto sm:self-end"
            data-testid="routstr-redeem"
          >
            {working ? <Loader2 className="animate-spin" /> : <Wallet />}
            {purpose === "topup" ? "Add to balance" : "Turn into a key"}
          </Button>
        </>
      )}
      {error && (
        <p className="text-xs font-medium text-red-600 dark:text-red-400" role="status" data-testid="routstr-buy-error">
          {error}
        </p>
      )}
    </div>
  );
}

/** Change the node handed back: the reader's money, shown until they say they took it. */
function ChangeCard({ change, onTaken }: { change: CashuChange; onTaken: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <Card className="flex flex-col gap-3 p-4" data-testid="routstr-change">
      <div className="flex items-center gap-2">
        <Wallet className="h-4 w-4 text-amber-600 dark:text-amber-400" aria-hidden />
        <h3 className="text-sm font-semibold text-foreground">
          Your change{change.amount !== null ? `: ${change.amount.toLocaleString()} ${change.unit ?? "sat"}` : ""}
        </h3>
      </div>
      <p className="text-xs text-muted-foreground">
        The node sent this back as a Cashu token. Put it in your wallet: it isn&apos;t kept anywhere else.
      </p>
      <Textarea readOnly value={change.token} rows={3} className="font-mono text-xs" />
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          variant="outline"
          className="sm:flex-1"
          onClick={() => void copyToClipboard(change.token).then(setCopied)}
          data-testid="routstr-change-copy"
        >
          {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy token"}
        </Button>
        <Button className="sm:flex-1" disabled={!copied} onClick={onTaken} data-testid="routstr-change-taken">
          I&apos;ve put it in my wallet
        </Button>
      </div>
    </Card>
  );
}

/**
 * The invoice: QR, Copy, Open in wallet, and Pay with this browser's wallet when there is
 * one. It follows the record the poller moves on (services/routstrPurchase); when the
 * record goes, the purchase is over: saved, topped up, or expired.
 */
export function InvoiceStep({ id, onDone }: { id: string; onDone: () => void }) {
  const pubkey = usePubkey();
  const purchases = usePurchases(pubkey);
  const record = purchases.find((r) => r.id === id) ?? null;
  const last = useRef<PendingPurchase | null>(record);
  if (record) last.current = record;
  const now = useNow(1000);
  const [copied, setCopied] = useState(false);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const seen = last.current;

  if (!record) {
    const expired = !!seen && !seen.paid && !seen.paidHere && seen.expiresAt !== null && now / 1000 > seen.expiresAt;
    return (
      <div className="flex flex-col items-center gap-3 py-4 text-center" data-testid="routstr-invoice-done">
        {expired ? (
          <>
            <AlertTriangle className="h-8 w-8 text-amber-600 dark:text-amber-400" />
            <p className="text-sm text-foreground">The invoice expired. Nothing was paid.</p>
          </>
        ) : (
          <>
            <span className="grid h-12 w-12 place-items-center rounded-full border border-emerald-200 bg-emerald-50 text-emerald-600 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-400">
              <Check className="h-6 w-6" />
            </span>
            <p className="text-sm font-semibold text-foreground">
              {seen?.purpose === "topup" ? "Topped up" : "Key saved"}
            </p>
          </>
        )}
        <Button variant="outline" onClick={onDone} data-testid="routstr-invoice-close">
          Done
        </Button>
      </div>
    );
  }

  const state = purchaseState(record, Math.floor(now / 1000));
  if (state === "unsaved-key" || state === "change") return <PendingRow record={record} />;
  const bolt11 = record.bolt11 ?? "";
  const left = record.expiresAt !== null ? Math.max(0, record.expiresAt - Math.floor(now / 1000)) : null;
  const pay = async () => {
    if (!pubkey) return;
    setPaying(true);
    setPayError(null);
    const result = await payWithWebLN(bolt11);
    setPaying(false);
    if (result.ok) markPaidHere(pubkey, record.id);
    else setPayError(result.error ?? "Payment failed");
  };

  return (
    <div className="flex flex-col gap-3" data-testid="routstr-invoice">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-foreground">Pay {formatSats(record.amountSats)}</h3>
        <span className="text-xs text-muted-foreground">{record.nodeName ?? nodeHost({ https: [record.node] })}</span>
      </div>
      <div className="flex justify-center">
        <div className="rounded-xl border border-slate-200 bg-white p-3" data-testid="routstr-qr">
          <LazyQRCode value={bolt11} size={188} bgColor="#ffffff" fgColor="#0A0E18" level="M" />
        </div>
      </div>
      <p className="text-center text-xs text-muted-foreground" role="status" data-testid="routstr-invoice-status">
        {state === "confirming" ? (
          <span className="inline-flex items-center gap-1.5">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Paid. Waiting for the node…
          </span>
        ) : state === "reconciling" ? (
          "The node is checking this payment. Your key arrives once it has."
        ) : state === "expired" ? (
          "Expired. Checking that nothing was paid…"
        ) : (
          <span className="inline-flex items-center gap-1.5">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Waiting for payment
            {left !== null ? ` · ${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}` : ""}
          </span>
        )}
      </p>
      {isWebLNAvailable() && state === "awaiting-payment" && (
        <Button onClick={() => void pay()} disabled={paying} className="w-full" data-testid="routstr-webln">
          {paying ? <Loader2 className="animate-spin" /> : <Wallet />} Pay with wallet
        </Button>
      )}
      {payError && <p className="text-center text-xs text-red-600 dark:text-red-400">{payError}</p>}
      <div className="flex gap-2">
        <Button
          variant="outline"
          className="flex-1"
          onClick={() => void copyToClipboard(bolt11).then(setCopied)}
          data-testid="routstr-copy-invoice"
        >
          {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy invoice"}
        </Button>
        <Button variant="outline" className="flex-1" asChild>
          <a href={lightningUriForInvoice(bolt11)} data-testid="routstr-open-wallet">
            <ExternalLink /> Open in wallet
          </a>
        </Button>
      </div>
      <p className="text-center text-[11px] text-muted-foreground">
        Safe to close: this device keeps the invoice and picks it up when you&apos;re back.
      </p>
    </div>
  );
}

// --- 4. I have a key ----------------------------------------------------------------

/**
 * A pasted `sk-…`, checked through the node's balance call. A Cashu token is refused:
 * it is money, and stored as a key anyone who could read kind 12000 could spend it.
 */
function PasteKey({
  node,
  busy,
  onSave,
  onCashu,
}: {
  node: RoutstrNode;
  busy: boolean;
  onSave: (entry: AgentKey) => Promise<boolean>;
  onCashu: (token: string) => void;
}) {
  const [key, setKey] = useState("");
  const [check, setCheck] = useState<
    { status: "idle" } | { status: "checking" } | { status: "ok"; sats: number } | { status: "failed"; error: string }
  >({ status: "idle" });
  const apiUrl = nodeApiUrl(node.https[0]);
  const trimmed = key.trim();
  const token = cashuToken(trimmed);
  const run = useRef(0);

  useEffect(() => {
    const id = ++run.current;
    if (!trimmed || token) {
      setCheck({ status: "idle" });
      return;
    }
    setCheck({ status: "checking" });
    const timer = setTimeout(() => {
      getBalance({ key: trimmed, url: apiUrl }).then(
        (b) => id === run.current && setCheck({ status: "ok", sats: msatsToSats(b.msats) }),
        (err) => id === run.current && setCheck({ status: "failed", error: errorText(err, "Key rejected") }),
      );
    }, 500);
    return () => clearTimeout(timer);
  }, [trimmed, token, apiUrl]);

  return (
    <div className="flex flex-col gap-3" data-testid="routstr-paste">
      <h3 className="text-sm font-semibold text-foreground">Your key at {node.name}</h3>
      <Input
        aria-label="Routstr key"
        type="password"
        placeholder="sk-…"
        value={key}
        onChange={(e) => setKey(e.target.value)}
        autoComplete="off"
        spellCheck={false}
        className={cn(key && "font-mono")}
        data-testid="routstr-paste-key"
      />
      {token ? (
        <Alert data-testid="routstr-paste-cashu">
          <ShieldAlert className="h-4 w-4" />
          <AlertDescription className="flex flex-col gap-2">
            <span>
              That&apos;s a Cashu token, not a key. It&apos;s money: saved as a key, anyone who can read your keys could
              spend it.
            </span>
            <Button size="sm" className="self-start" onClick={() => onCashu(token)} data-testid="routstr-paste-convert">
              Turn this token into a key instead
            </Button>
          </AlertDescription>
        </Alert>
      ) : (
        check.status !== "idle" && (
          <p
            role="status"
            className={cn(
              "flex items-center gap-1.5 text-xs font-medium",
              check.status === "ok"
                ? "text-emerald-700 dark:text-emerald-400"
                : check.status === "failed"
                  ? "text-red-600 dark:text-red-400"
                  : "text-muted-foreground",
            )}
            data-testid="routstr-paste-result"
          >
            {check.status === "checking" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {check.status === "checking"
              ? "Checking…"
              : check.status === "ok"
                ? `Works · ${formatSats(check.sats)}`
                : check.error}
          </p>
        )
      )}
      <Button
        className="w-full sm:w-auto sm:self-end"
        disabled={check.status !== "ok" || busy}
        onClick={() => {
          markRoutstr(apiUrl);
          void onSave({ key: trimmed, url: apiUrl });
        }}
        data-testid="routstr-paste-save"
      >
        {busy ? <Loader2 className="animate-spin" /> : null} Save
      </Button>
    </div>
  );
}

// --- purchases in flight -------------------------------------------------------------

/** Every purchase this device still holds for the account, for the top of the AI model page. */
export function PendingPurchases() {
  const pubkey = usePubkey();
  const purchases = usePurchases(pubkey);
  if (!purchases.length) return null;
  return (
    <section className="flex flex-col gap-2" data-testid="routstr-pending">
      <h3 className="px-1 text-sm font-semibold text-foreground">Routstr, in progress</h3>
      <ul className="flex flex-col gap-2">
        {purchases.map((r) => (
          <li key={r.id}>
            <PendingRow record={r} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function PendingRow({ record }: { record: PendingPurchase }) {
  const pubkey = usePubkey();
  const now = useNow();
  const { toast } = useToast();
  const [retrying, setRetrying] = useState(false);
  const [showing, setShowing] = useState<"ask" | "shown" | null>(null);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [forgetting, setForgetting] = useState(false);
  const state = purchaseState(record, Math.floor(now / 1000));
  const where = record.nodeName ?? nodeHost({ https: [record.node] });

  const retry = async () => {
    if (!pubkey) return;
    setRetrying(true);
    const outcome = await pollPurchase(pubkey, record.id);
    setRetrying(false);
    if (outcome === "saved") toast({ title: "Key saved" });
  };

  if (state === "change" && record.change) {
    return <ChangeCard change={record.change} onTaken={() => pubkey && changeTaken(pubkey, record.id)} />;
  }

  return (
    <Card className="flex flex-col gap-2 p-3" data-testid="routstr-pending-row" data-state={state}>
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-border bg-muted text-muted-foreground"
        >
          {state === "unsaved-key" ? <KeyRound className="h-4 w-4" /> : <Zap className="h-4 w-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">
            {state === "unsaved-key"
              ? "Your key was bought but not saved yet"
              : state === "awaiting-payment"
                ? `Waiting for payment · ${formatSats(record.amountSats)}`
                : state === "confirming"
                  ? `Paid · waiting for ${where}`
                  : state === "reconciling"
                    ? `${where} is checking your payment`
                    : "Invoice expired"}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {record.purpose === "topup" ? `Top-up of ····${record.topsUp ?? ""}` : "New key"} at {where}
            {record.saveError ? ` · ${record.saveError}` : ""}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {state === "unsaved-key" && (
          <>
            <Button size="sm" onClick={() => void retry()} disabled={retrying} data-testid="routstr-pending-retry">
              {retrying ? <Loader2 className="animate-spin" /> : null} Retry
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowing("ask")} data-testid="routstr-pending-show">
              <Eye /> Show key
            </Button>
          </>
        )}
        {(state === "awaiting-payment" || state === "confirming") && record.bolt11 && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setInvoiceOpen(true)}
            data-testid="routstr-pending-invoice"
          >
            Show invoice
          </Button>
        )}
        {state === "expired" && (
          <Button size="sm" variant="ghost" onClick={() => setForgetting(true)} data-testid="routstr-pending-forget">
            Forget
          </Button>
        )}
      </div>
      {showing === "shown" && record.key && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 p-2 dark:border-amber-500/30 dark:bg-amber-500/10">
          <code className="min-w-0 flex-1 break-all font-mono text-xs text-foreground" data-testid="routstr-key-shown">
            {record.key}
          </code>
          <Button size="sm" variant="ghost" onClick={() => void copyToClipboard(record.key!)} aria-label="Copy key">
            <Copy />
          </Button>
        </div>
      )}

      <AlertDialog open={showing === "ask"} onOpenChange={(open) => !open && setShowing(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Show the key?</AlertDialogTitle>
            <AlertDialogDescription>
              Anyone who sees it can spend its balance at {where}. Don&apos;t show it on a shared screen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => setShowing("shown")} data-testid="routstr-key-show-confirm">
              Show
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={forgetting} onOpenChange={setForgetting}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Forget this invoice?</AlertDialogTitle>
            <AlertDialogDescription>
              Only if you didn&apos;t pay it. Paid, the key would be lost with it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction onClick={() => pubkey && forgetPurchase(pubkey, record.id)}>Forget</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={invoiceOpen} onOpenChange={setInvoiceOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-sm" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>Invoice</DialogTitle>
          </DialogHeader>
          <InvoiceStep id={record.id} onDone={() => setInvoiceOpen(false)} />
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// --- the key card ------------------------------------------------------------------

/** The node's best writer (its models are public, and asked once per node). */
function useBestWriter(apiUrl: string): RoutstrModel | null {
  const [best, setBest] = useState<RoutstrModel | null>(null);
  useEffect(() => {
    let live = true;
    getNodeModels(apiUrl).then(
      (m) => live && setBest(writers(m)[0] ?? null),
      () => live && setBest(null),
    );
    return () => {
      live = false;
    };
  }, [apiUrl]);
  return best;
}

/** A Routstr node's own name (its `/v1/info`), for a saved key's card; null for anything else. */
export function useRoutstrNodeName(apiUrl: string): string | null {
  const isRoutstr = useIsRoutstr(apiUrl);
  const [name, setName] = useState<string | null>(null);
  useEffect(() => {
    if (!isRoutstr) return;
    let live = true;
    getNodeInfo(apiUrl).then(
      (info) => live && setName(info?.name || null),
      () => live && setName(null),
    );
    return () => {
      live = false;
    };
  }, [apiUrl, isRoutstr]);
  return isRoutstr ? name : null;
}

/** The model a Routstr key is used with: the one this account last printed with there, else the node's best writer. */
function useKeyModel(entry: AgentKey, enabled: boolean): RoutstrModel | null {
  const pubkey = usePubkey();
  const [models, setModels] = useState<RoutstrModel[] | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    getNodeModels(entry.url).then(
      (m) => live && setModels(m),
      () => live && setModels(null),
    );
    return () => {
      live = false;
    };
  }, [entry.url, enabled]);
  if (!models) return null;
  const remembered = pubkey ? readModel(pubkey, entry.url) : null;
  return models.find((m) => m.id === remembered) ?? writers(models)[0] ?? null;
}

/**
 * Under a saved key's name, when it is a Routstr node's: its balance in sats (asked when
 * the screen opens), Top up, and a warning when the balance may not cover a paper.
 */
export function RoutstrKeyExtras({ entry }: { entry: AgentKey }) {
  const isRoutstr = useIsRoutstr(entry.url);
  const balance = useRoutstrBalance(isRoutstr ? entry : null);
  const model = useKeyModel(entry, !!isRoutstr);
  const [topUp, setTopUp] = useState(false);
  if (!isRoutstr || !balance) return null;
  const estimate = estimateSats(model, editionEstimate());
  const low = balance.status === "ready" ? lowBalance(balance.balance, model, estimate) : null;

  return (
    <div className="flex flex-col gap-2 pl-[3.25rem]" data-testid="routstr-key-extras">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-foreground" data-testid="routstr-balance">
          {balance.status === "loading" ? (
            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Balance…
            </span>
          ) : balance.status === "ready" ? (
            <>
              <span className="font-semibold">{formatSats(msatsToSats(balance.balance.msats))}</span>
              <span className="text-muted-foreground"> balance</span>
            </>
          ) : (
            <span className="text-amber-700 dark:text-amber-400">{balance.error}</span>
          )}
        </span>
        <Button
          size="sm"
          variant="outline"
          className="ml-auto h-8"
          onClick={() => setTopUp(true)}
          data-testid="routstr-top-up"
        >
          <Zap /> Top up
        </Button>
      </div>
      {low?.low && model && (
        <p
          className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400"
          data-testid="routstr-low-balance"
        >
          <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
          Too low for a paper with {model.id}: top up {formatSats(low.short)}.
        </p>
      )}
      <TopUpDialog entry={entry} open={topUp} onOpenChange={setTopUp} suggest={low?.low ? low.short : undefined} />
    </div>
  );
}

/** Top up a saved key: the same flow as buying one, `purpose: topup`. */
export function TopUpDialog({
  entry,
  open,
  onOpenChange,
  suggest,
}: {
  entry: AgentKey;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  suggest?: number;
}) {
  const [invoiceId, setInvoiceId] = useState<string | null>(null);
  const node = { name: nodeHost({ https: [nodeBase(entry.url)] }), https: [nodeBase(entry.url)] };
  const close = (next: boolean) => {
    if (!next) {
      setInvoiceId(null);
      void refreshBalance(entry);
    }
    onOpenChange(next);
  };
  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent
        className="max-h-[90dvh] overflow-y-auto sm:max-w-md"
        aria-describedby={undefined}
        data-testid="routstr-topup-dialog"
      >
        <DialogHeader>
          <DialogTitle>Top up ····{keySuffix(entry)}</DialogTitle>
        </DialogHeader>
        {invoiceId ? (
          <InvoiceStep id={invoiceId} onDone={() => close(false)} />
        ) : (
          <BuyKey
            node={node}
            purpose="topup"
            entry={entry}
            suggest={suggest ? Math.max(suggest, 100) : undefined}
            onInvoice={setInvoiceId}
            onDone={() => close(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

// --- the print card and the schedule -------------------------------------------------

/**
 * Under the model picker and next to the schedule, for a Routstr key: the estimate in sats,
 * the balance, and a warning when the balance may not cover the paper. Null for any other key.
 */
export function RoutstrPrintNote({
  entry,
  model,
  variant = "print",
}: {
  entry: AgentKey | null;
  model: RoutstrModel | null;
  variant?: "print" | "schedule";
}) {
  const isRoutstr = useIsRoutstr(entry?.url);
  const balance = useRoutstrBalance(isRoutstr && entry ? entry : null);
  if (!isRoutstr || !entry) return null;
  const estimate = estimateSats(model, editionEstimate());
  const low = balance?.status === "ready" ? lowBalance(balance.balance, model, estimate) : null;
  if (variant === "schedule") {
    if (!low?.low) return null;
    return (
      <p
        className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400"
        data-testid="routstr-schedule-low"
      >
        <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>
          Your Routstr balance may not cover tomorrow&apos;s paper.{" "}
          <Link href={AI_SETTINGS} className="font-medium underline underline-offset-2">
            Top up {formatSats(low.short)}
          </Link>
        </span>
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-1" data-testid="routstr-print-note">
      <p className="text-xs text-muted-foreground">
        {estimate !== null ? `≈ ${formatSats(estimate)} per edition` : "Price not listed"}
        {balance?.status === "ready" ? ` · ${formatSats(msatsToSats(balance.balance.msats))} balance` : ""}
      </p>
      {low?.low && (
        <p
          className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400"
          data-testid="routstr-print-low"
        >
          <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>
            Your Routstr balance is too low for this model.{" "}
            <Link href={AI_SETTINGS} className="font-medium underline underline-offset-2">
              Top up {formatSats(low.short)}
            </Link>
          </span>
        </p>
      )}
    </div>
  );
}
