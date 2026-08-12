import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { BehaviorSubject } from "rxjs";

import { appMetadata } from "@/accounts/remote-signer";
import { renderWithProviders } from "@/test/utils";
import { RemoteSignerModal } from "./RemoteSignerModal";

// Built from the real metadata, so a test comparing what we render against what
// we send is comparing two things that can actually disagree.
const PAIRING_URI =
  "nostrconnect://abc?secret=s&relay=wss%3A%2F%2Fours" +
  `&name=${encodeURIComponent(appMetadata().name)}` +
  `&url=${encodeURIComponent(appMetadata().url)}` +
  `&image=${encodeURIComponent(appMetadata().image)}`;

/**
 * One `cancel` per pairing, not one shared spy. A shared one can only count
 * calls, which cannot tell "the replaced pairing was retired" from "the live one
 * was cancelled instead" — and those are opposite outcomes.
 */
const pairings: { cancel: ReturnType<typeof vi.fn> }[] = [];
const beginRemotePairing = vi.fn(() => {
  const made = {
    uri: PAIRING_URI,
    relays: ["wss://ours"],
    ackRefused$,
    completed,
    cancel: vi.fn(),
    keep: vi.fn(),
  };
  pairings.push(made);
  return made;
});
const connectWithBunkerURI = vi.fn();
const signInWithExternalSigner = vi.fn();
let completed: Promise<unknown>;
let problem: string | null = null;
const reachable$ = new BehaviorSubject(true);
const ackRefused$ = new BehaviorSubject(false);
let mobile = false;

vi.mock("@/accounts/remote-login", () => ({
  beginRemotePairing: () => beginRemotePairing(),
  bunkerUriProblem: (input: string) => (input.trim() ? problem : "Paste the link."),
  connectWithBunkerURI: (uri: string) => connectWithBunkerURI(uri),
  isPairingCancelled: (error: unknown) => (error as { name?: string })?.name === "PairingCancelled",
  remoteSignerMessage: (error: unknown) => (error as Error)?.message ?? "",
}));
vi.mock("@/accounts/remote-transport", () => ({ relaysReachable$: () => reachable$ }));
vi.mock("@/services/nostr", () => ({
  signInWithExternalSigner: (account: unknown) => signInWithExternalSigner(account),
}));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => mobile }));

function open(props: Record<string, unknown> = {}) {
  return renderWithProviders(
    <RemoteSignerModal open onOpenChange={() => {}} onSignedIn={() => {}} {...props} />,
  );
}

/** A parent that re-renders, handing the modal a fresh inline `onSignedIn`. */
function Restless() {
  const [, bump] = useState(0);
  return (
    <>
      <button data-testid="bump" onClick={() => bump((n) => n + 1)} />
      <RemoteSignerModal open onOpenChange={() => {}} onSignedIn={() => {}} />
    </>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  completed = new Promise(() => {});
  problem = null;
  reachable$.next(true);
  ackRefused$.next(false);
  mobile = false;
  pairings.length = 0;
});

/** How many pairings have been cancelled, across all of them. */
const cancelCount = () => pairings.filter((p) => p.cancel.mock.calls.length > 0).length;

/**
 * Research §4: Amber renders our `name` bold with the `url` beneath and the
 * `image` as an avatar, and nsec.app keeps only the `url` once approved. All of
 * it is unauthenticated — "a display hint only". Showing the user the same three
 * fields is what turns them into something checkable: a lookalike screen can say
 * anything, but it can't match what this side already told you to expect.
 */
describe("what the signer is about to be told about us", () => {
  it("shows the name, origin and icon we send", () => {
    open();
    const shown = screen.getByTestId("remote-signer-identity");

    expect(shown).toHaveTextContent(appMetadata().name);
    expect(shown).toHaveTextContent(new URL(appMetadata().url).host);
    expect(screen.getByTestId("img-remote-signer-icon")).toHaveAttribute(
      "src",
      appMetadata().image,
    );
  });

  // The whole point is that the user can compare the two screens, which is
  // worthless the moment what we render and what we send can differ.
  it("shows the origin the pairing URI actually carries", () => {
    open();

    const sent = new URL(screen.getByTestId("link-open-signer-app").getAttribute("href")!);
    const origin = sent.searchParams.get("url")!;

    expect(screen.getByTestId("text-remote-signer-origin")).toHaveTextContent(
      new URL(origin).host,
    );
  });

  it("names the origin it is really running on, not a hardcoded brand domain", () => {
    open();

    expect(screen.getByTestId("text-remote-signer-origin")).toHaveTextContent(
      window.location.host,
    );
  });
});

/**
 * `LoginPage` passes `onSignedIn` as an inline arrow and re-renders on its own
 * while the modal is open — the extension probe settles around 800ms, the
 * key-health probe after it. A pairing keyed on that callback's identity is torn
 * down and re-minted each time, with a new client keypair and a new QR.
 *
 * The failure is silent and total: the code the user scanned encodes a client
 * pubkey we have stopped listening on, so their signer answers into the void and
 * the screen blames them three minutes later.
 */
