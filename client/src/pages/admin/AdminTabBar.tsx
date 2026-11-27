import { FEATURES } from "@/config/featureFlags";
import {
  Users,
  Activity,
  Server,
  BarChart3,
  ChevronDown,
  CheckCircle2,
  Sparkles,
  CalendarClock,
  LifeBuoy,
  Receipt,
  ListChecks,
  TrendingUp,
  KeyRound,
} from "lucide-react";
import { useState, type ComponentType } from "react";
import { type AdminTab } from "../adminTabs";

export type AdminTabEntry = { key: AdminTab; label: string; icon: ComponentType<{ className?: string }> };

/** The console's sections, in the bar's order (Assistants behind its feature flag). */
export function adminTabList(): AdminTabEntry[] {
  return [
    { key: "overview", label: "Overview", icon: BarChart3 },
    { key: "activity", label: "Activity", icon: Activity },
    { key: "scheduling", label: "Scheduling", icon: CalendarClock },
    { key: "support", label: "Support", icon: LifeBuoy },
    // Gated on nothing. A fresh instance has billing enabled and zero plan
    // mappings, which is exactly when an admin needs this tab to create the
    // first one — gating on plans existing would be a bootstrap deadlock, and
    // the mock flag answers an unrelated question. Where billing isn't
    // configured the endpoints 404 and the cards say so.
    { key: "billing" as AdminTab, label: "Billing", icon: Receipt },
    { key: "users", label: "Users", icon: Users },
    { key: "trusted-lists", label: "Trusted Lists", icon: ListChecks },
    { key: "compromised", label: "Compromised", icon: KeyRound },
    { key: "growth", label: "Growth", icon: TrendingUp },
    ...(FEATURES.assistantsAdmin ? [{ key: "assistants" as AdminTab, label: "Assistants", icon: Sparkles }] : []),
    { key: "health", label: "System Health", icon: Server },
  ];
}

/** The tab bar: a row of tabs on a desk, a dropdown on a phone; Support's dot for unread tickets. */
export function AdminTabBar({
  tabs,
  activeTab,
  onSelect,
  supportUnread,
}: {
  tabs: AdminTabEntry[];
  activeTab: AdminTab;
  onSelect: (key: AdminTab) => void;
  supportUnread: number;
}) {
  const [mobileTabDropdownOpen, setMobileTabDropdownOpen] = useState(false);
  return (
    <>
      <div className="scrollbar-hide -mx-4 hidden overflow-x-auto px-4 sm:mx-0 sm:block sm:px-0">
        <div
          className="flex w-fit gap-1 rounded-2xl border border-brand-accent/10 bg-white/60 p-1 backdrop-blur-sm dark:bg-slate-900/60"
          data-testid="admin-tab-bar"
        >
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => onSelect(tab.key)}
                className={`flex items-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-2 text-xs font-semibold transition-all duration-200 sm:gap-2 sm:px-4 sm:text-sm ${
                  active
                    ? "bg-brand-primary text-white shadow-md"
                    : "text-slate-500 hover:bg-white/80 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-900/80 dark:hover:text-slate-200"
                }`}
                data-testid={`tab-${tab.key}`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
                {tab.key === "support" && supportUnread > 0 && (
                  <span
                    className={`h-2 w-2 rounded-full ${active ? "bg-white" : "bg-brand-accent"}`}
                    aria-label={`${supportUnread} tickets awaiting reply`}
                    data-testid="tab-support-dot"
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>
      <div className="sm:hidden" data-testid="admin-tab-bar-mobile">
        {(() => {
          const [mobileTabOpen, setMobileTabOpen] = [mobileTabDropdownOpen, setMobileTabDropdownOpen];
          const activeTabData = tabs.find((t) => t.key === activeTab);
          const ActiveIcon = activeTabData?.icon ?? BarChart3;
          return (
            <div className="relative">
              <button
                onClick={() => setMobileTabOpen(!mobileTabOpen)}
                className="flex w-full items-center justify-between rounded-2xl border border-brand-accent/10 bg-white/60 px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm backdrop-blur-sm dark:bg-slate-900/60 dark:text-slate-200"
                data-testid="button-tab-mobile-trigger"
              >
                <span className="flex items-center gap-2">
                  <ActiveIcon className="h-4 w-4 text-brand-deep" />
                  {activeTabData?.label}
                </span>
                <ChevronDown
                  className={`h-4 w-4 text-slate-400 transition-transform dark:text-slate-500 ${mobileTabOpen ? "rotate-180" : ""}`}
                />
              </button>
              {mobileTabOpen && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setMobileTabOpen(false)} />
                  <div
                    className="absolute left-0 right-0 top-full z-40 mt-1 overflow-hidden rounded-xl border border-brand-accent/15 bg-white shadow-lg dark:bg-slate-900"
                    data-testid="dropdown-tab-mobile"
                  >
                    {tabs.map((tab) => {
                      const Icon = tab.icon;
                      const isActive = activeTab === tab.key;
                      return (
                        <button
                          key={tab.key}
                          onClick={() => {
                            onSelect(tab.key);
                            setMobileTabOpen(false);
                          }}
                          className={`flex w-full items-center gap-2.5 px-4 py-3 text-sm font-semibold transition-colors ${
                            isActive
                              ? "bg-gradient-to-r from-brand-deep/10 to-brand-accent/10 text-brand-deep"
                              : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-900"
                          }`}
                          data-testid={`tab-mobile-${tab.key}`}
                        >
                          <Icon
                            className={`h-4 w-4 ${isActive ? "text-brand-deep" : "text-slate-400 dark:text-slate-500"}`}
                          />
                          {tab.label}
                          {isActive && <CheckCircle2 className="ml-auto h-3.5 w-3.5 text-brand-deep" />}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          );
        })()}
      </div>
    </>
  );
}
