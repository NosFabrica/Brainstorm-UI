/** "internal" on a tab or view only admins have — what regular users don't see yet. */
export function InternalChip() {
  return (
    <span
      className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-px align-middle text-[9px] font-bold uppercase tracking-wider text-amber-700 dark:bg-amber-500/20 dark:text-amber-300"
      data-testid="chip-internal"
    >
      internal
    </span>
  );
}
