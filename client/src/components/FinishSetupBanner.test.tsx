import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { FinishSetupBanner } from "./FinishSetupBanner";
import type { FinishSetupState } from "@/hooks/useFinishSetup";

const navigate = vi.fn();
let location = "/dashboard";

vi.mock("wouter", () => ({ useLocation: () => [location, navigate] }));
// The update pill has its own tests (ListsUpdate.test); here only who shows it.
vi.mock("./ListsUpdate", () => ({ ListsUpdatePill: () => <div data-testid="pill-lists-update" /> }));

const setupState = vi.fn<() => Partial<FinishSetupState>>();
vi.mock("@/hooks/useFinishSetup", () => ({
  useFinishSetup: () => ({ signedIn: true, remaining: 0, ...setupState() }),
}));

describe("FinishSetupBanner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    location = "/dashboard";
  });

  it("shows the confident step count and routes to /setup", () => {
    setupState.mockReturnValue({ remaining: 2 });
    render(<FinishSetupBanner />);

    expect(screen.getByTestId("banner-finish-setup-count")).toHaveTextContent("2 steps left");
    fireEvent.click(screen.getByTestId("banner-finish-setup"));
    expect(navigate).toHaveBeenCalledWith("/setup");
  });

  it("stays hidden when nothing is verifiably left to do", () => {
    setupState.mockReturnValue({ remaining: 0 });
    render(<FinishSetupBanner />);
    expect(screen.queryByTestId("banner-finish-setup")).not.toBeInTheDocument();
  });

  it("stays hidden for signed-out visitors", () => {
    setupState.mockReturnValue({ signedIn: false, remaining: 2 });
    render(<FinishSetupBanner />);
    expect(screen.queryByTestId("banner-finish-setup")).not.toBeInTheDocument();
  });

  it("stays hidden on the setup pages it points at", () => {
    location = "/setup/activate";
    setupState.mockReturnValue({ remaining: 1 });
    render(<FinishSetupBanner />);
    expect(screen.queryByTestId("banner-finish-setup")).not.toBeInTheDocument();
  });

  // Setup done, lists waiting: a friendly update, not the setup warning.
  it("offers the lists update once setup is done — never as a setup step", () => {
    setupState.mockReturnValue({ remaining: 0, listsPending: true });
    render(<FinishSetupBanner />);
    expect(screen.getByTestId("pill-lists-update")).toBeInTheDocument();
    expect(screen.queryByTestId("banner-finish-setup")).not.toBeInTheDocument();
  });

  it("real setup steps come first, and the setup pages carry the update themselves", () => {
    setupState.mockReturnValue({ remaining: 1, listsPending: true });
    const { unmount } = render(<FinishSetupBanner />);
    expect(screen.getByTestId("banner-finish-setup")).toBeInTheDocument();
    expect(screen.queryByTestId("pill-lists-update")).not.toBeInTheDocument();
    unmount();

    location = "/setup";
    setupState.mockReturnValue({ remaining: 0, listsPending: true });
    render(<FinishSetupBanner />);
    expect(screen.queryByTestId("pill-lists-update")).not.toBeInTheDocument();
  });
});
