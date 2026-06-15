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

export type GroupKey =
  | "followed_by"
  | "following"
  | "muted_by"
  | "muting"
  | "reported_by"
  | "reporting"
  | "flagged";

export const getVerificationGuidance = (pct: number, name: string) => {
  if (pct >= 50)
    return {
      label: "High confidence",
      color: "text-emerald-600",
      message: `${pct}% confidence that ${name} is a genuine participant, based on your trusted community's follows, mutes, and reports.`,
    };
  if (pct >= 20)
    return {
      label: "Moderate confidence",
      color: "text-indigo-600",
      message: `${pct}% confidence that ${name} is a genuine participant. Your network has limited signals — consider reviewing their activity.`,
    };
  if (pct >= 7)
    return {
      label: "Low confidence",
      color: "text-slate-500",
      message: `Only ${pct}% confidence that ${name} is a genuine participant. Your trusted community has weak or mixed signals.`,
    };
  return {
    label: "Very low confidence",
    color: "text-amber-600",
    message: `${pct}% confidence that ${name} is a genuine participant. Your community's signals suggest careful scrutiny before trusting.`,
  };
};

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
    iconBg: "bg-blue-50 border-blue-100",
    iconColor: "text-blue-500",
    countColor: "text-slate-900",
  },
  {
    key: "following",
    label: "Following",
    desc: "Accounts this person follows",
    iconBg: "bg-blue-50 border-blue-100",
    iconColor: "text-blue-500",
    countColor: "text-slate-900",
  },
  {
    key: "muted_by",
    label: "Muted By",
    desc: "Others who muted this account",
    iconBg: "bg-amber-50 border-amber-200",
    iconColor: "text-amber-500",
    countColor: "text-amber-700",
  },
  {
    key: "reported_by",
    label: "Reported By",
    desc: "Others who reported this account",
    iconBg: "bg-red-50 border-red-200",
    iconColor: "text-red-500",
    countColor: "text-red-700",
  },
  {
    key: "muting",
    label: "Muting",
    desc: "Accounts this person mutes",
    iconBg: "bg-amber-50 border-amber-200",
    iconColor: "text-amber-500",
    countColor: "text-slate-900",
  },
  {
    key: "reporting",
    label: "Reporting",
    desc: "Accounts this person reports",
    iconBg: "bg-slate-50 border-slate-200",
    iconColor: "text-slate-500",
    countColor: "text-slate-900",
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
    label: "Followers",
    shortLabel: "Followers",
    Icon: FollowersIcon,
    color: "text-blue-500",
    bgColor: "bg-blue-50",
    borderColor: "border-blue-100",
    tooltip: "Accounts that follow you",
    tooltipAccent: "border-l-blue-400",
  },
  {
    key: "following" as GroupKey,
    label: "Following",
    shortLabel: "Following",
    Icon: FollowingIcon,
    color: "text-blue-500",
    bgColor: "bg-blue-50",
    borderColor: "border-blue-100",
    tooltip: "Accounts you follow",
    tooltipAccent: "border-l-blue-400",
  },
  {
    key: "muted_by" as GroupKey,
    label: "Muted By",
    shortLabel: "Muted",
    Icon: MutedByIcon,
    color: "text-amber-500",
    bgColor: "bg-amber-50",
    borderColor: "border-amber-200",
    tooltip: "Accounts that have muted you",
    tooltipAccent: "border-l-amber-400",
  },
  {
    key: "muting" as GroupKey,
    label: "Muting",
    shortLabel: "Muting",
    Icon: MutingIcon,
    color: "text-amber-500",
    bgColor: "bg-amber-50",
    borderColor: "border-amber-200",
    tooltip: "Accounts you have muted",
    tooltipAccent: "border-l-amber-400",
  },
  {
    key: "reported_by" as GroupKey,
    label: "Reported By",
    shortLabel: "Reported",
    Icon: ReportedByIcon,
    color: "text-red-500",
    bgColor: "bg-red-50",
    borderColor: "border-red-200",
    tooltip: "Accounts that have reported you",
    tooltipAccent: "border-l-red-400",
  },
  {
    key: "reporting" as GroupKey,
    label: "Reporting",
    shortLabel: "Reporting",
    Icon: ReportingIcon,
    color: "text-red-500",
    bgColor: "bg-red-50",
    borderColor: "border-red-200",
    tooltip: "Accounts you have reported",
    tooltipAccent: "border-l-red-400",
  },
  {
    key: "flagged" as GroupKey,
    label: "Flagged",
    shortLabel: "Flagged",
    Icon: FlaggedIcon,
    color: "text-red-600",
    bgColor: "bg-red-50",
    borderColor: "border-red-200",
    tooltip: "Low trust accounts reported by 2+ of your trusted contacts",
    tooltipAccent: "border-l-red-400",
  },
];
