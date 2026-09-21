// @vitest-environment jsdom
/**
 * /setup/activate with Trusted Lists. A first activation names the user's lists
 * in the same signature; someone already activated isn't walked through setup
 * again — they see their success card, with the one-tap update beneath it.
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
vi.mock("@/components/ListsUpdate", () => ({ ListsUpdateLine: () => <div data-testid="line-lists-update" /> }));
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

  it("an activated account with lists waiting sees its success card, with the update beneath — not a redo", () => {
    page.activateDone = true;
    page.listsPending = true;
    page.provider = "brainstorm";
    page.lists = { status: "missing", designation: LISTS };
    renderWithProviders(<ActivateBrainstormPage />);

    expect(screen.getByTestId("text-activate-page-success")).toHaveTextContent(/is active/i);
    expect(screen.getByTestId("line-lists-update")).toBeInTheDocument();
    expect(screen.queryByTestId("button-activate-page-confirm")).toBeNull();
  });

  it("a first activation names the lists too, in the same signature", async () => {
    page.lists = { status: "missing", designation: LISTS };
    publish.mockResolvedValue({ status: "success" });
    renderWithProviders(<ActivateBrainstormPage />);

    fireEvent.click(screen.getByTestId("button-activate-page-confirm"));

    await waitFor(() => expect(publish).toHaveBeenCalledWith(ME, TA, expect.any(Function), { lists: LISTS }));
  });
});
