import { useState } from "react";
import { Link } from "wouter";
import { X, UserPlus, Check, Loader2, Users, ArrowRight, ShieldCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useNewJoiners } from "@/hooks/useNewJoiners";
import { useActiveAccountDisplay } from "@/hooks/useActiveAccountDisplay";
import { ShareProfileModal } from "@/components/ShareProfileModal";
import { nip19 } from "nostr-tools";
import type { NewJoiner } from "@/services/inviteAcceptance";
import { accountKey } from "@/lib/accountStorage";

const DEMO_PK = "d0a1b2c3d4e5f60718293a4b5c6d7e8f90112233445566778899aabbccddeeff";
function isDemo(): boolean {
  try {
    return localStorage.getItem("brainstorm_invite_demo") === "true";
  } catch {
    return false;
  }
}

function initials(j: NewJoiner): string {
  const src = j.name || j.npub;
  return src.replace(/^npub1/, "").slice(0, 2).toUpperCase();
}
function label(j: NewJoiner): string {
  return j.name || `${j.npub.slice(0, 10)}…${j.npub.slice(-4)}`;
}
function Avatar({ j, size = "h-9 w-9" }: { j: NewJoiner; size?: string }) {
  return j.picture ? (
    <img src={j.picture} alt="" width={40} height={40} loading="lazy" className={`${size} rounded-full object-cover ring-1 ring-slate-200 dark:ring-slate-800 shrink-0`} />
  ) : (
    <div className={`${size} rounded-full bg-brand-primary/10 dark:bg-brand-primary/20 text-brand-link dark:text-brand-link text-xs font-bold flex items-center justify-center shrink-0`}>{initials(j)}</div>
  );
}

const cardShell =
  "relative w-full max-w-3xl mx-auto mt-6 sm:mt-8 overflow-hidden rounded-2xl border border-brand-accent/25 bg-gradient-to-br from-brand-deep/[0.04] to-brand-accent/[0.06] shadow-sm";

/**
 * Home "someone just joined & followed you" card + its premium payoff and growth
 * loop. Three states: (1) newcomers to welcome back, (2) a "you're now mutually
 * connected" payoff after welcoming, and (3) an empty-state invite CTA that turns
 * the surface into a two-way growth engine. Rows link to profiles (vet before
 * following). Data/gating via useNewJoiners.
 */
