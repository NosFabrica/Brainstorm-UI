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
const OTHER = "c".repeat(64);
const page = vi.hoisted(() => ({
  activateDone: false,
  listsPending: false,
  provider: "none" as string,
  lists: undefined as unknown,
  /** The reader's 10040 as the store holds it; a test sets whose rank duty it names. */
  map: null as null | { tags: string[][] },
  /** The provider's profile, when its kind 0 has loaded. */
  providerProfile: undefined as undefined | { display_name?: string; name?: string; picture?: string },
}));
const publish = vi.fn();

vi.mock("wouter", () => ({ useLocation: () => ["/setup/activate", () => {}] }));
vi.mock("@/components/AppHeader", () => ({ AppHeader: () => null }));
vi.mock("@/components/ListsUpdate", () => ({ ListsUpdateLine: () => <div data-testid="line-lists-update" /> }));
vi.mock("@/accounts/login-flow", () => ({ logout: () => {} }));
vi.mock("@/services/trustAnchor", () => ({ publishBrainstormTrustAnchor: (...a: unknown[]) => publish(...a) }));
vi.mock("@/hooks/useActiveAccountDisplay", () => ({
  useActiveAccountDisplay: () => ({ pubkey: "a".repeat(64), displayName: "Lira" }),
}));
vi.mock("@/hooks/useFinishSetup", () => ({
  useFinishSetup: () => ({ followDone: true, activateDone: page.activateDone, listsPending: page.listsPending }),
}));
vi.mock("@/hooks/useSelf", () => ({ useSelfHistory: () => ({ data: { data: { ta_pubkey: "b".repeat(64) } } }) }));
vi.mock("@/hooks/useTrustProviderStatus", () => ({
  useTrustProviderStatus: () => ({ data: page.provider }),
  useTrustProviderList: () => ({ event: page.map, settled: true }),
}));
vi.mock("@/hooks/useLiveProfile", () => ({
  useLiveProfile: () => ({ profile: page.providerProfile, event: undefined, loading: false }),
}));
vi.mock("@/hooks/useTrustListsStatus", () => ({ useTrustListsStatus: () => ({ data: page.lists }) }));

import ActivateBrainstormPage from "./ActivateBrainstormPage";

describe("ActivateBrainstormPage — Trusted Lists", () => {
  beforeEach(() => {
    publish.mockReset();
    page.activateDone = false;
    page.listsPending = false;
    page.provider = "none";
    page.lists = undefined;
    page.map = null;
    page.providerProfile = undefined;
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

/**
 * Another Assistant has the rank duty: /setup counts the step as done (their
 * choice), so this page is its optional switch — the same publish, said as a
 * swap, with nothing shown locked out — until Brainstorm's Assistant has it.
 */
describe("ActivateBrainstormPage — another Assistant on rank", () => {
  beforeEach(() => {
    publish.mockReset();
    page.activateDone = true;
    page.listsPending = false;
    page.provider = "other";
    page.lists = undefined;
  });

  it("offers the switch, not its success card, and then shows that card", async () => {
    publish.mockResolvedValue({ status: "success" });
    renderWithProviders(<ActivateBrainstormPage />);

    expect(screen.queryByTestId("text-activate-page-success")).toBeNull();
    expect(screen.getByTestId("text-activate-page-title")).toHaveTextContent(
      "Use your Brainstorm Assistant for scores",
    );
    expect(screen.getByTestId("text-activate-page-replace-warning")).toBeInTheDocument();
    expect(screen.queryByTestId("activate-page-locked-clients")).toBeNull();
    expect(screen.getByTestId("button-activate-page-confirm")).toHaveTextContent("Switch to Brainstorm");

    fireEvent.click(screen.getByTestId("button-activate-page-confirm"));

    await waitFor(() => expect(publish).toHaveBeenCalledWith(ME, TA, expect.any(Function), { lists: null }));
    expect(await screen.findByTestId("text-activate-page-success")).toBeInTheDocument();
  });
});

/**
 * "Another provider" is never nameless: the page says who publishes the
 * reader's scores today — by name once its profile has loaded, by short npub
 * until then — and where, so switching is a choice between two named things.
 */
describe("ActivateBrainstormPage — naming the Assistant that holds the rank duty", () => {
  beforeEach(() => {
    publish.mockReset();
    page.activateDone = true;
    page.listsPending = false;
    page.provider = "other";
    page.lists = undefined;
    page.map = {
      tags: [
        ["30382:rank", OTHER, "wss://scores.brainstorm.world"],
        ["30382:followers", OTHER, "wss://scores.brainstorm.world"],
      ],
    };
    page.providerProfile = { display_name: "Pip's Brainstorm Assistant" };
  });

  it("names the provider and its relay in the lead, the warning, and the way out", () => {
    renderWithProviders(<ActivateBrainstormPage />);
    const provider = screen.getByTestId("activate-page-provider");
    expect(provider).toHaveTextContent("Pip's Brainstorm Assistant");
    expect(provider).toHaveTextContent("scores.brainstorm.world");
    expect(screen.getByTestId("text-activate-page-replace-warning")).toHaveTextContent(
      "replaces Pip's Brainstorm Assistant",
    );
    expect(screen.getByTestId("button-activate-page-later")).toHaveTextContent("keep Pip's Brainstorm Assistant");
  });

  it("falls back to the provider's short npub until its profile loads", () => {
    page.providerProfile = undefined;
    renderWithProviders(<ActivateBrainstormPage />);
    expect(screen.getByTestId("activate-page-provider")).toHaveTextContent(/npub1[a-z0-9]{5}…/);
  });
});
