/**
 * The test setup's WebSocket never connects (test/setup.ts), and a test that dials a
 * relay fails: code that reads a relay unmocked just waits out its deadline, which is
 * time and nothing else. A suite that drives the offline socket on purpose (a fake
 * relay, the setup's own test) says so once, at the top of the file:
 *
 *   allowRelaySockets();
 *
 * The permission lasts for that file only: each file gets its own copy of this module.
 */
let allowed = false;

export function allowRelaySockets(): void {
  allowed = true;
}

export function relaySocketsAllowed(): boolean {
  return allowed;
}
