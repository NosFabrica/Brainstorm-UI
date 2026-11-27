import { CompromisedCard } from "@/components/admin/compromised/CompromisedCard";

/** The Compromised tab: accounts whose keys are known to be compromised. */
export function CompromisedTab() {
  return (
    <div className="grid grid-cols-1 gap-6" data-testid="panel-compromised">
      <div className="overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-sm dark:shadow-none">
        <CompromisedCard active />
      </div>
    </div>
  );
}
