import { Link, useLocation } from "wouter";
import { MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDmBadge } from "@/hooks/useDirectMessages";

/** The badge on the Messages entry: a count, or a dot for arrivals still sealed. */
export function DmBadge({ className }: { className?: string }) {
  const { count, sealed } = useDmBadge();
  if (!count && !sealed) return null;
  return (
    <span
      className={cn(
        "absolute inline-flex items-center justify-center rounded-full bg-brand-primary font-bold text-white ring-2 ring-white dark:ring-slate-950",
        count ? "h-[17px] min-w-[17px] px-1 text-[10px]" : "h-2.5 w-2.5",
        className,
      )}
      data-testid="dm-badge"
    >
      {count ? (count > 99 ? "99+" : count) : null}
    </span>
  );
}

/** Messages, in the signed-in header. */
export function MessagesNavButton() {
  const [location] = useLocation();
  const active = location.startsWith("/messages");
  return (
    <Link
      href="/messages"
      aria-label="Messages"
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative hidden h-10 w-10 items-center justify-center rounded-xl transition-colors md:inline-flex",
        active
          ? "bg-brand-primary/[0.09] text-brand-primary dark:text-brand-link"
          : "text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white",
      )}
      data-testid="nav-messages"
    >
      <MessageCircle className="h-5 w-5" />
      <DmBadge className="right-1 top-1" />
    </Link>
  );
}
