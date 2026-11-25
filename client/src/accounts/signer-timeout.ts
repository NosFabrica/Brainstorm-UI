/**
 * A deadline on a signer request, and the error it ends with. Every kind of
 * signer here has one (NIP-46, Amber, an extension, the session exchange), so it
 * lives apart from any of them.
 */

/** A request the signer never answered. Distinct from one it declined. */
export class RemoteSignerTimeoutError extends Error {
  constructor(message = "Your signer didn't respond.") {
    super(message);
    this.name = "RemoteSignerTimeoutError";
  }
}

export function isRemoteSignerTimeout(error: unknown): boolean {
  return error instanceof RemoteSignerTimeoutError || (error as { name?: string })?.name === "RemoteSignerTimeoutError";
}

/**
 * Give a promise a deadline. The loser keeps its handler — `Promise.race`
 * attaches one to both — so a signer answering after we gave up is dropped
 * rather than surfacing as an unhandled rejection.
 */
export function withTimeout<T>(work: Promise<T>, ms: number, message?: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new RemoteSignerTimeoutError(message)), ms);
  });
  return Promise.race([work, deadline]).finally(() => clearTimeout(timer));
}
