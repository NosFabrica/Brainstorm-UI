/**
 * Settings › Assistants › AI model: the keys to the user's own AI provider, kept in
 * their kind 12000 (lib/agentKeys), encrypted to them, so every app they sign into
 * can run AI tasks with it. Called "AI model", never "Assistant": that word is the
 * identity Brainstorm hosts for the reader.
 *
 * Few words on purpose (the team, 2026-11-10: "exciting, modern, minimal text"): a
 * hero that says whether an AI is connected, a grid of providers, and a key field
 * that tests itself as you type, so a typo or a provider that won't answer a web
 * page shows up here rather than mid-task. The same layout as Amethyst's screen.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Eye,
  EyeOff,
  HelpCircle,
  Info,
  Laptop,
  Loader2,
  Lock,
  Plus,
  Sparkles,
  Star,
  Trash2,
  X,
  XCircle,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
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
import { useToast } from "@/hooks/use-toast";
import { useAgentKeys } from "@/hooks/useAgentKeys";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import { cn } from "@/lib/utils";
import {
  AGENT_PRESETS,
  addKey,
  makePreferred,
  maskKey,
  normalizeAgentUrl,
  presetForUrl,
  providerName,
  removeKey,
  testCaption,
  type AgentKey,
  type AgentPreset,
  type KeyTestResult,
} from "@/lib/agentKeys";
import { CONNECT_ERROR_TEXT, clearHandoff, peekHandoff } from "@/lib/openRouterOAuth";
import { testAgentKey, updateAgentKeys } from "@/services/agentKeys";
import { startOpenRouterConnect } from "@/services/openRouterOAuth";

const OPENROUTER_ID = "openrouter";
const TEST_DELAY_MS = 700;

/** Slide-in for cards and tiles; nothing moves when the reader asked for less motion. */
function useEnter(delay = 0) {
  const reduced = usePrefersReducedMotion();
  return reduced
    ? { initial: false as const }
    : {
        initial: { opacity: 0, y: 6 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.22, delay },
      };
}

/**
 * The provider's first letter on a neutral tile. Neutral on purpose: colour on this page
 * is for trust and focus (the selected tile, the preferred key), not decoration, and a
 * page of brand logos would be a list of other companies' marks.
 */
function Monogram({
  preset,
  name,
  lit = false,
  className,
}: {
  preset?: AgentPreset;
  name: string;
  /** The one in focus (the picked provider, the preferred key) wears the Aurora. */
  lit?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid h-10 w-10 shrink-0 place-items-center rounded-xl font-display text-base font-semibold transition-colors",
        lit
          ? "bg-gradient-to-br from-brand-primary to-brand-accent text-white shadow-md shadow-brand-primary/25"
          : "border border-border bg-muted text-foreground",
        className,
      )}
    >
      {preset?.id === "custom" ? <Plus className="h-4 w-4" /> : name.charAt(0).toUpperCase()}
    </span>
  );
}

/** Starts OpenRouter's sign-in; the page comes back through /settings/openrouter. */
function useOpenRouterConnect() {
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const connect = useCallback(async () => {
    setConnecting(true);
    setError(null);
    if (!(await startOpenRouterConnect())) {
      setConnecting(false);
      setError("This browser blocked the sign-in.");
    }
  }, []);
  return { connecting, error, connect };
}

function ConnectButton({
  connecting,
  onClick,
  size = "default",
  className,
}: {
  connecting: boolean;
  onClick: () => void;
  size?: "default" | "lg";
  className?: string;
}) {
  return (
    <Button
      size={size}
      className={className}
      disabled={connecting}
      onClick={onClick}
      data-testid="ai-model-openrouter-connect"
    >
      {connecting ? <Loader2 className="animate-spin" /> : <Sparkles />}
      Connect OpenRouter
    </Button>
  );
}

