/**
 * Filling a list's form from JSON — most often an AI's reply. Step one copies
 * instructions for the AI (lib/listPrompt: the tag grammar and today's URL
 * templates, by id); step two reads the reply (lib/listImport) and hands the
 * editor a draft, as if its form had been filled in by hand. Nothing is
 * published from here.
 */
import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { dictionaryRelays } from "@/config/dictionary";
import { useAvailableTemplates } from "@/hooks/useLinkTemplates";
import { importIntoDraft, parseListImport, type ImportResult } from "@/lib/listImport";
import { listAuthoringPrompt } from "@/lib/listPrompt";

export function ImportListDialog({
  open,
  onOpenChange,
  author,
  onImport,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  author: string;
  onImport: (result: ImportResult) => void;
}) {
  const templates = useAvailableTemplates(open);
  const prompt = listAuthoringPrompt(templates.data ?? [], dictionaryRelays()[0] ?? "");
  const [copied, setCopied] = useState(false);
  const [text, setText] = useState("");
  const parsed = text.trim() ? parseListImport(text) : null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  const fill = () => {
    if (!parsed?.ok) return;
    onImport(importIntoDraft(parsed.value, author));
    setText("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl" data-testid="list-import-dialog">
        <DialogHeader>
          <DialogTitle>Import a list from JSON</DialogTitle>
          <DialogDescription>
            Have an AI write the list for you: give it these instructions and say what you want, then paste its reply.
            The form fills in, and you carry on from there. Nothing is published until you publish it.
          </DialogDescription>
        </DialogHeader>

        <div className="min-w-0 space-y-4">
          <div className="space-y-1.5">
            <Label>1. Instructions for the AI</Label>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void copy()}
                data-testid="list-import-copy"
              >
                {copied ? <Check className="mr-1 h-4 w-4" /> : <Copy className="mr-1 h-4 w-4" />}
                {copied ? "Copied" : "Copy instructions"}
              </Button>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {templates.isPending
                  ? "Reading the URL templates…"
                  : `Includes the ${templates.data?.length ?? 0} URL templates available now. Add your request at the end.`}
              </span>
            </div>
            <Textarea
              readOnly
              rows={4}
              value={prompt}
              className="font-mono text-[11px]"
              aria-label="Instructions for the AI"
              data-testid="list-import-prompt"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="list-import-reply">2. Its reply</Label>
            <Textarea
              id="list-import-reply"
              rows={8}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder='{ "d": "books", "tags": [["names", "Book", "Books"], …], "example": { … } }'
              className="font-mono text-xs"
              data-testid="list-import-reply"
            />
            {parsed && !parsed.ok && (
              <Alert variant="destructive" data-testid="list-import-error">
                <AlertDescription>{parsed.error}</AlertDescription>
              </Alert>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={fill} disabled={!parsed?.ok} data-testid="list-import-fill">
            Fill in the form
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