describe("a screen that re-renders under it", () => {
  it("keeps the pairing, so the QR on screen is still the live one", () => {
    renderWithProviders(<Restless />);
    expect(beginRemotePairing).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId("bump"));
    fireEvent.click(screen.getByTestId("bump"));

    expect(beginRemotePairing).toHaveBeenCalledTimes(1);
    expect(cancelCount()).toBe(0);
  });

  // Each pairing owns a relay subscription, a three-minute timer and a
  // `completed` handler. Leaving one running means a late answer from the signer
  // the user gave up on can still sign them in.
  it("retires the pairing it replaces when the user retries", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      renderWithProviders(<Restless />);
      reachable$.next(false);
      await vi.advanceTimersByTimeAsync(4000);
      await waitFor(() => expect(screen.getByTestId("button-retry-pairing")).toBeInTheDocument());

      fireEvent.click(screen.getByTestId("button-retry-pairing"));

      // The one it replaced, and only that one.
      expect(beginRemotePairing).toHaveBeenCalledTimes(2);
      expect(pairings[0].cancel).toHaveBeenCalled();
      expect(pairings[1].cancel).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("still cancels when the screen actually goes away", () => {
    const { unmount } = renderWithProviders(<Restless />);
    fireEvent.click(screen.getByTestId("bump"));

    unmount();

    expect(pairings[0].cancel).toHaveBeenCalled();
  });

  // Closing after a retry must retire the pairing that is actually live — the
  // effect's own `started` is the one the retry already replaced.
  it("cancels the pairing that is live, not the one it opened with", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const { unmount } = renderWithProviders(<Restless />);
      reachable$.next(false);
      await vi.advanceTimersByTimeAsync(4000);
      fireEvent.click(await screen.findByTestId("button-retry-pairing"));
      expect(pairings).toHaveLength(2);

      unmount();

      expect(pairings[1].cancel).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("the three routes", () => {
  it("offers all three at once — a signer may be on either device", () => {
    open();
    expect(screen.getByTestId("link-open-signer-app")).toBeInTheDocument();
    expect(screen.getByTestId("remote-signer-qr")).toBeInTheDocument();
    expect(screen.getByTestId("button-paste-bunker")).toBeInTheDocument();
  });

  it("deep-links straight into the signer app, so Android hands off to Amber", () => {
    open();
    expect(screen.getByTestId("link-open-signer-app")).toHaveAttribute("href", PAIRING_URI);
  });

  it("shows the QR unprompted on desktop, where a second device is the point", () => {
    open();
    expect(screen.getByTestId("remote-signer-qr")).toBeInTheDocument();
  });

  it("keeps the QR behind a tap on mobile — you can't photograph your own screen", () => {
    mobile = true;
    open();
    expect(screen.queryByTestId("remote-signer-qr")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("button-show-qr"));
    expect(screen.getByTestId("remote-signer-qr")).toBeInTheDocument();
  });
});

describe("something answered without the code we sent", () => {
  // NIP-46 makes validating the secret MUST-level on us, so the answer is
  // refused. Refusing it silently is what we are fixing: the pairing used to sit
  // there looking untouched until the three-minute deadline blamed the signer.
  it("says so while it happens, not three minutes later", async () => {
    open();
    expect(screen.queryByTestId("notice-ack-refused")).not.toBeInTheDocument();

    ackRefused$.next(true);

    await waitFor(() => expect(screen.getByTestId("notice-ack-refused")).toBeInTheDocument());
  });

  // The URI is public, so anyone watching can send one. Ending the pairing on it
  // would hand every observer a one-message denial of service.
  it("keeps waiting, because the real signer can still answer", async () => {
    open();
    ackRefused$.next(true);
    await waitFor(() => expect(screen.getByTestId("notice-ack-refused")).toBeInTheDocument());

    expect(cancelCount()).toBe(0);
    expect(screen.getByTestId("link-open-signer-app")).toBeInTheDocument();
  });
});

describe("waiting", () => {
  it("says it's waiting on the user, not on the network", () => {
    open();
    expect(screen.getByTestId("notice-waiting-for-signer")).toHaveTextContent(/approve/i);
  });

  it("says the relays are unreachable when they are, rather than blaming the user", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      open();
      reachable$.next(false);
      await vi.advanceTimersByTimeAsync(4000);
      await waitFor(() => expect(screen.getByTestId("notice-relays-unreachable")).toBeInTheDocument());
      expect(screen.queryByTestId("notice-waiting-for-signer")).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("cancels the pairing when the dialog goes away", () => {
    const { unmount } = open();
    unmount();
    expect(cancelCount()).toBeGreaterThan(0);
  });
});

describe("pasting a link", () => {
  it("refuses what isn't one, in the words the checker chose", () => {
    problem = "That's an automation credential — it contains a private key.";
    open();
    fireEvent.click(screen.getByTestId("button-paste-bunker"));
    fireEvent.change(screen.getByTestId("input-bunker-uri"), { target: { value: "nbunksec1x" } });
    fireEvent.click(screen.getByTestId("button-connect-bunker"));

    expect(screen.getByTestId("text-remote-signer-error")).toHaveTextContent(/private key/i);
    expect(connectWithBunkerURI).not.toHaveBeenCalled();
  });

  it("signs in with what comes back", async () => {
    connectWithBunkerURI.mockResolvedValue({ pubkey: "abc" });
    const onSignedIn = vi.fn();
    open({ onSignedIn });

    fireEvent.click(screen.getByTestId("button-paste-bunker"));
    fireEvent.change(screen.getByTestId("input-bunker-uri"), {
      target: { value: "bunker://abc?relay=wss://x" },
    });
    fireEvent.click(screen.getByTestId("button-connect-bunker"));

    await waitFor(() => expect(signInWithExternalSigner).toHaveBeenCalledWith({ pubkey: "abc" }));
    expect(onSignedIn).toHaveBeenCalled();
  });

  it("warns that the link is single-use before they go and fetch a stale one", () => {
    open();
    fireEvent.click(screen.getByTestId("button-paste-bunker"));
    expect(screen.getByText(/single-use and short-lived/i)).toBeInTheDocument();
  });
});
