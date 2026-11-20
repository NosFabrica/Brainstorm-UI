/**
 * Mounted once for the whole app: keeps the Active Account's Routstr purchases moving
 * (services/routstrPurchase), so one paid before a reload resumes wherever the reader lands,
 * and says how it ended when the AI model page isn't the one showing it.
 */
import { useActiveAccount } from "applesauce-react/hooks";
import { toast } from "@/hooks/use-toast";
import { formatSats } from "@/lib/routstr";
import { usePurchasePoller } from "@/services/routstrPurchase";

export function RoutstrPurchaseHost() {
  const pubkey = useActiveAccount()?.pubkey ?? null;
  usePurchasePoller(pubkey, (record, outcome) => {
    if (outcome === "saved")
      toast({ title: "Routstr key saved", description: `At ${record.nodeName ?? record.node}.` });
    else if (outcome === "topped-up") toast({ title: `Topped up ${formatSats(record.amountSats)}` });
    else if (outcome === "unsaved") {
      toast({
        title: "Your key was bought but not saved yet",
        description: "Retry it in Settings › Assistants › AI model.",
        variant: "destructive",
      });
    }
  });
  return null;
}
