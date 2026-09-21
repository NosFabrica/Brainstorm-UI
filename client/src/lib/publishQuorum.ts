/** One relay's answer to a publish. */
export interface PublishOutcome {
  ok: boolean;
  from: string;
  message?: string;
}

/**
 * Publish to many relays and answer as soon as `need` of them have accepted —
 * or every relay has answered, or `timeoutMs` has passed for the silent ones —
 * so one slow relay can't hold the user's button for the relay library's full
 * 30 seconds. The sends that haven't answered keep going in the background;
 * they just no longer hold anyone up.
 */
export function publishUntilEnough(
  relays: string[],
  send: (relay: string) => Promise<PublishOutcome>,
  { need, timeoutMs }: { need: number; timeoutMs: number },
): Promise<{ accepted: string[]; failed: PublishOutcome[]; total: number }> {
  const total = relays.length;
  const enough = Math.max(1, Math.min(need, total));
  const accepted: string[] = [];
  const failed: PublishOutcome[] = [];
  if (total === 0) return Promise.resolve({ accepted, failed, total });

  return new Promise((resolve) => {
    let settled = 0;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve({ accepted: [...accepted], failed: [...failed], total });
    };
    for (const relay of relays) {
      let answered = false;
      const cap = setTimeout(() => {
        if (answered) return;
        answered = true;
        failed.push({ ok: false, from: relay, message: "timed out" });
        if (++settled === total) finish();
      }, timeoutMs);
      send(relay)
        .catch((e): PublishOutcome => ({ ok: false, from: relay, message: e instanceof Error ? e.message : String(e) }))
        .then((out) => {
          if (answered) return;
          answered = true;
          clearTimeout(cap);
          if (out.ok) accepted.push(relay);
          else failed.push({ ...out, from: relay });
          if (accepted.length >= enough || ++settled === total) finish();
        });
    }
  });
}
