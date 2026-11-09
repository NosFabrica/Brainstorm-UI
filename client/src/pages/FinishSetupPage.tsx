import { useRef, useState, type ComponentType, type ReactNode } from "react";
import { useLocation } from "wouter";
import {
  ArrowLeftRight,
  ArrowRight,
  BarChart3,
  Bot,
  Check,
  ChevronRight,
  PenLine,
  Share2,
  UserPlus,
  UserRoundPen,
  Users,
} from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { ProfileEditSheet } from "@/components/ProfileEditSheet";
import { uploadProfileImage } from "@/components/ImageUpload";
import { updateProfileField } from "@/services/profileQuickEdit";
import { isUnlockCancelled } from "@/accounts/local-signer";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { SectionHeader } from "@/components/ui/section-header";
import { logout } from "@/accounts/login-flow";
import { useActiveAccountDisplay } from "@/hooks/useActiveAccountDisplay";
import { useBrainstormAssistant } from "@/hooks/useBrainstormAssistant";
import { useFinishSetup } from "@/hooks/useFinishSetup";
import { useLiveProfile } from "@/hooks/useLiveProfile";
import { useRankProvider } from "@/hooks/useRankProvider";
import { useScoringStatus } from "@/hooks/useScoringStatus";
import { ListsUpdateLine } from "@/components/ListsUpdate";
import { signalLabel } from "@/lib/nip85Declaration";
import { MessagesSetupRow } from "@/components/messages/MessagesSetupRow";

/**
 * /setup, in two moods (2026-11-09):
 *
 * - **While something's left**, a checklist of only that: the follow list and
 *   activation, the two things the user does. What's done folds into one
 *   "N done" line instead of a wall of grey cards.
 * - **Once nothing is**, "Your account": plain status lines — signed in, your
 *   network, sharing your scores, your Assistant, private messages — one
 *   action each, no badges, no progress bar.
 *
 * The Assistant's own steps (its profile, Duty Menu and Treasure Map) are the
 * app's to do (components/AutoAssistantSetup) and never rows: one it couldn't
 * finish is a single line to finish it by hand. Their details live behind
 * "Advanced", in Settings › Assistants.
 *
 * Every "Finish setup" surface (header banner, dashboard card, account menu)
 * lands here.
 */

