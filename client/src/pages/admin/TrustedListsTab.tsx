import { TrustedListsCard } from "@/components/admin/trusted-lists/TrustedListsCard";

/** The Trusted Lists tab, opened on the person the Users tab's "Publish trusted lists" sent, if any. */
export function TrustedListsTab({ observer }: { observer: string | null }) {
  return (
    <div className="grid grid-cols-1 gap-6" data-testid="panel-trusted-lists">
      {/* Keyed on the person sent, so a new shortcut starts fresh. */}
      <TrustedListsCard key={observer ?? "picker"} initialObserver={observer ?? undefined} />
    </div>
  );
}
