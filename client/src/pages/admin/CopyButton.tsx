import { useToast } from "@/hooks/use-toast";
import { copyToClipboard } from "@/lib/clipboard";
import { Copy } from "lucide-react";

export function CopyButton({ text }: { text: string }) {
  const { toast } = useToast();
  return (
    <button
      className="rounded p-1 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
      onClick={(e) => {
        e.stopPropagation();
        copyToClipboard(text);
        toast({ title: "Copied", description: text.slice(0, 20) + "...", duration: 1500 });
      }}
      data-testid="button-copy-npub"
    >
      <Copy className="h-3 w-3 text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300" />
    </button>
  );
}