/** "Reporters, Muters and Hops" — a list as a sentence says it. */
function listOf(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** Settings › Assistants, Yours: the Assistant's card, and the way into its details. */
const YOUR_ASSISTANT_PATH = "/settings?tab=assistants";

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

/**
 * The optional extra for a Treasure Map that gives the rank duty to another
 * Assistant: hand it to their Brainstorm Assistant. /setup/activate does the
 * publish, behind its "replace" warning.
 */
function ScoresSwitchRow({ onSwitch, providerName }: { onSwitch: () => void; providerName: string }) {
  return (
    <Card
      className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:gap-3.5"
      data-testid="setup-row-scores-switch"
    >
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-brand-primary bg-brand-primary/10">
        <ArrowLeftRight className="h-3.5 w-3.5 text-brand-primary dark:text-brand-link" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-bold text-slate-900 dark:text-slate-100">
          Use your Brainstorm Assistant for scores
        </span>
        <span className="mt-1 block text-[13px] leading-relaxed text-slate-500 dark:text-slate-400">
          Your scores come from {providerName} today. One signature moves that to your Brainstorm Assistant.
        </span>
      </span>
      <Button size="sm" onClick={onSwitch} data-testid="setup-scores-switch">
        Switch
      </Button>
    </Card>
  );
}

/**
 * Who they are, at the top of "Your account": banner (or the Aurora gradient
 * until they add one), photo, name, verified handle and bio. "Edit profile"
 * opens the whole form beside the page. While a photo, banner or bio is
 * missing, one optional line offers each, added in place: a photo or banner
 * straight from their files, a bio in a box right here. Never a step.
 */
function AccountIdentity({
  pubkey,
  name,
  picture,
  banner,
  about,
  nip05,
  onEdit,
}: {
  pubkey: string;
  name: string;
  picture?: string;
  banner?: string;
  about?: string;
  nip05?: string;
  onEdit: () => void;
}) {
  const photoInput = useRef<HTMLInputElement>(null);
  const bannerInput = useRef<HTMLInputElement>(null);
  const [writingBio, setWritingBio] = useState(false);
  const [bio, setBio] = useState("");
  const [saving, setSaving] = useState<null | "picture" | "banner" | "about">(null);
  const [error, setError] = useState<string | null>(null);
  // What they just added shows at once, before the relays echo it back.
  const [added, setAdded] = useState<{ picture?: string; banner?: string; about?: string }>({});
  const shown = { picture: added.picture ?? picture, banner: added.banner ?? banner, about: added.about ?? about };

  const save = async (field: "picture" | "banner" | "about", value: string) => {
    setSaving(field);
    setError(null);
    const res = await updateProfileField(pubkey, field, value);
    setSaving(null);
    if (res.cancelled) return false;
    if (!res.success) {
      setError(`Couldn't save — ${res.error || "please try again."}`);
      return false;
    }
    setAdded((a) => ({ ...a, [field]: value }));
    return true;
  };

  const onImage = async (field: "picture" | "banner", file: File | undefined) => {
    if (!file) return;
    setSaving(field);
    setError(null);
    try {
      const url = await uploadProfileImage(file, field === "picture" ? "square" : "banner");
      await save(field, url);
    } catch (err) {
      setSaving(null);
      if (!isUnlockCancelled(err)) setError("Couldn't upload that image — please try another.");
    }
  };

  const missing = [
    !shown.picture && { label: "Add photo", onClick: () => photoInput.current?.click() },
    !shown.banner && { label: "Add banner", onClick: () => bannerInput.current?.click() },
    !shown.about && !writingBio && { label: "Add bio", onClick: () => setWritingBio(true) },
  ].filter((m): m is { label: string; onClick: () => void } => !!m);

  return (
    <Card className="overflow-hidden p-0" data-testid="account-identity">
      <div
        className="h-24 bg-gradient-to-r from-brand-primary/80 to-brand-accent/70 bg-cover bg-center"
        style={shown.banner ? { backgroundImage: `url(${JSON.stringify(shown.banner)})` } : undefined}
        aria-hidden="true"
      />
      <div className="px-5 pb-5">
        <div className="-mt-8 flex items-end justify-between gap-3">
          <Avatar className="h-16 w-16 ring-4 ring-white dark:ring-slate-900">
            <AvatarImage src={shown.picture} alt="" />
            <AvatarFallback className="text-lg">{name.slice(0, 1).toUpperCase()}</AvatarFallback>
          </Avatar>
          <Button size="sm" variant="outline" onClick={onEdit}>
            Edit profile
          </Button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span
            className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {name}
          </span>
          <Chip tone="success" size="sm" dot>
            Account ready
          </Chip>
        </div>
        {nip05 && (
          <div className="mt-0.5 text-[13px] text-slate-500 dark:text-slate-400">{nip05.replace(/^_@/, "")}</div>
        )}
        {shown.about && (
          <p className="mt-2 line-clamp-2 text-[14px] text-slate-600 dark:text-slate-300">{shown.about}</p>
        )}

        {writingBio && (
          <div className="mt-3 flex flex-col gap-2">
            <textarea
              autoFocus
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              maxLength={500}
              rows={2}
              placeholder="A line about you"
              aria-label="Your bio"
              className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-[14px] text-slate-900 shadow-sm focus:border-brand-accent focus:outline-none focus:ring-2 focus:ring-brand-accent/30 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              data-testid="input-bio"
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                aria-label="Save bio"
                disabled={!bio.trim() || saving === "about"}
                onClick={async () => {
                  if (await save("about", bio)) setWritingBio(false);
                }}
              >
                {saving === "about" ? "Saving…" : "Save"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setWritingBio(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {missing.length > 0 && (
          <div
            className="mt-4 flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 px-3.5 py-3 dark:bg-slate-800/50"
            data-testid="profile-nudge"
          >
            <UserRoundPen className="h-4 w-4 shrink-0 text-brand-primary dark:text-brand-link" />
            <span className="mr-1 text-[13px] text-slate-600 dark:text-slate-300">
              So people recognise you <span className="text-slate-400">· optional</span>
            </span>
            {missing.map(({ label, onClick }) => (
              <button
                key={label}
                type="button"
                onClick={onClick}
                disabled={saving !== null}
                className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[12px] font-semibold text-slate-700 hover:border-brand-accent/50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              >
                {label}
              </button>
            ))}
            {(saving === "picture" || saving === "banner") && (
              <span className="text-[12px] text-slate-400">Uploading…</span>
            )}
          </div>
        )}
        {error && (
          <p role="alert" className="mt-2 text-[13px] text-red-600 dark:text-red-400">
            {error}
          </p>
        )}

        <input
          ref={photoInput}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => void onImage("picture", e.target.files?.[0])}
          data-testid="input-add-photo"
        />
        <input
          ref={bannerInput}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => void onImage("banner", e.target.files?.[0])}
          data-testid="input-add-banner"
        />
      </div>
    </Card>
  );
}

/** One of the three things the account is for, as a tile: a value, what it is, one action. */
function AccountTile({
  icon: Icon,
  value,
  label,
  action,
  testid,
}: {
  icon: ComponentType<{ className?: string }>;
  value: string;
  label: string;
  action?: { label: string; onClick: () => void };
  testid: string;
}) {
  return (
    <Card className="flex flex-col gap-1 p-4" data-testid={testid}>
      <Icon className="h-4 w-4 text-brand-primary dark:text-brand-link" />
      <span className="mt-1 truncate text-lg font-bold tabular-nums text-slate-900 dark:text-slate-100">{value}</span>
      <span className="text-[12px] text-slate-500 dark:text-slate-400">{label}</span>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="mt-1 self-start text-[12px] font-semibold text-brand-link hover:underline"
        >
          {action.label}
        </button>
      )}
    </Card>
  );
}

/** One line of "Your account": what it is, its state, and at most one action. */
function StatusLine({
  label,
  value,
  action,
  testid,
}: {
  label: string;
  value: ReactNode;
  action?: { label: string; onClick: () => void };
  testid: string;
}) {
  return (
    <div className="flex items-center gap-4 px-5 py-4" data-testid={testid}>
      <span className="w-36 shrink-0 text-[13px] font-medium text-slate-500 dark:text-slate-400">{label}</span>
      <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-slate-900 dark:text-slate-100">
        {value}
      </span>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="shrink-0 text-[13px] font-semibold text-brand-link hover:underline"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

export default function FinishSetupPage() {
  const [, navigate] = useLocation();
  const user = useActiveAccountDisplay();
  // Named wherever another Assistant holds the rank duty; "an Assistant" until known.
  const rankProvider = useRankProvider(user?.pubkey);
  const providerName = rankProvider?.name ?? "an Assistant";
  const {
    accountDone,
    accountPending,
    followDone,
    followCount,
    activateDone,
    scoresElsewhere,
    signalsPending,
    missingSignals,
    listsPending,
    dutyMenu,
    dutyMenuPending,
    treasureMap,
    treasureMapPending,
    allDone,
    messages,
  } = useFinishSetup();
  const { isCalculating } = useScoringStatus();
  const [showDone, setShowDone] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  // Who they are, and their Assistant as the identity it is: both read live.
  const own = useLiveProfile(user?.pubkey).profile;
  const { taPubkey } = useBrainstormAssistant();
  const assistant = useLiveProfile(taPubkey ?? undefined).profile;

  if (!user) return null;

  // A value gate can thread its destination through login → here; honour it once everything's done.
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
  const goActivate = () => navigate("/setup/activate");

  // An Assistant step the app couldn't finish (a failed publish, or one that
  // still reads out of date after it): one line, to the page that does it by hand.
  const unfinished = accountPending
    ? YOUR_ASSISTANT_PATH
    : dutyMenuPending
      ? "/setup/duty-menu"
      : treasureMapPending
        ? "/setup/treasure-map"
        : null;

  // What's done, folded into one line while something is left.
  const doneSteps = [
    accountDone && "Create your account",
    followDone && `Create your follow list · ${followCount} followed`,
    activateDone && "Activate your Brainstorm account",
    (dutyMenu === "current" || !dutyMenu) &&
      (treasureMap === "current" || !treasureMap) &&
      (dutyMenu || treasureMap) &&
      "Your Assistant is set up",
  ].filter((s): s is string => !!s);

  return (
    <div className="min-h-page bg-gradient-to-b from-slate-50 to-white dark:from-slate-950 dark:to-slate-900">
      <AppHeader
        user={user}
        onLogout={() => {
          logout();
          navigate("/");
        }}
        search={false}
      />

      <main className="mx-auto max-w-2xl px-4 pb-28 pt-8 sm:px-6 sm:pt-10">
        <SectionHeader kicker={allDone ? "Account" : "Finish setting up"} className="mb-4" />
        <h1
          className={
            allDone
              ? "sr-only"
              : "text-3xl font-bold leading-[1.1] tracking-tight text-slate-900 dark:text-slate-100 sm:text-4xl"
          }
          style={{ fontFamily: "var(--font-display)" }}
          data-testid="text-finish-setup-title"
        >
          {allDone ? (
            "Your account."
          ) : (
            <>
              Finish setting up <span className="text-brand-link">your account</span>.
            </>
          )}
        </h1>

        {allDone ? (
          <div className="flex flex-col gap-4" data-testid="card-account-status">
            <AccountIdentity
              pubkey={user.pubkey}
              name={own?.display_name || own?.name || user.displayName || "You"}
              picture={own?.picture || user.picture}
              banner={own?.banner}
              about={own?.about}
              nip05={own?.nip05}
              onEdit={() => setEditingProfile(true)}
            />

            <div className="grid gap-3 sm:grid-cols-3">
              <AccountTile
                icon={Users}
                value={followCount.toLocaleString()}
                label="People you follow"
                action={{ label: "Edit", onClick: goFollow }}
                testid="tile-network"
              />
              <AccountTile
                icon={BarChart3}
                value={isCalculating ? "Calculating" : "Ready"}
                label="Trust scores"
                action={{ label: "View insights", onClick: () => navigate("/network") }}
                testid="tile-scores"
              />
              <AccountTile
                icon={Share2}
                value={scoresElsewhere ? `From ${providerName}` : "On"}
                label={scoresElsewhere ? "Your scores" : "Shared with other apps"}
                action={scoresElsewhere ? { label: "Switch", onClick: goActivate } : undefined}
                testid="tile-sharing"
              />
            </div>
            {/* New Trusted Lists their Treasure Map doesn't name yet: an update, never a step. */}
            {listsPending && <ListsUpdateLine />}

            <section>
              <SectionHeader kicker="Your Assistant" className="mb-3" />
              <Card className="flex items-center gap-3.5 p-4" data-testid="account-assistant">
                <Avatar className="h-11 w-11">
                  <AvatarImage src={assistant?.picture} alt="" />
                  <AvatarFallback>
                    <Bot className="h-5 w-5 text-brand-primary" />
                  </AvatarFallback>
                </Avatar>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold text-slate-900 dark:text-slate-100">
                    {assistant?.display_name || assistant?.name || "Your Brainstorm Assistant"}
                  </span>
                  <span className="block truncate text-[13px] text-slate-500 dark:text-slate-400">
                    {assistant?.nip05 ? `${assistant.nip05} · ` : ""}Publishes your trust scores to other apps.
                  </span>
                </span>
                <Chip tone="success" size="sm" dot className="shrink-0">
                  Live
                </Chip>
                <button
                  type="button"
                  onClick={() => navigate(YOUR_ASSISTANT_PATH)}
                  className="shrink-0 text-[13px] font-semibold text-brand-link hover:underline"
                >
                  Manage
                </button>
              </Card>
            </section>

            <section>
              <SectionHeader kicker="Privacy & messages" className="mb-3" />
              <div className="flex flex-col gap-3">
                {messages === "off" && <MessagesSetupRow />}
                <Card className="divide-y divide-slate-100 p-0 dark:divide-slate-800">
                  {messages === "on" && <StatusLine label="Private messages" value="On" testid="status-messages" />}
                  <button
                    type="button"
                    onClick={() => navigate(YOUR_ASSISTANT_PATH)}
                    className="flex w-full items-center gap-4 px-5 py-4 text-left"
                    data-testid="setup-advanced"
                  >
                    <span className="w-36 shrink-0 text-[13px] font-medium text-slate-500 dark:text-slate-400">
                      Advanced
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[14px] text-slate-700 dark:text-slate-300">
                      Your Assistant's settings
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                  </button>
                </Card>
              </div>
            </section>

            {nextPath && (
              <button
                type="button"
                onClick={() => navigate(nextPath)}
                className="inline-flex items-center gap-1.5 self-end text-[13px] font-bold text-brand-link"
                data-testid="button-setup-done"
              >
                Continue <ArrowRight className="h-4 w-4" />
              </button>
            )}
            <ProfileEditSheet open={editingProfile} onOpenChange={setEditingProfile} />
          </div>
        ) : (
          <>
            <div className="mt-7 flex flex-col gap-3">
              {!followDone && (
                <PendingRow
                  label="Create your follow list"
                  badge="Required for scoring"
                  detail="Your trust scores are built from who you follow — without at least one follow, there's nothing to calculate."
                  icon={UserPlus}
                  onClick={goFollow}
                  testid="setup-row-follow"
                />
              )}

              {!activateDone &&
                (signalsPending ? (
                  // Their Map names their Assistant, but not for every score it
                  // publishes (#313): the same signature, worded as the update it is.
                  <PendingRow
                    label="Update your Treasure Map"
                    badge="Required for other apps"
                    detail={`Your Treasure Map doesn't name your Assistant for ${listOf(missingSignals.map(signalLabel))} yet, so other apps can't find those scores. One signature adds them.`}
                    icon={PenLine}
                    onClick={goActivate}
                    testid="setup-row-activate"
                  />
                ) : (
                  <PendingRow
                    label="Activate your Brainstorm account"
                    badge="Required for other apps"
                    detail="Your Treasure Map tells other apps where to find your scores. You sign it — one signature."
                    icon={PenLine}
                    onClick={goActivate}
                    testid="setup-row-activate"
                  />
                ))}
              {/* Activated already: new lists are an update, never a step to redo. */}
              {activateDone && listsPending && <ListsUpdateLine />}

              {unfinished && (
                <Card className="flex items-center gap-3 p-4" data-testid="setup-assistant-retry">
                  <Bot className="h-5 w-5 shrink-0 text-amber-500" />
                  <span className="min-w-0 flex-1 text-[13px] text-slate-600 dark:text-slate-300">
                    We couldn't finish setting up your Assistant.
                  </span>
                  <Button size="sm" variant="outline" onClick={() => navigate(unfinished)}>
                    Finish it
                  </Button>
                </Card>
              )}

              {doneSteps.length > 0 && (
                <div>
                  <button
                    type="button"
                    onClick={() => setShowDone((v) => !v)}
                    aria-expanded={showDone}
                    className="inline-flex items-center gap-1.5 text-[13px] font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400"
                    data-testid="setup-done-summary"
                  >
                    <Check className="h-4 w-4 text-emerald-500" strokeWidth={3} />
                    {doneSteps.length} done · {showDone ? "hide" : "show"}
                  </button>
                  {showDone && (
                    <ul className="mt-2 space-y-1.5 pl-6 text-[13px] text-slate-400 dark:text-slate-500">
                      {doneSteps.map((step) => (
                        <li key={step}>{step}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>

            {/* Below the steps, under their own heading: the count above is of them alone. */}
            {(scoresElsewhere || messages) && (
              <section className="mt-8" data-testid="setup-optional">
                <SectionHeader kicker="Optional" className="mb-3" />
                <div className="flex flex-col gap-3">
                  {scoresElsewhere && <ScoresSwitchRow onSwitch={goActivate} providerName={providerName} />}
                  <MessagesSetupRow />
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
