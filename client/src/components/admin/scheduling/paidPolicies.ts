/**
 * Which scheduling policies are sold by a billing plan — the ids an admin
 * should recognize as "this cadence is what subscribers pay for".
 *
 * Derived from the server's plan mappings (GET /admin/billing/plans): a policy
 * is sold when an ACTIVE mapping targets it. Price used to narrow this further,
 * but a mapping's price is Flash's answer now and is not on this endpoint —
 * an active mapping IS the decision to sell, which is what this asks.
 */
export function paidSchedulingIds(
  mappings: Array<{ scheduling_id: number; is_active: boolean }>,
): Set<number> {
  return new Set(mappings.filter((m) => m.is_active).map((m) => m.scheduling_id));
}