export function WelcomeBackCard() {
  const { joiners, welcomeBack, dismiss, busy, established } = useNewJoiners();
  const { toast } = useToast();
  const [welcomed, setWelcomed] = useState<NewJoiner[]>([]);

  const doWelcome = async (people: NewJoiner[]) => {
    setWelcomed((prev) => [...prev, ...people.filter((p) => !prev.some((w) => w.pubkey === p.pubkey))]);
    await welcomeBack(people.map((p) => p.pubkey));
    toast({
      title: people.length > 1 ? `Welcomed ${people.length} people back` : `Welcomed ${people[0].name || "them"} back`,
      description: "Refreshing your scores…",
    });
  };

  // 1) Newcomers to welcome back.
  if (joiners.length) {
    const many = joiners.length > 1;
    return (
      <div className={cardShell} data-testid="card-welcome-back">
        <div className="relative p-5 sm:p-6">
          <button type="button" onClick={() => dismiss(joiners.map((j) => j.pubkey))} className="absolute top-0 right-0 h-9 w-9 rounded-lg flex items-center justify-center text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" aria-label="Dismiss" data-testid="button-welcome-back-dismiss">
            <X className="h-4 w-4" />
          </button>

          <div className="flex items-center gap-2.5 mb-2">
            <span className="text-[11px] font-mono font-bold tracking-[0.25em] text-brand-link dark:text-brand-link uppercase">Your invites</span>
          </div>
          <h3 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight" style={{ fontFamily: "var(--font-display)" }} data-testid="text-welcome-back-title">
            {many ? `${joiners.length} people just joined` : `${joiners[0].name || "Someone"} just joined`}
          </h3>
          <p className="mt-1.5 text-[15px] text-slate-700 dark:text-slate-200 leading-relaxed max-w-xl">
            They followed you when they joined — welcome them back and grow your networks together.
          </p>

          <ul className="mt-4 space-y-2">
            {joiners.map((j) => (
              <li key={j.pubkey} className="flex items-center gap-3 rounded-xl bg-white/70 dark:bg-slate-900/70 border border-slate-100 dark:border-slate-800/60 px-3 py-2" data-testid={`joiner-row-${j.pubkey}`}>
                <Link href={`/p/${j.npub}`} className="flex items-center gap-3 min-w-0 flex-1 group" title={`View ${label(j)}'s profile`}>
                  <Avatar j={j} />
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate group-hover:text-brand-deep transition-colors">{label(j)}</div>
                    <div className="text-xs text-emerald-600 inline-flex items-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Just joined Brainstorm
                    </div>
                  </div>
                </Link>
                <button type="button" onClick={() => doWelcome([j])} disabled={busy} className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-brand-accent/40 bg-white px-2.5 py-1.5 text-xs font-semibold text-brand-deep hover:bg-brand-accent/[0.06] disabled:opacity-50 transition-colors" data-testid={`joiner-follow-${j.pubkey}`}>
                  <UserPlus className="h-3.5 w-3.5" /> Follow back
                </button>
                <button type="button" onClick={() => dismiss([j.pubkey])} className="shrink-0 h-7 w-7 rounded-md flex items-center justify-center text-slate-300 dark:text-slate-600 hover:text-slate-500 dark:hover:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" aria-label={`Dismiss ${label(j)}`}>
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>

          <button type="button" onClick={() => doWelcome(joiners)} disabled={busy} className="mt-4 w-full sm:w-auto inline-flex items-center justify-center gap-1.5 rounded-lg bg-brand-primary hover:bg-brand-primary-hover px-4 h-10 text-sm font-semibold text-white shadow-sm disabled:opacity-60 transition-colors" data-testid="button-welcome-back-all">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {many ? `Welcome them back (${joiners.length})` : "Welcome them back"}
          </button>
        </div>
      </div>
    );
  }

  // 2) Payoff — you're now mutually connected (scores refresh in the background).
  if (welcomed.length) {
    const n = welcomed.length;
    return (
      <div className={cardShell} data-testid="card-welcome-back-success">
        <div className="relative p-5 sm:p-6">
          <button type="button" onClick={() => setWelcomed([])} className="absolute top-0 right-0 h-9 w-9 rounded-lg flex items-center justify-center text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" aria-label="Dismiss" data-testid="button-welcome-success-done">
            <X className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-2.5 mb-2">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            <span className="text-[11px] font-mono font-bold tracking-[0.25em] text-emerald-700 uppercase">Your network</span>
          </div>
          <h3 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
            You're now mutually connected
          </h3>
          <p className="mt-1.5 text-[15px] text-slate-700 dark:text-slate-200 leading-relaxed max-w-xl">
            {n === 1 ? "1 new person is" : `${n} new people are`} in your network now — your scores are refreshing.
          </p>
          <div className="mt-4 flex items-center gap-2">
            <div className="flex -space-x-2">
              {welcomed.slice(0, 6).map((j) => (
                <div key={j.pubkey} className="ring-2 ring-white dark:ring-slate-900 rounded-full">
                  <Avatar j={j} size="h-9 w-9" />
                </div>
              ))}
            </div>
            {n > 6 && <span className="text-sm font-semibold text-slate-500 dark:text-slate-400">+{n - 6}</span>}
          </div>
          <button type="button" onClick={() => setWelcomed([])} className="mt-5 inline-flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 h-9 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
            Done
          </button>
        </div>
      </div>
    );
  }

  // 3) Empty state → growth-loop invite CTA (established senders, dismissible).
  if (established) return <InviteCta />;

  return null;
}

/** Empty-state growth loop: prompt the sender to invite more people. */
function InviteCta() {
  const user = useActiveAccountDisplay();
  const demo = isDemo();
  // Real logged-in sender; in QA-demo (no session) fall back to a placeholder id.
  const npub = user?.npub || (demo ? nip19.npubEncode(DEMO_PK) : "");
  const pubkey = user?.pubkey || (demo ? DEMO_PK : "");
  const displayName = user?.displayName || (demo ? "Demo Sender" : "You");
  const dismissFlag = pubkey ? accountKey("brainstorm_invite_cta_dismissed", pubkey) : "";
  const [dismissed, setDismissed] = useState(() => {
    try {
      return !!dismissFlag && localStorage.getItem(dismissFlag) === "true";
    } catch {
      return false;
    }
  });
  const [open, setOpen] = useState(false);

  if (!npub || dismissed) return null;
  const inviteUrl = typeof window !== "undefined" ? `${window.location.origin}/p/${npub}` : "";

  const handleDismiss = () => {
    try {
      if (dismissFlag) localStorage.setItem(dismissFlag, "true");
    } catch {
      /* ignore */
    }
    setDismissed(true);
  };

  return (
    <div className={cardShell} data-testid="card-invite-cta">
      <div className="relative p-5 sm:p-6">
        <button type="button" onClick={handleDismiss} className="absolute top-0 right-0 h-9 w-9 rounded-lg flex items-center justify-center text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" aria-label="Dismiss" data-testid="button-invite-cta-dismiss">
          <X className="h-4 w-4" />
        </button>
        <div className="flex items-center gap-2.5 mb-2">
          <span className="text-[11px] font-mono font-bold tracking-[0.25em] text-brand-link dark:text-brand-link uppercase">Grow your network</span>
        </div>
        <h3 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
          Grow your network
        </h3>
        <p className="mt-1.5 text-[15px] text-slate-700 leading-relaxed max-w-xl">
          Invite friends — when they join and follow you, they'll show up here to welcome back.
        </p>
        <button type="button" onClick={() => setOpen(true)} className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-brand-primary hover:bg-brand-primary-hover px-4 h-10 text-sm font-semibold text-white shadow-sm transition-colors" data-testid="button-invite-friends">
          <Users className="h-4 w-4" /> Invite friends
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>

      <ShareProfileModal
        open={open}
        onOpenChange={setOpen}
        invite
        npub={npub}
        displayName={displayName}
        picture={user?.picture}
        nip05={user?.nip05}
        canonicalUrl={inviteUrl}
      />
    </div>
  );
}
