import { Copy, Info, Reply } from "lucide-react";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { reactionLabel } from "@/lib/dm/rooms";

/**
 * What holding a message opens on a phone: quick reactions on top, then
 * Reply, Copy text and Message info — the menu every messenger has, from the
 * bottom of the screen where a thumb is, so it can't open off-screen or
 * under the keyboard. Each choice closes it.
 */
export function MessageSheet({
  open,
  onOpenChange,
  reactions,
  text,
  onReact,
  onReply,
  onDetails,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reactions: string[];
  /** The message's text; files have none to copy. */
  text: string | null;
  onReact: (content: string) => void;
  onReply: () => void;
  onDetails: () => void;
}) {
  const pick = (fn: () => void) => () => {
    onOpenChange(false);
    fn();
  };
  const row =
    "flex w-full items-center gap-3 rounded-xl px-4 py-3.5 text-left text-[15px] font-medium text-slate-800 active:bg-slate-100 dark:text-slate-100 dark:active:bg-slate-800";
  return (
    <Drawer open={open} onOpenChange={onOpenChange} shouldScaleBackground={false}>
      <DrawerContent data-testid="dm-message-sheet" className="pb-[max(env(safe-area-inset-bottom),0.75rem)]">
        <DrawerTitle className="sr-only">Message actions</DrawerTitle>
        <div className="flex justify-center gap-2 px-4 pb-2 pt-4">
          {reactions.map((r) => (
            <button
              key={r}
              type="button"
              onClick={pick(() => onReact(r))}
              aria-label={`React with ${reactionLabel(r)}`}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-2xl active:scale-95 dark:bg-slate-800"
            >
              {reactionLabel(r)}
            </button>
          ))}
        </div>
        <div className="flex flex-col px-2 pb-1">
          <button type="button" onClick={pick(onReply)} className={row}>
            <Reply className="h-5 w-5 text-slate-500" /> Reply
          </button>
          {text !== null && (
            <button type="button" onClick={pick(() => void navigator.clipboard?.writeText(text))} className={row}>
              <Copy className="h-5 w-5 text-slate-500" /> Copy text
            </button>
          )}
          <button type="button" onClick={pick(onDetails)} className={row}>
            <Info className="h-5 w-5 text-slate-500" /> Message info
          </button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