function Hero({ connectedTo, children }: { connectedTo: string | null; children?: React.ReactNode }) {
  return (
    <Card accent className="relative overflow-hidden p-5 sm:p-6" data-testid="ai-model-hero">
      {/* The page's one bespoke surface (a hero, per the design system): two soft Aurora
          glows behind the copy, faint enough that the text stays on a neutral ground. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-brand-accent/20 blur-3xl dark:bg-brand-accent/15"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-24 right-24 h-48 w-48 rounded-full bg-brand-primary/15 blur-3xl"
      />
      <div className="relative flex items-start gap-4">
        <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-brand-primary to-brand-accent text-white shadow-lg shadow-brand-primary/30">
          <Sparkles className="h-7 w-7" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h2 className="font-display text-xl font-semibold tracking-tight text-foreground sm:text-2xl">AI model</h2>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="rounded-full p-1 text-muted-foreground hover:text-foreground"
                  aria-label="About spending limits"
                  data-testid="ai-model-info"
                >
                  <Info className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-60">
                Use a key with a spending limit — every app you sign into can use it.
              </TooltipContent>
            </Tooltip>
          </div>
          <p className="text-sm text-muted-foreground">Bring your own AI. Encrypted to you.</p>
          <div className="mt-3" data-testid="ai-model-status">
            {connectedTo ? (
              <Chip tone="success" icon={CheckCircle2}>
                Connected · {connectedTo}
              </Chip>
            ) : (
              <Chip tone="slate" dot>
                Not connected
              </Chip>
            )}
          </div>
        </div>
      </div>
      {children && <div className="relative mt-5">{children}</div>}
    </Card>
  );
}

function ProviderGrid({ selected, onPick }: { selected: string | null; onPick: (id: string) => void }) {
  const reduced = usePrefersReducedMotion();
  return (
    <div
      className="grid grid-cols-3 gap-x-2 gap-y-4 sm:grid-cols-4 lg:grid-cols-6"
      role="radiogroup"
      aria-label="Provider"
      data-testid="ai-model-provider"
    >
      {AGENT_PRESETS.map((preset, i) => {
        const active = preset.id === selected;
        const badge = preset.recommended ? "Recommended" : preset.keyless ? "Local" : null;
        return (
          <motion.button
            key={preset.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onPick(preset.id)}
            {...(reduced
              ? { initial: false }
              : {
                  initial: { opacity: 0, y: 6 },
                  animate: { opacity: 1, y: 0 },
                  transition: { duration: 0.18, delay: Math.min(i, 12) * 0.02 },
                })}
            className={cn(
              "relative flex h-[5.5rem] min-w-0 flex-col items-center justify-center gap-1.5 rounded-xl border bg-card px-1.5 pb-2 pt-3 text-center transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent",
              active
                ? "border-brand-primary ring-2 ring-brand-primary/25 dark:border-brand-accent/60 dark:ring-brand-accent/25"
                : "border-border hover:border-brand-accent/40",
            )}
            data-testid={`ai-model-tile-${preset.id}`}
          >
            {badge && (
              <span
                className={cn(
                  "absolute -top-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-1.5 py-px text-[10px] font-semibold leading-4",
                  preset.recommended
                    ? "bg-brand-primary text-white dark:bg-brand-accent dark:text-slate-950"
                    : "border border-border bg-muted text-muted-foreground",
                )}
              >
                {badge}
              </span>
            )}
            <Monogram preset={preset} name={preset.name} lit={active} className="h-9 w-9 text-sm" />
            <span className="w-full truncate text-xs font-semibold text-foreground sm:text-sm">{preset.name}</span>
          </motion.button>
        );
      })}
    </div>
  );
}

function StatusIcon({ testing, tone }: { testing: boolean; tone: ReturnType<typeof testCaption>["tone"] | null }) {
  const reduced = usePrefersReducedMotion();
  const key = testing ? "testing" : (tone ?? "idle");
  const icon = testing ? (
    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
  ) : tone === "ok" ? (
    <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
  ) : tone === "rejected" ? (
    <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
  ) : tone === "unchecked" ? (
    <HelpCircle className="h-4 w-4 text-muted-foreground" />
  ) : tone === "problem" ? (
    <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
  ) : null;
  return (
    <AnimatePresence mode="wait" initial={false}>
      {icon && (
        <motion.span
          key={key}
          className="grid place-items-center"
          {...(reduced
            ? {}
            : {
                initial: { opacity: 0, scale: 0.6 },
                animate: { opacity: 1, scale: 1 },
                exit: { opacity: 0, scale: 0.6 },
                transition: { duration: 0.15 },
              })}
          data-testid={`ai-model-status-icon-${key}`}
        >
          {icon}
        </motion.span>
      )}
    </AnimatePresence>
  );
}

/**
 * The key for one provider. It tests itself: ~700 ms after typing stops, at once on a
 * paste, on a key OpenRouter just handed over, and on picking a local runner, which
 * needs no key. Save is offered for anything the provider didn't reject.
 */
function KeyEntry({
  preset,
  initialKey,
  initialError,
  busy,
  onSave,
}: {
  preset: AgentPreset;
  initialKey: string;
  initialError: string | null;
  busy: boolean;
  onSave: (entry: AgentKey) => Promise<boolean>;
}) {
  const [customUrl, setCustomUrl] = useState("");
  const [key, setKey] = useState(initialKey);
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<KeyTestResult | null>(null);
  const openRouter = useOpenRouterConnect();
  // Skip the debounce for the next test: a paste, a handed-over key, a local runner.
  const immediate = useRef(!!initialKey || !!preset.keyless);
  const run = useRef(0);

  const isCustom = preset.id === "custom";
  const url = normalizeAgentUrl(isCustom ? customUrl : preset.url);
  const trimmedKey = key.trim();
  const needsKey = !preset.keyless && !isCustom;
  const ready = !!url && (!needsKey || !!trimmedKey);

  useEffect(() => {
    const id = ++run.current;
    if (!ready || !url) {
      setTesting(false);
      setResult(null);
      return;
    }
    const delay = immediate.current ? 0 : TEST_DELAY_MS;
    immediate.current = false;
    setResult(null);
    const timer = setTimeout(() => {
      setTesting(true);
      void testAgentKey({ key: trimmedKey, url }).then((answer) => {
        if (id !== run.current) return;
        setResult(answer);
        setTesting(false);
      });
    }, delay);
    return () => clearTimeout(timer);
  }, [ready, url, trimmedKey]);

  const caption = result ? testCaption(result) : null;
  const error = openRouter.error ?? initialError;
  const canSave = ready && !testing && caption?.tone !== "rejected";

  const save = async () => {
    if (!url) return;
    if (await onSave({ key: trimmedKey, url })) {
      setKey("");
      setCustomUrl("");
      setResult(null);
    }
  };

  return (
    <div className="flex flex-col gap-3" data-testid="ai-model-add">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-display text-base font-semibold text-foreground">{preset.name}</span>
        {preset.hint && (
          <Chip tone="slate" size="sm">
            {preset.hint}
          </Chip>
        )}
        {preset.keyless && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Chip tone="slate" size="sm" icon={Laptop} data-testid="ai-model-local">
                  Runs on your computer
                </Chip>
              </span>
            </TooltipTrigger>
            <TooltipContent className="max-w-60">
              Works only there, once {preset.name} lets this site in
              {preset.id === "ollama" ? " (OLLAMA_ORIGINS)" : " (CORS switch)"}.
            </TooltipContent>
          </Tooltip>
        )}
        {preset.keyPage && (
          <a
            href={preset.keyPage}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs font-medium text-brand-link hover:bg-muted"
            data-testid="ai-model-get-key"
          >
            Get a key <ArrowUpRight className="h-3 w-3" />
          </a>
        )}
      </div>

      {preset.id === OPENROUTER_ID && (
        <>
          <ConnectButton
            connecting={openRouter.connecting}
            onClick={() => void openRouter.connect()}
            className="w-full"
          />
          <div className="flex items-center gap-3 text-xs text-muted-foreground" aria-hidden>
            <span className="h-px flex-1 bg-border" />
            or
            <span className="h-px flex-1 bg-border" />
          </div>
        </>
      )}

      {isCustom && (
        <div className="flex flex-col gap-1">
          <Input
            aria-label="API address"
            placeholder="https://…/v1"
            value={customUrl}
            onChange={(e) => setCustomUrl(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            className={cn(customUrl && "font-mono")}
            data-testid="ai-model-url"
          />
          {customUrl.trim() && !url && <p className="text-xs text-red-600 dark:text-red-400">Needs https://</p>}
        </div>
      )}

      {!preset.keyless && (
        <div className="relative">
          <Input
            aria-label="API key"
            type={showKey ? "text" : "password"}
            placeholder={isCustom ? "API key (optional)" : "Paste API key"}
            value={key}
            onChange={(e) => setKey(e.target.value)}
            onPaste={() => {
              immediate.current = true;
            }}
            autoComplete="off"
            spellCheck={false}
            className={cn("pr-20", key && "font-mono")}
            data-testid="ai-model-key"
          />
          <div className="absolute inset-y-0 right-2 flex items-center gap-1">
            <StatusIcon testing={testing} tone={caption?.tone ?? null} />
            <button
              type="button"
              onClick={() => setShowKey((v) => !v)}
              className="rounded-md p-1.5 text-muted-foreground hover:text-foreground"
              aria-label={showKey ? "Hide key" : "Show key"}
            >
              {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
      )}

      {(testing || caption || error) && (
        <p
          className={cn(
            "flex items-center gap-1.5 text-xs font-medium",
            error || caption?.tone === "rejected"
              ? "text-red-600 dark:text-red-400"
              : caption?.tone === "ok"
                ? "text-emerald-700 dark:text-emerald-400"
                : caption?.tone === "problem"
                  ? "text-amber-700 dark:text-amber-400"
                  : "text-muted-foreground",
          )}
          role="status"
          data-testid="ai-model-test-result"
        >
          {preset.keyless && <StatusIcon testing={testing} tone={caption?.tone ?? null} />}
          {testing ? "Checking…" : (caption?.text ?? error)}
        </p>
      )}

      <Button
        className="w-full sm:w-auto sm:self-end"
        disabled={!canSave || busy}
        onClick={() => void save()}
        data-testid="ai-model-save"
      >
        {busy ? <Loader2 className="animate-spin" /> : <Plus />}
        Save
      </Button>
    </div>
  );
}

function KeyCard({
  entry,
  preferred,
  busy,
  delay,
  onPrefer,
  onRemove,
}: {
  entry: AgentKey;
  preferred: boolean;
  busy: boolean;
  delay: number;
  onPrefer: () => void;
  onRemove: () => void;
}) {
  const enter = useEnter(delay);
  const name = providerName(entry.url);
  return (
    <motion.li {...enter} layout data-testid="ai-model-key-row">
      <Card accent={preferred} className="flex items-center gap-3 p-3">
        <Monogram preset={presetForUrl(entry.url)} name={name} lit={preferred} />
        <div className="flex min-w-0 flex-1 items-baseline gap-2">
          <span className="shrink-0 text-sm font-semibold text-foreground">{name}</span>
          <span className="truncate font-mono text-xs text-muted-foreground">
            {entry.key ? maskKey(entry.key) : "No key"}
          </span>
        </div>
        {preferred ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                className="grid h-9 w-9 place-items-center text-brand-primary dark:text-brand-accent"
                aria-label="Preferred"
                role="img"
                data-testid="ai-model-preferred"
              >
                <Star className="h-5 w-5 fill-current" />
              </span>
            </TooltipTrigger>
            <TooltipContent>Preferred</TooltipContent>
          </Tooltip>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 text-muted-foreground hover:text-brand-primary"
                disabled={busy}
                onClick={onPrefer}
                aria-label="Make preferred"
                data-testid="ai-model-make-preferred"
              >
                <Star className="h-5 w-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Make preferred</TooltipContent>
          </Tooltip>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 text-muted-foreground hover:text-red-600"
          disabled={busy}
          onClick={onRemove}
          aria-label={`Remove the ${name} key`}
          data-testid="ai-model-remove"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </Card>
    </motion.li>
  );
}

export function AiModelTab() {
  const keys = useAgentKeys();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<AgentKey | null>(null);
  // What "Connect OpenRouter" brought back, if the user just returned from it.
  const [arrived] = useState(peekHandoff);
  const [adding, setAdding] = useState(!!arrived);
  const [picked, setPicked] = useState<string | null>(arrived ? OPENROUTER_ID : null);
  const openRouter = useOpenRouterConnect();
  const saved = useMemo(() => (keys.status === "ready" ? keys.keys : []), [keys]);
  const canEdit = keys.status === "ready" || keys.status === "none";
  const preset = AGENT_PRESETS.find((p) => p.id === picked) ?? null;
  const addEnter = useEnter();

  useEffect(() => {
    clearHandoff();
  }, []);

  const apply = async (change: (current: AgentKey[]) => AgentKey[], done: string): Promise<boolean> => {
    setBusy(true);
    const outcome = await updateAgentKeys(change);
    setBusy(false);
    if (outcome.success) toast({ title: done });
    else if (!outcome.cancelled) toast({ title: "Couldn't save", description: outcome.error, variant: "destructive" });
    return outcome.success;
  };

  const openAdd = () => {
    setAdding(true);
    setPicked(null);
  };

  const showHeroActions = canEdit && saved.length === 0 && !adding;

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex flex-col gap-4" data-testid="card-ai-model">
        <Hero connectedTo={saved.length ? providerName(saved[0].url) : null}>
          {showHeroActions && (
            <div className="flex flex-col gap-2 sm:flex-row">
              <ConnectButton size="lg" connecting={openRouter.connecting} onClick={() => void openRouter.connect()} />
              <Button variant="outline" size="lg" onClick={openAdd} data-testid="ai-model-other-providers">
                Other providers
              </Button>
              {openRouter.error && (
                <p className="text-xs font-medium text-red-600 dark:text-red-400 sm:self-center" role="status">
                  {openRouter.error}
                </p>
              )}
            </div>
          )}
        </Hero>

        {keys.status === "loading" && (
          <p className="flex items-center gap-2 px-1 text-sm text-muted-foreground" data-testid="ai-model-loading">
            <Loader2 className="h-4 w-4 animate-spin" /> Looking for your keys…
          </p>
        )}

        {keys.status === "locked" && (
          <Card className="flex items-center gap-3 p-4" data-testid="ai-model-locked">
            <Lock className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="flex-1 text-sm text-foreground">Your keys are encrypted.</span>
            <Button variant="outline" size="sm" onClick={keys.reveal} data-testid="ai-model-reveal">
              Unlock
            </Button>
          </Card>
        )}

        {keys.status === "unreadable" && (
          <Alert variant="destructive" data-testid="ai-model-unreadable">
            <AlertDescription>This sign-in can't decrypt your keys. Use a NIP-44 signer.</AlertDescription>
          </Alert>
        )}

        {saved.length > 0 && (
          <section className="flex flex-col gap-2">
            <div className="flex items-center justify-between px-1">
              <h3 className="text-sm font-semibold text-foreground">Your keys</h3>
              {canEdit && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => (adding ? setAdding(false) : openAdd())}
                  data-testid="ai-model-add-open"
                >
                  {adding ? <X /> : <Plus />}
                  {adding ? "Close" : "Add"}
                </Button>
              )}
            </div>
            <ul className="flex flex-col gap-2" data-testid="ai-model-keys">
              <AnimatePresence initial={false}>
                {saved.map((entry, i) => (
                  <KeyCard
                    key={`${entry.url}|${entry.key}`}
                    entry={entry}
                    preferred={i === 0}
                    busy={busy}
                    delay={i * 0.04}
                    onPrefer={() => void apply((cur) => makePreferred(cur, entry), "Preferred key changed")}
                    onRemove={() => setRemoving(entry)}
                  />
                ))}
              </AnimatePresence>
            </ul>
          </section>
        )}

        <AnimatePresence initial={false}>
          {canEdit && adding && (
            <motion.div {...addEnter} key="add">
              <Card className="flex flex-col gap-4 p-4 sm:p-5">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-foreground">Pick a provider</h3>
                  {saved.length === 0 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setAdding(false)}
                      aria-label="Close"
                    >
                      <X />
                    </Button>
                  )}
                </div>
                <div className="pt-2">
                  <ProviderGrid selected={picked} onPick={setPicked} />
                </div>
                {preset && (
                  <div className="border-t border-border pt-4">
                    <KeyEntry
                      key={preset.id}
                      preset={preset}
                      initialKey={arrived && "key" in arrived && preset.id === OPENROUTER_ID ? arrived.key : ""}
                      initialError={
                        arrived && "error" in arrived && preset.id === OPENROUTER_ID
                          ? CONNECT_ERROR_TEXT[arrived.error]
                          : null
                      }
                      busy={busy}
                      onSave={async (entry) => {
                        const ok = await apply((cur) => addKey(cur, entry), "Key saved");
                        if (ok) setAdding(false);
                        return ok;
                      }}
                    />
                  </div>
                )}
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        <AlertDialog open={!!removing} onOpenChange={(open) => !open && setRemoving(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove key?</AlertDialogTitle>
              <AlertDialogDescription>
                Apps stop using it. Revoke it at {removing ? providerName(removing.url) : "the provider"} too.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  const entry = removing;
                  setRemoving(null);
                  if (entry) void apply((cur) => removeKey(cur, entry), "Key removed");
                }}
                data-testid="ai-model-remove-confirm"
              >
                Remove
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  );
}
