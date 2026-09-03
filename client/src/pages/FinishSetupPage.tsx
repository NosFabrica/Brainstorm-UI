import type { ComponentType, ReactNode } from "react";
import { useLocation } from "wouter";
import { ArrowRight, Check, ChevronRight, PenLine, UserPlus } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { SectionHeader } from "@/components/ui/section-header";
import { logout } from "@/accounts/login-flow";
import { useActiveAccountDisplay } from "@/hooks/useActiveAccountDisplay";
import { useFinishSetup } from "@/hooks/useFinishSetup";
import { useScoringStatus } from "@/hooks/useScoringStatus";

/**
 * /setup — the "Finish setting up your account" checklist hub. Replaces the
 * linear Profile → Follow → Backup wizard: the two things that actually gate a
 * working Brainstorm account (a follow list to score, a kind-10040 so other
 * apps can find the scores) are surfaced as jump-off cards, and everything
 * else (profile photo, backup) lives on in Settings and its own prompts,
 * off the critical path.
 *
 * Every "Finish setup" surface (header banner, dashboard card) lands here, and
 * both action rows come back here when they're done, so progress is always
 * visible in one place.
 */

function DoneRow({ label, detail, testid }: { label: string; detail: ReactNode; testid: string }) {
  return (
    <div
      className="flex items-start gap-3.5 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
      data-testid={testid}
    >
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-500">
        <Check className="h-4 w-4 text-white" strokeWidth={3} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[15px] font-semibold text-slate-400 dark:text-slate-500">{label}</div>
        <div className="mt-0.5 text-[13px] text-slate-400 dark:text-slate-500">{detail}</div>
      </div>
      <Chip tone="success" size="sm" className="shrink-0 uppercase tracking-wide">
        Done
      </Chip>
    </div>
  );
}

function PendingRow({
  label,
  badge,
  detail,
  icon: Icon,
  onClick,
  testid,
}: {
  label: string;
  badge: string;
  detail: string;
  icon: ComponentType<{ className?: string }>;
  onClick: () => void;
  testid: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-start gap-3.5 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition-all hover:-translate-y-px hover:border-brand-accent/45 hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40 dark:border-slate-800 dark:bg-slate-900"
      data-testid={testid}
    >
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-brand-primary bg-brand-primary/10">
        <Icon className="h-3.5 w-3.5 text-brand-primary dark:text-brand-link" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-[15px] font-bold text-slate-900 dark:text-slate-100">{label}</span>
          <Chip tone="amber" size="sm" className="uppercase tracking-wide">
            {badge}
          </Chip>
        </span>
        <span className="mt-1 block text-[13px] leading-relaxed text-slate-500 dark:text-slate-400">{detail}</span>
      </span>
      <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-slate-400" />
    </button>
  );
}

export default function FinishSetupPage() {
  const [, navigate] = useLocation();
  const user = useActiveAccountDisplay();
  const { followDone, followCount, activateDone, doneCount, allDone } = useFinishSetup();
  const { isCalculating } = useScoringStatus();

  if (!user) return null;

  // A value gate can thread its destination through login → here (LoginPage
  // sends new accounts to /setup?next=…); honour it once everything's done.
  const nextPath = (() => {
    try {
      const n = new URLSearchParams(window.location.search).get("next");
      if (n && n.startsWith("/") && !n.startsWith("//") && n !== "/login" && n !== "/setup") return n;
    } catch {
      /* ignore */
    }
    return null;
  })();

  const goFollow = () => navigate("/welcome?next=/setup");

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-slate-950 dark:to-slate-900">
      <AppHeader user={user} onLogout={() => { logout(); navigate("/"); }} />

      <main className="mx-auto max-w-2xl px-4 pb-28 pt-8 sm:px-6 sm:pt-10">
        <SectionHeader kicker="Finish setting up" className="mb-4" />
        <h1
          className="text-3xl font-bold leading-[1.1] tracking-tight text-slate-900 dark:text-slate-100 sm:text-4xl"
          style={{ fontFamily: "var(--font-display)" }}
          data-testid="text-finish-setup-title"
        >
          Finish setting up <span className="text-brand-link">your account</span>.
        </h1>

        <div className="mt-7">
          <span className="text-xs font-bold tabular-nums text-slate-600 dark:text-slate-300" data-testid="text-finish-setup-progress">
            {doneCount} of 3 complete
          </span>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
            <div
              className="h-full rounded-full bg-gradient-to-r from-brand-primary to-brand-accent transition-all duration-500"
              style={{ width: `${Math.round((doneCount / 3) * 100)}%` }}
            />
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-3">
          <DoneRow
            label="Create your account"
            detail={`You're signed in as ${user.displayName || "yourself"}.`}
            testid="setup-row-account"
          />

          {followDone ? (
            <DoneRow
              label="Create your follow list"
              detail={
                <>
                  {followCount} {followCount === 1 ? "account" : "accounts"} followed ·{" "}
                  <button
                    type="button"
                    onClick={goFollow}
                    className="font-semibold text-brand-link hover:underline"
                    data-testid="setup-edit-follows"
                  >
                    Edit list
                  </button>
                </>
              }
              testid="setup-row-follow-done"
            />
          ) : (
            <PendingRow
              label="Create your follow list"
              badge="Required for scoring"
              detail="Your trust scores are built from who you follow — without at least one follow, there's nothing to calculate."
              icon={UserPlus}
              onClick={goFollow}
              testid="setup-row-follow"
            />
          )}

          {activateDone ? (
            <DoneRow
              label="Activate your Brainstorm account"
              detail="Other apps can now find your scores."
              testid="setup-row-activate-done"
            />
          ) : (
            <PendingRow
              label="Activate your Brainstorm account"
              badge="Required for other apps"
              detail="One signature publishes your Treasure Map so other apps know where to find your scores. Takes a few seconds."
              icon={PenLine}
              onClick={() => navigate("/setup/activate")}
              testid="setup-row-activate"
            />
          )}
        </div>

        {allDone && (
          <Card accent className="mt-5 p-6 text-center" data-testid="card-setup-all-done">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-emerald-500">
              <Check className="h-6 w-6 text-white" strokeWidth={3} />
            </span>
            <h2
              className="mt-3 text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100"
              style={{ fontFamily: "var(--font-display)" }}
            >
              You're all set!
            </h2>
            <p className="mt-1.5 text-[13px] leading-relaxed text-slate-500 dark:text-slate-400">
              {isCalculating
                ? "Your scores are calculating — usually about 5 minutes — and other apps can find them as soon as they're published."
                : "Other apps can now find your Brainstorm scores."}
            </p>
            <button
              type="button"
              onClick={() => navigate(nextPath ?? "/dashboard")}
              className="mt-4 inline-flex h-11 items-center gap-2 rounded-xl bg-brand-primary px-6 text-[13px] font-bold text-white shadow-lg shadow-brand-primary/20 transition-colors hover:bg-brand-primary-hover"
              data-testid="button-setup-done"
            >
              {nextPath ? "Continue" : "Go to your dashboard"}
              <ArrowRight className="h-4 w-4" />
            </button>
          </Card>
        )}
      </main>
    </div>
  );
}
