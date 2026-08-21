import { describe, expect, it } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";

import { renderWithProviders } from "@/test/utils";
import { requestSignerApproval, signerApproval$ } from "@/accounts/signer-approval";
import { SignerApprovalModal } from "./SignerApprovalModal";

const AUTH_URL = "https://use.nsec.app/key/npub1?confirm-connect=true";

describe("the approval prompt", () => {
  it("shows nothing until a signer asks", () => {
    renderWithProviders(<SignerApprovalModal />);
    expect(screen.queryByTestId("signer-approval-modal")).not.toBeInTheDocument();
  });

  it("puts the URL behind a real link, so no popup blocker sees it", async () => {
    renderWithProviders(<SignerApprovalModal />);
    void requestSignerApproval(AUTH_URL);

    await waitFor(() => expect(screen.getByTestId("signer-approval-modal")).toBeInTheDocument());
    const link = screen.getByTestId("link-approval-open");
    expect(link).toHaveAttribute("href", AUTH_URL);
    // An anchor the user clicks — not window.open from a relay callback.
    expect(link.tagName).toBe("A");
  });

  it("settles the waiting request when they follow the link", async () => {
    renderWithProviders(<SignerApprovalModal />);
    const waiting = requestSignerApproval(AUTH_URL);

    await waitFor(() => expect(screen.getByTestId("link-approval-open")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("link-approval-open"));

    await expect(waiting).resolves.toBeUndefined();
    await waitFor(() => expect(signerApproval$.value).toBeNull());
  });

  it("settles rather than throws when they decline — the request may still land", async () => {
    renderWithProviders(<SignerApprovalModal />);
    const waiting = requestSignerApproval(AUTH_URL);

    await waitFor(() => expect(screen.getByTestId("button-approval-dismiss")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("button-approval-dismiss"));

    await expect(waiting).resolves.toBeUndefined();
  });
});
