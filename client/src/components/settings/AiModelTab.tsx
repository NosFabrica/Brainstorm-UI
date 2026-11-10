/**
 * Settings › Assistants › AI model: the keys to the user's own AI provider, kept in
 * their kind 12000 (lib/agentKeys), encrypted to them, so every app they sign into
 * can run AI tasks with it. Called "AI model", never "Assistant": that word is the
 * identity Brainstorm hosts for the reader.
 *
 * A key is tested from this page before it is saved, so a typo or a provider that
 * won't answer a web page shows up here rather than mid-task.
 */
import { useMemo, useState } from "react";
import { AlertTriangle, Bot, CheckCircle2, KeyRound, Loader2, Lock, Plus, Star, Trash2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Input } from "@/components/ui/input";
import { SectionHeader } from "@/components/ui/section-header";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import {
  AGENT_PRESETS,
  addKey,
  makePreferred,
  maskKey,
  normalizeAgentUrl,
  providerName,
  removeKey,
  type AgentKey,
  type KeyTestResult,
} from "@/lib/agentKeys";
import { testAgentKey, updateAgentKeys } from "@/services/agentKeys";

function testMessage(result: KeyTestResult): { ok: boolean; text: string } {
  switch (result.status) {
    case "ok":
      return {
        ok: true,
        text: result.models === null ? "It works." : `It works: ${result.models.toLocaleString()} models available.`,
      };
    case "rejected":
      return { ok: false, text: "The provider rejected this key. Check it and try again." };
    case "failed":
      return { ok: false, text: `The provider answered with an error (${result.httpStatus}). Check the address.` };
    case "unreachable":
      return {
        ok: false,
        text: "Couldn't reach it from this page: the address is wrong, it's offline, or it doesn't let web pages call it.",
      };
  }
}

