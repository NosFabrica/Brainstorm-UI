export type PlanId = "monthly" | "bimonthly";

export interface PlanInfo {
  id: PlanId;
  name: string;
  monthly: number;
  annual: number;
  cadence: string;
}

export const PLAN_INFO: Record<PlanId, PlanInfo> = {
  monthly: { id: "monthly", name: "Monthly Pulse", monthly: 8, annual: 80, cadence: "Auto-recalc once a month" },
  bimonthly: { id: "bimonthly", name: "Bi-Monthly Pulse", monthly: 12, annual: 120, cadence: "Auto-recalc twice a month" },
};

export function resolvePlan(planParam: string | null | undefined): PlanInfo {
  return planParam === "bimonthly" ? PLAN_INFO.bimonthly : PLAN_INFO.monthly;
}

export function planTotal(plan: PlanInfo, billing: "monthly" | "annual"): number {
  return billing === "annual" ? plan.annual : plan.monthly;
}

export function billingLabel(billing: "monthly" | "annual"): string {
  return billing === "annual" ? "/yr" : "/mo";
}
