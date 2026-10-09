import {
  NodeFollowersIcon,
  NodeFollowingIcon,
  NodeMutedByIcon,
  NodeReportedByIcon,
  NodeMutingIcon,
  NodeReportingIcon,
  NodeFlaggedIcon,
} from "@/components/WotIcons";

const FollowersIcon = NodeFollowersIcon;
const FollowingIcon = NodeFollowingIcon;
const MutedByIcon = NodeMutedByIcon;
const MutingIcon = NodeMutingIcon;
const ReportedByIcon = NodeReportedByIcon;
const ReportingIcon = NodeReportingIcon;
export const FlaggedIcon = NodeFlaggedIcon;

export type GroupKey = "followed_by" | "following" | "muted_by" | "muting" | "reported_by" | "reporting" | "flagged";

export const detailMetrics: {
  key: string;
  label: string;
  desc: string;
  iconBg: string;
  iconColor: string;
  countColor: string;
}[] = [
  {
    key: "followed_by",
    label: "Followers",
    desc: "People following this account",
    iconBg: "bg-blue-50 dark:bg-blue-500/10 border-blue-100 dark:border-blue-500/25",
    iconColor: "text-blue-500",
    countColor: "text-slate-900 dark:text-slate-100",
  },
  {
    key: "following",
    label: "Following",
    desc: "Accounts this person follows",
    iconBg: "bg-blue-50 dark:bg-blue-500/10 border-blue-100 dark:border-blue-500/25",
    iconColor: "text-blue-500",
    countColor: "text-slate-900 dark:text-slate-100",
  },
  {
    key: "muted_by",
    label: "Muted By",
    desc: "Others who muted this account",
    iconBg: "bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/25",
    iconColor: "text-amber-500",
    countColor: "text-amber-700 dark:text-amber-300",
  },
  {
    key: "reported_by",
    label: "Reported By",
    desc: "Others who reported this account",
    iconBg: "bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/25",
    iconColor: "text-red-500",
    countColor: "text-red-700 dark:text-red-300",
  },
  {
    key: "muting",
    label: "Muting",
    desc: "Accounts this person mutes",
    iconBg: "bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/25",
    iconColor: "text-amber-500",
    countColor: "text-slate-900 dark:text-slate-100",
  },
  {
    key: "reporting",
    label: "Reporting",
    desc: "Accounts this person reports",
    iconBg: "bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800",
    iconColor: "text-slate-500 dark:text-slate-400",
    countColor: "text-slate-900 dark:text-slate-100",
  },
];

export const metricIcons: Record<string, (cls: string) => JSX.Element> = {
  followed_by: (cls) => <FollowersIcon className={cls} />,
  following: (cls) => <FollowingIcon className={cls} />,
  muted_by: (cls) => <MutedByIcon className={cls} />,
  reported_by: (cls) => <ReportedByIcon className={cls} />,
  muting: (cls) => <MutingIcon className={cls} />,
  reporting: (cls) => <ReportingIcon className={cls} />,
  flagged: (cls) => <FlaggedIcon className={cls} />,
};

export const groups = [
  {
    key: "followed_by" as GroupKey,
    label: "Follows you",
    shortLabel: "Follows you",
    Icon: FollowersIcon,
    color: "text-blue-500",
    bgColor: "bg-blue-50 dark:bg-blue-500/10",
    borderColor: "border-blue-100 dark:border-blue-500/25",
    tooltip: "Accounts that follow you",
    tooltipAccent: "border-l-blue-400",
  },
  {
    key: "following" as GroupKey,
    label: "You follow",
    shortLabel: "You follow",
    Icon: FollowingIcon,
    color: "text-blue-500",
    bgColor: "bg-blue-50 dark:bg-blue-500/10",
    borderColor: "border-blue-100 dark:border-blue-500/25",
    tooltip: "Accounts you follow",
    tooltipAccent: "border-l-blue-400",
  },
  {
    key: "muted_by" as GroupKey,
    label: "Muted you",
    shortLabel: "Muted you",
    Icon: MutedByIcon,
    color: "text-amber-500",
    bgColor: "bg-amber-50 dark:bg-amber-500/10",
    borderColor: "border-amber-200 dark:border-amber-500/25",
    tooltip: "Accounts that have muted you",
    tooltipAccent: "border-l-amber-400",
  },
  {
    key: "muting" as GroupKey,
    label: "You muted",
    shortLabel: "You muted",
    Icon: MutingIcon,
    color: "text-amber-500",
    bgColor: "bg-amber-50 dark:bg-amber-500/10",
    borderColor: "border-amber-200 dark:border-amber-500/25",
    tooltip: "Accounts you have muted",
    tooltipAccent: "border-l-amber-400",
  },
  {
    key: "reported_by" as GroupKey,
    label: "Reported you",
    shortLabel: "Reported you",
    Icon: ReportedByIcon,
    color: "text-red-500",
    bgColor: "bg-red-50 dark:bg-red-500/10",
    borderColor: "border-red-200 dark:border-red-500/25",
    tooltip: "Accounts that have reported you",
    tooltipAccent: "border-l-red-400",
  },
  {
    key: "reporting" as GroupKey,
    label: "You reported",
    shortLabel: "You reported",
    Icon: ReportingIcon,
    color: "text-red-500",
    bgColor: "bg-red-50 dark:bg-red-500/10",
    borderColor: "border-red-200 dark:border-red-500/25",
    tooltip: "Accounts you have reported",
    tooltipAccent: "border-l-red-400",
  },
  {
    key: "flagged" as GroupKey,
    label: "Flagged",
    shortLabel: "Flagged",
    Icon: FlaggedIcon,
    color: "text-red-600 dark:text-red-400",
    bgColor: "bg-red-50 dark:bg-red-500/10",
    borderColor: "border-red-200 dark:border-red-500/25",
    tooltip: "Low trust accounts reported by 2+ of your trusted contacts",
    tooltipAccent: "border-l-red-400",
  },
];
