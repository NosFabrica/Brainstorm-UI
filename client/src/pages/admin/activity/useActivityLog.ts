import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { apiClient } from "@/services/api";
import { BOOST_INTERVAL_MS, NONE, POLL_ACTIVITY_MS } from "../constants";
import type { AdminUserHistoryPage, PageSizeOption } from "../types";

/**
 * The Activity tab's log: the range's runs a page at a time, and the rows
 * picked for a bulk re-trigger. The console holds it, not the tab: its page and
 * selection outlast a visit to another tab, and System Health reports this
 * read's state.
 */
export function useActivityLog({
  isAdmin,
  onActivityTab,
  rangeDays,
  isBoostActive,
}: {
  isAdmin: boolean;
  onActivityTab: boolean;
  rangeDays: number;
  isBoostActive: boolean;
}) {
  const [activityPage, setActivityPage] = useState(0);
  const [activityPageSize, setActivityPageSize] = useState<PageSizeOption>(25);
  // private_id → pubkey of each row picked.
  const [selectedActivityRows, setSelectedActivityRows] = useState<Map<number, string>>(new Map());

  const adminActivityQuery = useQuery<AdminUserHistoryPage>({
    queryKey: ["/api/admin/activity", rangeDays, activityPage, activityPageSize],
    queryFn: () =>
      apiClient.getAdminActivity({
        page: activityPage + 1,
        size: activityPageSize,
        days: rangeDays,
      }),
    enabled: isAdmin && onActivityTab,
    staleTime: 30_000,
    placeholderData: (prev) => prev,
    refetchInterval: onActivityTab ? (isBoostActive ? BOOST_INTERVAL_MS : POLL_ACTIVITY_MS) : false,
    refetchOnWindowFocus: "always",
  });
  const activityData = adminActivityQuery.data;

  return {
    adminActivityQuery,
    activityItems: activityData?.items ?? NONE,
    activityTotal: activityData?.total ?? 0,
    activityTotalPages: activityData?.pages ?? 1,
    activityPage,
    setActivityPage,
    activityPageSize,
    setActivityPageSize,
    selectedActivityRows,
    setSelectedActivityRows,
  };
}

export type ActivityLog = ReturnType<typeof useActivityLog>;
