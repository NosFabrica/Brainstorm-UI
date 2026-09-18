// @vitest-environment jsdom
/**
 * /setup/activate with Trusted Lists. The Treasure Map (kind 10040) has to
 * name the user's lists for other apps to find them: an activated account whose
 * lists aren't in it is asked to publish again, and a first activation names
 * them in the same signature.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";

const ME = "a".repeat(64);
const TA = "b".repeat(64);
const LISTS = { key: TA, relay: "wss://nip85-staging.example" };
const page = vi.hoisted(() => ({
  activateDone: false,
  listsPending: false,
  provider: "none" as string,
  lists: undefined as unknown,
}));
const publish = vi.fn();

vi.mock("wouter", () => ({ useLocation: () => ["/setup/activate", () => {}] }));
vi.mock("@/components/AppHeader", () => ({ AppHeader: () => null }));
vi.mock("@/accounts/login-flow", () => ({ logout: () => {} }));
vi.mock("@/services/trustAnchor", () => ({ publishBrainstormTrustAnchor: (...a: unknown[]) => publish(...a) }));
vi.mock("@/hooks/useActiveAccountDisplay", () => ({ useActiveAccountDisplay: () => ({ pubkey: "a".repeat(64), displayName: "Lira" }) }));
vi.mock("@/hooks/useFinishSetup", () => ({
  useFinishSetup: () => ({ followDone: true, activateDone: page.activateDone, listsPending: page.listsPending }),
}));
vi.mock("@/hooks/useSelf", () => ({ useSelfHistory: () => ({ data: { data: { ta_pubkey: "b".repeat(64) } } }) }));
vi.mock("@/hooks/useTrustProviderStatus", () => ({ useTrustProviderStatus: () => ({ data: page.provider }) }));
vi.mock("@/hooks/useTrustListsStatus", () => ({ useTrustListsStatus: () => ({ data: page.lists }) }));

import ActivateBrainstormPage from "./ActivateBrainstormPage";

describe("ActivateBrainstormPage — Trusted Lists", () => {
  beforeEach(() => {
    publish.mockReset();
    page.activateDone = false;
    page.listsPending = false;
    page.provider = "none";
    page.lists = undefined;
  });

  it("asks an activated account with Trusted Lists to publish again, naming the lists", async () => {
    page.listsPending = true;
    page.provider = "brainstorm";
    page.lists = { status: "missing", designation: LISTS };
    publish.mockResolvedValue({ status: "success" });
    renderWithProviders(<ActivateBrainstormPage />);

    expect(screen.getByTestId("text-activate-page-title")).toHaveTextContent(/publish your treasure map again/i);
    fireEvent.click(screen.getByTestId("button-activate-page-confirm"));

    await waitFor(() => expect(publish).toHaveBeenCalledWith(ME, TA, expect.any(Function), { lists: LISTS }));
    expect(await screen.findByTestId("text-activate-page-success")).toHaveTextContent(/updated/i);
  });

  it("a first activation names the lists too, in the same signature", async () => {
    page.lists = { status: "missing", designation: LISTS };
    publish.mockResolvedValue({ status: "success" });
    renderWithProviders(<ActivateBrainstormPage />);

    expect(screen.getByTestId("text-activate-page-title")).toHaveTextContent(/activate your/i);
    fireEvent.click(screen.getByTestId("button-activate-page-confirm"));

    await waitFor(() => expect(publish).toHaveBeenCalledWith(ME, TA, expect.any(Function), { lists: LISTS }));
  });
});
