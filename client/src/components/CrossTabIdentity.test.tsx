import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";

import type { BrainstormAccount } from "@/accounts/metadata";
import type { MirroredChange } from "@/accounts/cross-tab";
import { CrossTabIdentity } from "./CrossTabIdentity";

/** Just enough of the mirror's stream to subscribe to — rxjs can't be imported this early. */
const mirror = vi.hoisted(() => {
  const handlers = new Set<(change: any) => void>();
  return {
    emit: (change: unknown) => handlers.forEach((handler) => handler(change)),
    changes$: {
      subscribe(handler: (change: any) => void) {
        handlers.add(handler);
        return { unsubscribe: () => handlers.delete(handler) };
      },
    },
  };
});
const changes$ = { next: (change: MirroredChange) => mirror.emit(change) };
const toast = vi.fn();
const navigate = vi.fn();
const clear = vi.fn();
let location = "/dashboard";

vi.mock("@/accounts", () => ({ accountMirror: { changes$: mirror.changes$ } }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));
vi.mock("@/lib/queryClient", () => ({ queryClient: { clear: () => clear() } }));
vi.mock("wouter", () => ({ useLocation: () => [location, navigate] }));

function accountNamed(name: string | undefined, npub: string): BrainstormAccount {
  return { id: npub, pubkey: "a".repeat(64), metadata: { remembered: true, name, npub } } as unknown as BrainstormAccount;
}

const alice = accountNamed("Alice", "npub1alice");
const bob = accountNamed("Bob", "npub1bob");

beforeEach(() => {
  vi.clearAllMocks();
  location = "/dashboard";
});

describe("following another tab's switch", () => {
  it("drops the cached answers, which belonged to the previous identity", async () => {
    render(<CrossTabIdentity />);

    changes$.next({ account: bob, previous: alice });

    await waitFor(() => expect(clear).toHaveBeenCalled());
  });

  it("names who this tab is now", async () => {
    render(<CrossTabIdentity />);

    changes$.next({ account: bob, previous: alice });

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Now signed in as Bob" })),
    );
  });

  it("falls back to the npub for an account with no cached name", async () => {
    render(<CrossTabIdentity />);

    changes$.next({ account: accountNamed(undefined, "npub1carolxxxxxxxx"), previous: alice });

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Now signed in as npub1carolxx…" }),
      ),
    );
  });

  it("promises nothing about the key, which does not travel between tabs", async () => {
    render(<CrossTabIdentity />);

    changes$.next({ account: bob, previous: alice });

    await waitFor(() => expect(toast).toHaveBeenCalled());
    const said = JSON.stringify(toast.mock.calls[0][0]).toLowerCase();
    expect(said).not.toMatch(/unlock|locked|key/);
  });

  it("leaves a page that was rendering the previous identity's own data", async () => {
    location = "/settings";
    render(<CrossTabIdentity />);

    changes$.next({ account: bob, previous: alice });

    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/dashboard", { replace: true }));
  });

  it("stays put on a page that is about the network", async () => {
    location = "/network";
    render(<CrossTabIdentity />);

    changes$.next({ account: bob, previous: alice });

    await waitFor(() => expect(toast).toHaveBeenCalled());
    expect(navigate).not.toHaveBeenCalled();
  });
});

describe("following another tab's sign-out", () => {
  it("says so, and leaves the redirect to the route guard", async () => {
    location = "/settings";
    render(<CrossTabIdentity />);

    changes$.next({ account: null, previous: alice });

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Signed out" })),
    );
    expect(clear).toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });
});
