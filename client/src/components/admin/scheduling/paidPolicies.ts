/**
 * Which scheduling policies are granted by a PAID billing plan — the ids an
 * admin should recognize as "this cadence is what subscribers pay for".
 * Derived from the server's billing plan mappings (GET /admin/billing/plans):
 * a policy is paid when an ACTIVE mapping with a non-zero price targets it.
 */
export function paidSchedulingIds(
  mappings: Array<{ scheduling_id: number; amount_minor: number; is_active: boolean }>,
): Set<number> {
  return new Set(
    mappings.filter((m) => m.is_active && m.amount_minor > 0).map((m) => m.scheduling_id),
  );
}
