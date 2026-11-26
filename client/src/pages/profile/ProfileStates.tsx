/** What the analytics profile shows before its result: loading, not found, or the search hit's seed. */
import { Loader2, User } from "lucide-react";
import { useLocation } from "wouter";
import type { NostrEvent } from "nostr-tools";
import type { ProfileContent } from "applesauce-core/helpers/profile";
import { BrainLogo } from "@/components/BrainLogo";
import { useTierRing } from "@/components/score/VerificationCoin";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmojiText } from "@/components/ui/custom-emoji";

export function ProfileSkeleton() {
  return (
    <div data-testid="panel-profile-skeleton">
      <Card className="overflow-hidden rounded-xl border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
        <div className="animate-pulse p-6 sm:p-8">
          <div className="flex items-start gap-4">
            <div className="h-14 w-14 shrink-0 rounded-full bg-slate-200 dark:bg-slate-700" />
            <div className="flex-1 space-y-2.5 pt-1">
              <div className="h-4 w-36 rounded bg-slate-200 dark:bg-slate-700" />
              <div className="h-3 w-48 rounded bg-slate-100 dark:bg-slate-800" />
            </div>
          </div>
          <div className="mt-5 space-y-2">
            <div className="h-3 w-full rounded bg-slate-100 dark:bg-slate-800" />
            <div className="h-3 w-3/4 rounded bg-slate-100 dark:bg-slate-800" />
          </div>
          <div className="mt-5 grid grid-cols-3 gap-3">
            <div className="h-16 rounded-xl bg-slate-100 dark:bg-slate-800" />
            <div className="h-16 rounded-xl bg-slate-100 dark:bg-slate-800" />
            <div className="h-16 rounded-xl bg-slate-100 dark:bg-slate-800" />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="h-12 rounded-xl bg-slate-50 dark:bg-slate-900" />
            <div className="h-12 rounded-xl bg-slate-50 dark:bg-slate-900" />
          </div>
        </div>
      </Card>
    </div>
  );
}

export function ProfileErrorCard({ loadError }: { loadError: string }) {
  const [, navigate] = useLocation();
  return (
    <div style={{ animation: "profileFadeIn 0.7s cubic-bezier(0.16, 1, 0.3, 1) both" }}>
      <Card
        className="relative overflow-hidden rounded-xl border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-none"
        data-testid="card-profile-error"
      >
        <div className="flex flex-col items-start gap-6 p-7 sm:flex-row sm:p-8">
          <div className="relative">
            <div className="absolute -inset-1 rounded-2xl bg-gradient-to-br from-brand-primary/[0.4] to-brand-primary/25 opacity-70 blur-md" />
            <div
              className="relative flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-brand-primary shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:text-brand-link dark:shadow-none sm:h-16 sm:w-16"
              data-testid="icon-profile-error"
            >
              <User className="h-6 w-6" />
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Profile</p>
            <h3
              className="text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-xl"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Profile not found
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">{loadError}</p>
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <Button
                type="button"
                onClick={() => navigate("/")}
                className="h-10 rounded-xl bg-brand-primary px-4 text-xs font-bold tracking-wide text-white shadow-sm hover:bg-brand-primary-hover"
                data-testid="button-profile-new-search"
              >
                New Search
              </Button>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

/** The search hit's name and picture while the backend result loads. */
export function ProfileSeedPreview({
  houseInfluence01,
  displayNostrProfile,
  displayNpub,
  emojiTags,
}: {
  houseInfluence01: number | null;
  displayNostrProfile: ProfileContent | null;
  displayNpub: string;
  emojiTags: NostrEvent | undefined;
}) {
  const tierRing = useTierRing();
  return (
    <div data-testid="card-profile-seed-preview">
      <Card className="relative overflow-hidden rounded-2xl border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
        <div className="p-5 sm:p-6">
          <div className="mb-4 flex items-start gap-3 sm:gap-4">
            <Avatar
              className={`h-12 w-12 shrink-0 border-2 border-brand-primary/15 shadow-md dark:border-brand-primary/25 sm:h-16 sm:w-16 ${tierRing(houseInfluence01) ?? ""}`}
            >
              {displayNostrProfile?.picture && (
                <AvatarImage
                  size="lg"
                  src={displayNostrProfile.picture}
                  alt={displayNostrProfile?.display_name || displayNostrProfile?.name || "Profile"}
                  className="object-cover"
                />
              )}
              <AvatarFallback className="bg-brand-primary/10 text-base font-bold text-brand-primary dark:bg-brand-primary/10 dark:text-brand-link sm:text-lg">
                {(displayNostrProfile?.display_name || displayNostrProfile?.name || displayNpub.slice(0, 2))
                  .charAt(0)
                  .toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3
                      className="truncate text-base font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-xl"
                      style={{ fontFamily: "var(--font-display)" }}
                      data-testid="text-profile-title-seed"
                    >
                      <EmojiText
                        text={
                          displayNostrProfile?.display_name ||
                          displayNostrProfile?.name ||
                          displayNpub.slice(0, 18) + "..."
                        }
                        tags={emojiTags}
                      />
                    </h3>
                    <Badge
                      variant="secondary"
                      className="border border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400"
                    >
                      <Loader2 className="mr-1 h-2.5 w-2.5 animate-spin" />
                      Loading
                    </Badge>
                  </div>
                  {displayNostrProfile?.nip05 && (
                    <p className="mt-0.5 truncate text-xs font-medium text-brand-primary">
                      {displayNostrProfile.nip05}
                    </p>
                  )}
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <code className="max-w-[120px] truncate font-mono text-xs text-slate-400 dark:text-slate-500 sm:max-w-[300px]">
                      {displayNpub}
                    </code>
                  </div>
                </div>
                <div
                  className="flex shrink-0 flex-col items-center gap-0.5 rounded-xl border border-brand-primary/20 bg-brand-primary/10 px-2 py-1.5 backdrop-blur-sm dark:border-brand-primary/25 dark:bg-brand-primary/10 sm:px-3 sm:py-2"
                  data-testid="badge-trust-score-seed"
                  aria-label="Brainstorm Verification Score loading"
                >
                  <div className="flex items-center gap-1">
                    <BrainLogo size={8} className="text-brand-link sm:hidden" />
                    <BrainLogo size={10} className="hidden text-brand-link sm:block" />
                    <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-brand-link">
                      Brainstorm
                    </span>
                  </div>
                  <div className="relative flex h-10 w-10 items-center justify-center sm:h-12 sm:w-12">
                    <svg className="absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 44 44">
                      <circle
                        cx="22"
                        cy="22"
                        r="18"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        className="text-brand-link dark:text-brand-primary/20"
                      />
                    </svg>
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-brand-link sm:h-4 sm:w-4" />
                  </div>
                  <div className="h-3 w-12 animate-pulse rounded bg-brand-primary/15 dark:bg-brand-primary/20" />
                </div>
              </div>
            </div>
          </div>
          {displayNostrProfile?.about && (
            <p
              className="mb-4 line-clamp-3 text-xs leading-relaxed text-slate-500 dark:text-slate-400"
              style={{ overflowWrap: "anywhere", wordBreak: "break-word" }}
            >
              <EmojiText text={displayNostrProfile.about} tags={emojiTags} />
            </p>
          )}
          <div className="animate-pulse space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div className="h-14 rounded-xl bg-slate-100 dark:bg-slate-800" />
              <div className="h-14 rounded-xl bg-slate-100 dark:bg-slate-800" />
              <div className="h-14 rounded-xl bg-slate-100 dark:bg-slate-800" />
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