function KeyRow({
  entry,
  preferred,
  busy,
  onPrefer,
  onRemove,
}: {
  entry: AgentKey;
  preferred: boolean;
  busy: boolean;
  onPrefer: () => void;
  onRemove: () => void;
}) {
  return (
    <li
      className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-border px-3.5 py-3"
      data-testid="ai-model-key-row"
    >
      <KeyRound className="h-4 w-4 shrink-0 text-slate-400" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{providerName(entry.url)}</span>
          {preferred && (
            <Chip tone="brand" size="sm" icon={Star} data-testid="ai-model-preferred">
              Preferred
            </Chip>
          )}
        </div>
        <div className="mt-0.5 truncate font-mono text-xs text-slate-500 dark:text-slate-400">
          {maskKey(entry.key)} · {entry.url}
        </div>
      </div>
      <div className="flex items-center gap-1">
        {!preferred && (
          <Button variant="ghost" size="sm" disabled={busy} onClick={onPrefer} data-testid="ai-model-make-preferred">
            Make preferred
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={onRemove}
          aria-label={`Remove the ${providerName(entry.url)} key`}
          data-testid="ai-model-remove"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </li>
  );
}

function AddKeyForm({ busy, onSave }: { busy: boolean; onSave: (entry: AgentKey) => Promise<boolean> }) {
  const [presetId, setPresetId] = useState(AGENT_PRESETS[0].id);
  const preset = AGENT_PRESETS.find((p) => p.id === presetId) ?? AGENT_PRESETS[0];
  const [customUrl, setCustomUrl] = useState("");
  const [key, setKey] = useState("");
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const isCustom = preset.id === "custom";
  const url = normalizeAgentUrl(isCustom ? customUrl : preset.url);
  const entry: AgentKey | null = url ? { key: key.trim(), url } : null;
  const needsKey = !preset.keyless && !isCustom;
  const ready = !!entry && (!needsKey || !!entry.key);

  const pick = (id: string) => {
    setPresetId(id);
    setResult(null);
  };

  const test = async () => {
    if (!entry) return;
    setTesting(true);
    setResult(testMessage(await testAgentKey(entry)));
    setTesting(false);
  };

  const save = async () => {
    if (!entry) return;
    if (await onSave(entry)) {
      setKey("");
      setCustomUrl("");
      setResult(null);
    }
  };

  return (
    <div className="flex flex-col gap-3" data-testid="ai-model-add">
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor="ai-model-provider">
          Provider
        </label>
        <Select value={presetId} onValueChange={pick}>
          <SelectTrigger id="ai-model-provider" data-testid="ai-model-provider">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {AGENT_PRESETS.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.recommended ? `${p.name} (recommended)` : p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {preset.note && <p className="text-xs text-slate-500 dark:text-slate-400">{preset.note}</p>}
      </div>

      {isCustom ? (
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="ai-model-url">
            API address
          </label>
          <Input
            id="ai-model-url"
            placeholder="https://example.com/v1"
            value={customUrl}
            onChange={(e) => {
              setCustomUrl(e.target.value);
              setResult(null);
            }}
            autoComplete="off"
            data-testid="ai-model-url"
          />
          {customUrl.trim() && !url && (
            <p className="text-xs text-red-600 dark:text-red-400">Enter a web address starting with https://</p>
          )}
        </div>
      ) : (
        <p className="font-mono text-xs text-slate-500 dark:text-slate-400" data-testid="ai-model-preset-url">
          {preset.url}
        </p>
      )}

      {!preset.keyless && (
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="ai-model-key">
            API key{isCustom && <span className="font-normal text-slate-500"> (if it needs one)</span>}
          </label>
          <Input
            id="ai-model-key"
            type="password"
            placeholder="sk-…"
            value={key}
            onChange={(e) => {
              setKey(e.target.value);
              setResult(null);
            }}
            autoComplete="off"
            spellCheck={false}
            data-testid="ai-model-key"
          />
        </div>
      )}

      {result && (
        <p
          className={`flex items-start gap-1.5 text-sm ${result.ok ? "text-emerald-700 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}
          role="status"
          data-testid="ai-model-test-result"
        >
          {result.ok ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          {result.text}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={!ready || testing}
          onClick={() => void test()}
          data-testid="ai-model-test"
        >
          {testing && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
          Test
        </Button>
        <Button size="sm" disabled={!ready || busy} onClick={() => void save()} data-testid="ai-model-save">
          {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Plus className="mr-1.5 h-4 w-4" />}
          Save
        </Button>
      </div>
    </div>
  );
}

export function AiModelTab() {
  const keys = useAgentKeys();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<AgentKey | null>(null);
  const saved = useMemo(() => (keys.status === "ready" ? keys.keys : []), [keys]);
  const canEdit = keys.status === "ready" || keys.status === "none";

  const apply = async (change: (current: AgentKey[]) => AgentKey[], done: string): Promise<boolean> => {
    setBusy(true);
    const outcome = await updateAgentKeys(change);
    setBusy(false);
    if (outcome.success) toast({ title: done });
    else if (!outcome.cancelled)
      toast({ title: "Couldn't save your AI keys", description: outcome.error, variant: "destructive" });
    return outcome.success;
  };

  return (
    <Card className="flex flex-col gap-5 p-5" data-testid="card-ai-model">
      <div className="flex flex-col gap-2">
        <SectionHeader kicker="AI model" icon={Bot} />
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Bring your own AI provider. Your key is encrypted to you and saved on your relays, so every Nostr app you sign
          into can use it to run AI tasks for you. The provider bills you directly.
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Use a key with a spending cap: any app you sign into with this account can spend it.
        </p>
      </div>

      {keys.status === "loading" && (
        <p className="flex items-center gap-2 text-sm text-slate-500" data-testid="ai-model-loading">
          <Loader2 className="h-4 w-4 animate-spin" /> Looking for your saved keys…
        </p>
      )}

      {keys.status === "locked" && (
        <div className="flex flex-wrap items-center gap-3" data-testid="ai-model-locked">
          <Lock className="h-4 w-4 text-slate-400" />
          <span className="text-sm text-slate-600 dark:text-slate-300">Your saved keys are encrypted.</span>
          <Button variant="outline" size="sm" onClick={keys.reveal} data-testid="ai-model-reveal">
            Unlock to see them
          </Button>
        </div>
      )}

      {keys.status === "unreadable" && (
        <Alert variant="destructive" data-testid="ai-model-unreadable">
          <AlertDescription>
            You have saved AI keys, but this sign-in can't decrypt them. Sign in with a signer that supports NIP-44 to
            see or change them.
          </AlertDescription>
        </Alert>
      )}

      {keys.status === "ready" && saved.length > 0 && (
        <ul className="flex flex-col gap-2" data-testid="ai-model-keys">
          {saved.map((entry, i) => (
            <KeyRow
              key={`${entry.url}|${entry.key}`}
              entry={entry}
              preferred={i === 0}
              busy={busy}
              onPrefer={() => void apply((cur) => makePreferred(cur, entry), "Preferred key changed")}
              onRemove={() => setRemoving(entry)}
            />
          ))}
        </ul>
      )}

      {canEdit && (
        <div className="flex flex-col gap-3 border-t border-border pt-4">
          <SectionHeader kicker={saved.length ? "Add another key" : "Add a key"} variant="title" />
          <AddKeyForm busy={busy} onSave={(entry) => apply((cur) => addKey(cur, entry), "AI key saved")} />
        </div>
      )}

      <AlertDialog open={!!removing} onOpenChange={(open) => !open && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this key?</AlertDialogTitle>
            <AlertDialogDescription>
              Apps you sign into will stop using your {removing ? providerName(removing.url) : ""} key. Apps that
              already read it may have kept a copy: to be sure, revoke it at the provider too.
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
    </Card>
  );
}
