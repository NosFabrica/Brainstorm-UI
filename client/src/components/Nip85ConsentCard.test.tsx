import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const checkExistingTrustProvider = vi.fn(async () => "none" as string);

vi.mock("@/services/trustAnchor", () => ({
  checkExistingTrustProvider: (...a: unknown[]) => checkExistingTrustProvider(...(a as [])),
}));

import { Nip85ConsentCard } from "./Nip85ConsentCard";

const ME = "a".repeat(64);
const TA = "f".repeat(64);

beforeEach(() => {
  vi.clearAllMocks();
  checkExistingTrustProvider.mockResolvedValue("none");
});

describe("the ask", () => {
  it("shows the toggle and never phones the relays when told to skip", () => {
    render(<Nip85ConsentCard pubkey={ME} value={true} onChange={() => {}} skipProviderCheck />);
    expect(screen.getByTestId("nip85-consent-toggle")).toBeInTheDocument();
    expect(screen.queryByTestId("nip85-consent-replace-warning")).not.toBeInTheDocument();
    expect(checkExistingTrustProvider).not.toHaveBeenCalled();
  });

  it("reports the user's toggle", () => {
    const onChange = vi.fn();
    render(<Nip85ConsentCard pubkey={ME} value={true} onChange={onChange} skipProviderCheck />);
    fireEvent.click(screen.getByTestId("nip85-consent-toggle"));
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it("renders the ask while the pre-check is still in flight — it never blocks", () => {
    checkExistingTrustProvider.mockReturnValue(new Promise(() => {}) as never);
    render(<Nip85ConsentCard pubkey={ME} taPubkey={TA} value={true} onChange={() => {}} />);
    expect(screen.getByTestId("nip85-consent-toggle")).toBeInTheDocument();
  });

  it("mentions the signer prompt only where a signer will actually prompt", () => {
    const { unmount } = render(
      <Nip85ConsentCard pubkey={ME} value={true} onChange={() => {}} skipProviderCheck />,
    );
    expect(screen.getByText(/your signer will ask you to approve it/i)).toBeInTheDocument();
    unmount();

    // The in-app wizard's key signs silently — there is no signer to ask.
    render(
      <Nip85ConsentCard pubkey={ME} value={true} onChange={() => {}} skipProviderCheck silentSigner />,
    );
    expect(screen.queryByText(/your signer will ask/i)).toBeNull();
  });
});

describe("the pre-check verdicts", () => {
  it("another provider → replace warning, and the default flips to off", async () => {
    checkExistingTrustProvider.mockResolvedValue("other");
    const onChange = vi.fn();
    render(<Nip85ConsentCard pubkey={ME} taPubkey={TA} value={true} onChange={onChange} />);
    await waitFor(() => expect(screen.getByTestId("nip85-consent-replace-warning")).toBeInTheDocument());
    expect(checkExistingTrustProvider).toHaveBeenCalledWith(ME, TA);
    expect(onChange).toHaveBeenCalledWith(false);
  }, 10000);

  it("already on Brainstorm → collapses to the done-chip, no toggle, consent zeroed", async () => {
    checkExistingTrustProvider.mockResolvedValue("brainstorm");
    const onChange = vi.fn();
    render(<Nip85ConsentCard pubkey={ME} taPubkey={TA} value={true} onChange={onChange} />);
    await waitFor(() => expect(screen.getByTestId("nip85-consent-already-set")).toBeInTheDocument());
    expect(screen.queryByTestId("nip85-consent-toggle")).not.toBeInTheDocument();
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it("a verdict never overrides a switch the user already touched", async () => {
    let deliver!: (v: string) => void;
    checkExistingTrustProvider.mockReturnValue(new Promise<string>((r) => { deliver = r; }) as never);
    const onChange = vi.fn();
    render(<Nip85ConsentCard pubkey={ME} taPubkey={TA} value={true} onChange={onChange} />);
    fireEvent.click(screen.getByTestId("nip85-consent-toggle")); // their call: off…
    fireEvent.click(screen.getByTestId("nip85-consent-toggle")); // …then on again
    onChange.mockClear();
    deliver("other");
    await waitFor(() => expect(screen.getByTestId("nip85-consent-replace-warning")).toBeInTheDocument());
    expect(onChange).not.toHaveBeenCalled(); // warned, but their choice stands
  });
});
