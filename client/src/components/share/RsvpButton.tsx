/**
 * "I'm going" — the one thing you'd do next with an upcoming event, kept on
 * Nostr. Publishes a NIP-52 RSVP under the reader's key, reads it back on
 * later visits ("Going"), and a second tap withdraws it. Signed out it is
 * the sign-in door; the event's own host never sees it. Sits inside rows
 * that are links, so every tap stops there.
 */
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { CalendarCheck, CalendarPlus, Loader2 } from "lucide-react";
import { useActiveAccountDisplay } from "@/hooks/useActiveAccountDisplay";
import { fetchMyRsvp, forgetMyRsvp, publishRsvp, withdrawRsvp, type MyRsvp } from "@/services/rsvp";

type CalendarLike = { id: string; kind: number; pubkey: string; tags: string[][] };

export function RsvpButton({ event, size = "sm", className = "" }: { event: CalendarLike; size?: "sm" | "md"; className?: string }) {
  const viewer = useActiveAccountDisplay();
  const [, setLocation] = useLocation();
  const [mine, setMine] = useState<MyRsvp | null>(null);
  const [busy, setBusy] = useState(false);
  const me = viewer?.pubkey ?? null;

  useEffect(() => {
    setMine(null);
    if (!me || me === event.pubkey) return;
    let alive = true;
    void fetchMyRsvp(event, me).then((r) => {
      if (alive) setMine(r);
    });
    return () => {
      alive = false;
    };
  }, [me, event]);

  if (me && me === event.pubkey) return null;
  const going = !!mine && mine.status === "accepted";

  const onTap = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!me) {
      setLocation("/login");
      return;
    }
    if (busy) return;
    setBusy(true);
    try {
      if (going && mine) {
        const res = await withdrawRsvp(mine);
        if (res.success) {
          forgetMyRsvp(event, me);
          setMine(null);
        }
      } else {
        const res = await publishRsvp(event, "accepted");
        if (res.success && res.event) {
          forgetMyRsvp(event, me);
          setMine({ id: res.event.id, d: res.event.tags.find((t) => t[0] === "d")?.[1] ?? "", status: "accepted" });
        }
      }
    } finally {
      setBusy(false);
    }
  };

  const base =
    size === "md"
      ? "inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40"
      : "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40";
  const tone = going
    ? "border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
    : size === "md"
      ? "bg-brand-primary text-white hover:bg-brand-primary-hover"
      : "border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-brand-deep dark:text-brand-link hover:border-brand-accent/40 hover:bg-brand-primary/5";
  const Icon = busy ? Loader2 : going ? CalendarCheck : CalendarPlus;
  return (
    <button
      type="button"
      onClick={onTap}
      disabled={busy}
      aria-pressed={going}
      title={going ? "You're going — tap to withdraw" : me ? "RSVP on Nostr" : "Sign in to RSVP"}
      className={`${base} ${tone} disabled:opacity-70 ${className}`}
      data-testid="event-rsvp"
    >
      <Icon className={`${size === "md" ? "h-4 w-4" : "h-3 w-3"} ${busy ? "animate-spin" : ""}`} />
      {going ? "Going" : "I'm going"}
    </button>
  );
}
