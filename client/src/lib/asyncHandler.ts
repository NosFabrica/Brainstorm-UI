/**
 * An inline async handler where a void callback is expected (`onClick`,
 * `onSelect`, …). The handler reports its own failures (a toast, error state),
 * so the promise is dropped; a rejection it didn't expect still reaches the
 * console, and lib/errorBuffer, as an unhandled rejection. A named handler
 * doesn't need this: `onClick={() => void save()}`.
 */
export function asyncHandler<A extends unknown[]>(fn: (...args: A) => Promise<unknown>): (...args: A) => void {
  return (...args) => {
    void fn(...args);
  };
}
