/** react-query keys shared by the billing admin cards, so one card's write
 *  can invalidate what another shows. */
export const SUBS_KEY = ["/api/admin/billing/subscriptions"];
export const DIVERGENCE_KEY = ["/api/admin/billing/divergence"];
export const PLANS_KEY = ["/api/admin/billing/plans"];
export const POLICIES_KEY = ["/api/admin/scheduling"];
/** Flash's services on our account — one per environment; read by the roster and the mapping picker. */
export const FLASH_SERVICES_KEY = ["admin-billing-flash-services"] as const;
