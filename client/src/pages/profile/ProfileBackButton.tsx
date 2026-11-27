import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useGoBack } from "@/hooks/useGoBack";

/** Back to where the visit came from: the admin console, or wherever Back goes. */
export function ProfileBackButton({ fromAdmin }: { fromAdmin: string | null }) {
  const goBack = useGoBack();
  if (fromAdmin) {
    const fallback = `/admin?tab=users${fromAdmin !== "1" ? `&highlight=${fromAdmin}` : ""}`;
    return (
      <Button
        variant="ghost"
        size="sm"
        className="no-default-hover-elevate no-default-active-elevate -ml-1 gap-2 text-slate-500 hover:bg-amber-50/60 hover:text-amber-700 dark:text-slate-400 dark:hover:bg-amber-500/10 dark:hover:text-amber-300"
        onClick={() => goBack(fallback)}
        data-testid="button-back-to-admin"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Admin
      </Button>
    );
  }
  return (
    <Button
      variant="ghost"
      size="sm"
      className="no-default-hover-elevate no-default-active-elevate -ml-1 gap-2 text-slate-500 hover:bg-brand-primary/10 hover:text-brand-primary dark:text-slate-400 dark:hover:bg-brand-primary/10 dark:hover:text-brand-link"
      onClick={() => goBack("/")}
      data-testid="button-back-to-search"
    >
      <ArrowLeft className="h-4 w-4" />
      Back
    </Button>
  );
}
