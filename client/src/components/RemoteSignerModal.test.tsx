import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { BehaviorSubject } from "rxjs";

import { renderWithProviders } from "@/test/utils";
import { RemoteSignerModal } from "./RemoteSignerModal";

const PAIRING_URI = "nostrconnect://abc?secret=s&name=Brainstorm&relay=wss%3A%2F%2Fours";

const cancel = vi.fn();
const connectWithBunkerURI = vi.fn();
const signInWithExternalSigner = vi.fn();
let completed: Promise<unknown>;
let problem: string | null = null;
const reachable$ = new BehaviorSubject(true);
let mobile = false;

vi.mock("@/accounts/remote-login", () => ({
  beginRemotePairing: () => ({
    uri: PAIRING_URI,
    relays: ["wss://ours"],
    completed,
    cancel,
  }),
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

beforeEach(() => {
  vi.clearAllMocks();
  completed = new Promise(() => {});
  problem = null;
  reachable$.next(true);
  mobile = false;
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
    expect(cancel).toHaveBeenCalled();
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
