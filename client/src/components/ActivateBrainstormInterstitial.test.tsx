import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";

import { renderWithProviders } from "@/test/utils";
import { ActivateBrainstormInterstitial } from "./ActivateBrainstormInterstitial";

describe("ActivateBrainstormInterstitial", () => {
  it("frames activation as the last step of an almost-finished checklist", () => {
    renderWithProviders(
      <ActivateBrainstormInterstitial scoresReady onActivate={() => {}} onDismiss={() => {}} />,
    );

    expect(screen.getByTestId("interstitial-step-signin")).toHaveTextContent("Signed in");
    expect(screen.getByTestId("interstitial-step-scores")).toHaveTextContent("Scores calculated");
    expect(screen.getByTestId("interstitial-step-activate")).toHaveTextContent(
      "Activate your account",
    );
    expect(screen.getByTestId("text-interstitial-title")).toHaveTextContent(
      "Activate your Brainstorm account",
    );
    expect(screen.getByTestId("text-interstitial-subtitle")).toHaveTextContent(
      "Sign a note that tells other apps where to find your Brainstorm scores.",
    );
  });

  // Activation doesn't wait for scores — mid-calculation the step shows as
  // underway and says so, while the signature stays collectable.
  it("shows scores as underway, not blocking, while the first calculation runs", () => {
    renderWithProviders(
      <ActivateBrainstormInterstitial scoresReady={false} onActivate={() => {}} onDismiss={() => {}} />,
    );

    expect(screen.getByTestId("interstitial-step-scores")).toHaveTextContent(
      "Calculating your scores",
    );
    expect(screen.getByTestId("interstitial-step-scores")).toHaveTextContent(
      "Keeps running while you activate.",
    );
    expect(screen.getByTestId("button-interstitial-activate")).toBeEnabled();
  });

  it("shows the consequence — locked apps that can't read the scores", () => {
    renderWithProviders(
      <ActivateBrainstormInterstitial scoresReady onActivate={() => {}} onDismiss={() => {}} />,
    );

    expect(screen.getByTestId("interstitial-app-amethyst")).toBeInTheDocument();
    expect(screen.getByTestId("interstitial-app-nostria")).toBeInTheDocument();
    expect(screen.getByTestId("interstitial-apps-locked")).toHaveTextContent(
      "Amethyst and Nostria can't see your scores yet.",
    );
  });

  it("opens the signing flow from the primary button", () => {
    const onActivate = vi.fn();
    renderWithProviders(
      <ActivateBrainstormInterstitial scoresReady onActivate={onActivate} onDismiss={() => {}} />,
    );

    fireEvent.click(screen.getByTestId("button-interstitial-activate"));

    expect(onActivate).toHaveBeenCalledTimes(1);
  });

  it("lets the user defer — with the consequence named on the link", () => {
    const onDismiss = vi.fn();
    renderWithProviders(
      <ActivateBrainstormInterstitial scoresReady onActivate={() => {}} onDismiss={onDismiss} />,
    );

    const later = screen.getByTestId("button-interstitial-later");
    expect(later).toHaveTextContent("Maybe later — my scores stay invisible in other apps for now");
    fireEvent.click(later);

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
