/**
 * Naming a chat, NIP-17's way (and Amethyst's): a message carrying a new
 * `subject` tag. Any member can do it; the newest subject is the chat's name
 * for everyone. The message says so in words too, for clients that don't
 * show subjects.
 */
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/** Long enough for a real name, short enough for a list row. */
export const MAX_SUBJECT = 80;

export function renameText(subject: string): string {
  return `Renamed the chat to “${subject}”`;
}

export function RenameChatDialog({
  open,
  current,
  onOpenChange,
  onRename,
}: {
  open: boolean;
  current?: string;
  onOpenChange: (open: boolean) => void;
  /** Sends the rename; resolves true once it's on its way. */
  onRename: (subject: string) => Promise<boolean>;
}) {
  const [name, setName] = useState(current ?? "");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setName(current ?? "");
  }, [open, current]);
  const value = name.trim();
  const unchanged = value === (current ?? "").trim();

  const save = async () => {
    if (!value || unchanged || busy) return;
    setBusy(true);
    const ok = await onRename(value);
    setBusy(false);
    if (ok) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="dm-rename-dialog">
        <DialogHeader>
          <DialogTitle>Rename chat</DialogTitle>
          <DialogDescription>
            Everyone in the chat sees the new name. It's sent as a message (NIP-17 subject), so it shows in their other
            apps too.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <Input
            value={name}
            onChange={(e) => setName(e.target.value.slice(0, MAX_SUBJECT))}
            placeholder="Chat name"
            aria-label="Chat name"
            autoFocus
            data-testid="dm-rename-input"
          />
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={!value || unchanged || busy} data-testid="dm-rename-save">
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Rename
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
