/**
 * The identity's action bar: Follow (primary), Message, search their posts,
 * the public page, Zap and a menu with Share, Mute and Report — or, for
 * yourself or a visitor, just search, the public page, Zap and Share.
 */
import { useState } from "react";
import { useLocation } from "wouter";
import type { ProfileContent } from "applesauce-core/helpers/profile";
import {
  Flag,
  Globe,
  MoreVertical,
  Search as SearchIcon,
  Share2,
  UserCheck,
  UserMinus,
  UserPlus,
  Volume2,
  VolumeX,
} from "lucide-react";
import { FlashIcon } from "@/components/FlashIcon";
import { MessageButton } from "@/components/messages/MessageButton";
import { Chip } from "@/components/ui/chip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import type { useSocialActions } from "@/hooks/useSocialActions";
import { scopedSearchHref } from "@/lib/searchSyntax";
import type { MyReport } from "@/services/socialActions";
import { asyncHandler } from "@/lib/asyncHandler";

export function ProfileActions({
  hexPubkey,
  isOwnProfile,
  social,
  myReport,
  setUnreporting,
  displayNpub,
  displayNostrProfile,
  searchPostsName,
  searchPostsLabel,
  setShareOpen,
  setZapOpen,
  setReportDialogOpen,
}: {
  hexPubkey: string;
  isOwnProfile: boolean;
  social: ReturnType<typeof useSocialActions>;
  myReport: MyReport | null;
  setUnreporting: (pubkey: string | null) => void;
  displayNpub: string;
  displayNostrProfile: ProfileContent | null;
  searchPostsName: string | undefined;
  searchPostsLabel: string;
  setShareOpen: (open: boolean) => void;
  setZapOpen: (open: boolean) => void;
  setReportDialogOpen: (open: boolean) => void;
}) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [followHovered, setFollowHovered] = useState(false);
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2" data-testid="row-profile-actions">
      {hexPubkey && !social.isSelf(hexPubkey) ? (
        <>
          {social.listsLoading ? (
            <div
              className="h-8 w-24 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800"
              data-testid="skeleton-follow-button"
            />
          ) : (
            (() => {
              const following = social.isFollowing(hexPubkey);
              const pending = social.isPending("follow", hexPubkey) || social.isPending("unfollow", hexPubkey);
              return (
                <button
                  type="button"
                  disabled={pending || social.isAnyPending}
                  onMouseEnter={() => following && setFollowHovered(true)}
                  onMouseLeave={() => setFollowHovered(false)}
                  onClick={asyncHandler(async () => {
                    const result = following ? await social.unfollow(hexPubkey) : await social.follow(hexPubkey);
                    // A declined unlock is a deliberate no — say nothing.
                    if (result.cancelled) {
                      setFollowHovered(false);
                      return;
                    }
                    if (result.success) {
                      toast({
                        title: following ? "Unfollowed" : "Followed",
                        description: following ? "Removed from your contact list" : "Added to your contact list",
                      });
                    } else {
                      toast({
                        title: "Error",
                        description: result.error || "Action failed",
                        variant: "destructive",
                      });
                    }
                    setFollowHovered(false);
                  })}
                  className={`inline-flex h-8 items-center justify-center gap-1.5 rounded-lg px-4 text-xs font-semibold transition-all duration-200 disabled:pointer-events-none disabled:opacity-50 ${
                    following
                      ? followHovered
                        ? "border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-400 dark:hover:bg-red-500/20"
                        : "border border-slate-200 bg-white text-slate-700 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-slate-700"
                      : "bg-brand-primary text-white shadow-sm hover:bg-brand-primary-hover"
                  }`}
                  data-testid="button-follow-toggle"
                >
                  {following ? (
                    followHovered ? (
                      <UserMinus className="h-3.5 w-3.5" />
                    ) : (
                      <UserCheck className="h-3.5 w-3.5" />
                    )
                  ) : (
                    <UserPlus className="h-3.5 w-3.5" />
                  )}
                  <span>{following ? (followHovered ? "Unfollow" : "Following") : "Follow"}</span>
                </button>
              );
            })()
          )}
          <MessageButton pubkey={hexPubkey} name={searchPostsName} />
          <button
            type="button"
            onClick={() => hexPubkey && navigate(scopedSearchHref(hexPubkey, "top"))}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition-colors hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:border-slate-700 dark:hover:bg-slate-900"
            aria-label={searchPostsLabel}
            title={searchPostsLabel}
            data-testid="button-search-posts"
          >
            <SearchIcon className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => navigate(`/p/${displayNpub}`)}
            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-slate-700 dark:hover:bg-slate-900"
            data-testid="link-public-page"
            title="See the public, shareable version of this profile"
          >
            <Globe className="h-3.5 w-3.5 shrink-0" /> Public page
          </button>
          {displayNostrProfile?.lud16 && (
            <button
              type="button"
              onClick={() => setZapOpen(true)}
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-slate-700 dark:hover:bg-slate-900"
              data-testid="button-zap"
              title="Send a zap"
            >
              <FlashIcon className="h-3.5 w-3.5 text-amber-500" /> Zap
            </button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition-colors hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:border-slate-700 dark:hover:bg-slate-900"
                aria-label="More actions"
                data-testid="button-profile-more"
              >
                <MoreVertical className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-44 bg-white/95 backdrop-blur-xl dark:bg-slate-900/95">
              <DropdownMenuItem
                className="cursor-pointer"
                onClick={() => setShareOpen(true)}
                data-testid="button-share-profile"
              >
                <Share2 className="mr-2 h-4 w-4 text-slate-500 dark:text-slate-400" /> Share
              </DropdownMenuItem>
              {(() => {
                const muted = social.isMuted(hexPubkey);
                return (
                  <DropdownMenuItem
                    className="cursor-pointer"
                    onClick={asyncHandler(async () => {
                      const result = muted ? await social.unmute(hexPubkey) : await social.mute(hexPubkey);
                      if (result.cancelled) return;
                      if (result.success) {
                        toast({
                          title: muted ? "Unmuted" : "Muted",
                          description: muted ? "Removed from your mute list" : "Added to your mute list",
                        });
                      } else {
                        toast({
                          title: "Error",
                          description: result.error || "Action failed",
                          variant: "destructive",
                        });
                      }
                    })}
                    data-testid="button-mute-toggle"
                  >
                    {muted ? (
                      <Volume2 className="mr-2 h-4 w-4 text-slate-500 dark:text-slate-400" />
                    ) : (
                      <VolumeX className="mr-2 h-4 w-4 text-slate-500 dark:text-slate-400" />
                    )}
                    {muted ? "Unmute" : "Mute"}
                  </DropdownMenuItem>
                );
              })()}
              {myReport ? (
                <DropdownMenuItem
                  className="cursor-pointer text-amber-700 focus:text-amber-800 dark:text-amber-400 dark:focus:text-amber-300"
                  onClick={asyncHandler(async () => {
                    setUnreporting(hexPubkey); // optimistic: chip + menu flip instantly
                    const result = await social.unreport(hexPubkey);
                    setUnreporting(null);
                    if (result.cancelled) return;
                    if (result.success) {
                      toast({
                        title: "Report removed",
                        description: "Scores may take a little while to reflect this.",
                      });
                    } else {
                      toast({
                        title: "Error",
                        description: result.error || "Couldn't remove report",
                        variant: "destructive",
                      });
                    }
                  })}
                  data-testid="button-unreport"
                >
                  <Flag className="mr-2 h-4 w-4" /> Undo report
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem
                  className="cursor-pointer text-red-600 focus:text-red-700 dark:text-red-400 dark:focus:text-red-300"
                  onClick={() => setReportDialogOpen(true)}
                  data-testid="button-report"
                >
                  <Flag className="mr-2 h-4 w-4" /> Report
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          {myReport && (
            <Chip
              tone="amber"
              icon={Flag}
              className="text-[11px]"
              title="Your report is published. Undo it from the ⋯ menu. Scores may take a little while to reflect changes."
              data-testid="chip-you-reported"
            >
              You reported this{myReport.reportType ? ` (${myReport.reportType})` : ""}
            </Chip>
          )}
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={() => hexPubkey && navigate(scopedSearchHref(hexPubkey, "top"))}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition-colors hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:border-slate-700 dark:hover:bg-slate-900"
            aria-label={searchPostsLabel}
            title={searchPostsLabel}
            data-testid="button-search-posts"
          >
            <SearchIcon className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => navigate(`/p/${displayNpub}`)}
            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-brand-primary/20 bg-white px-3 text-xs font-semibold text-brand-primary transition-colors hover:border-brand-primary/25 hover:bg-brand-primary/10 dark:border-brand-primary/25 dark:bg-slate-900 dark:text-brand-link dark:hover:border-brand-primary/[0.4] dark:hover:bg-brand-primary/10"
            data-testid="link-public-page"
            title="See the public, shareable version of this profile"
          >
            <Globe className="h-3.5 w-3.5 shrink-0" /> Public page
          </button>
          {!isOwnProfile && displayNostrProfile?.lud16 && (
            <button
              type="button"
              onClick={() => setZapOpen(true)}
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-slate-700 dark:hover:bg-slate-900"
              data-testid="button-zap"
              title="Send a zap"
            >
              <FlashIcon className="h-3.5 w-3.5 text-amber-500" /> Zap
            </button>
          )}
          <button
            type="button"
            onClick={() => setShareOpen(true)}
            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-brand-primary px-3 text-xs font-semibold text-white transition-colors hover:bg-brand-primary"
            data-testid="button-share-profile"
          >
            <Share2 className="h-3.5 w-3.5 shrink-0" /> Share
          </button>
        </>
      )}
    </div>
  );
}
