import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { GrowthCard } from "@/components/admin/growth/GrowthCard";
import { readEveryPage } from "@/components/admin/useAdminHeaderMetrics";
import { apiClient } from "@/services/api";
import { BACKEND_MAX_DAYS, type AdminRange } from "../adminRange";
import { NONE } from "./constants";
import { tierByPubkey } from "./metrics";
import type { AdminUserHistoryPage, AdminUserListItem } from "./types";

/** The Growth tab: who arrived when, from the year's runs, cut to the dashboard's range. */
export function GrowthTab({
  isAdmin,
  range,
  allUsers,
  profiles,
  onOpenPerson,
}: {
  isAdmin: boolean;
  range: AdminRange;
  /** Every user, for each person's tier. */
  allUsers: readonly AdminUserListItem[];
  profiles: Map<string, { name?: string; picture?: string }>;
  onOpenPerson: (pubkey: string) => void;
}) {
  // The year's runs, whole: a person's first run is their earliest record
  // here, whatever the dashboard's range.
  const yearActivityQuery = useQuery<AdminUserHistoryPage>({
    queryKey: ["/api/admin/activity/year"],
    queryFn: () => readEveryPage((page) => apiClient.getAdminActivity({ page, size: 100, days: BACKEND_MAX_DAYS })),
    enabled: isAdmin,
    staleTime: 300_000,
    retry: 1,
  });
  // pubkey → scheduling tier, for the rows and the tier filter.
  const tiersByPubkey = useMemo(() => tierByPubkey(allUsers), [allUsers]);

  return (
    <div data-testid="panel-growth">
      <GrowthCard
        records={yearActivityQuery.data?.items ?? NONE}
        range={range}
        isLoading={yearActivityQuery.isLoading}
        profiles={profiles}
        tiers={tiersByPubkey}
        onOpenPerson={(pk) => {
          onOpenPerson(pk);
        }}
      />
    </div>
  );
}
