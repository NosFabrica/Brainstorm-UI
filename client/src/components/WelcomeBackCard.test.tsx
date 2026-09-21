// @vitest-environment jsdom
/**
 * The card says "Welcomed them back" — it must only say it when the follow was
 * really published. It used to toast that unconditionally and tick the person
 * off optimistically, so a refused publish (relays unreachable) looked exactly
 * like a success.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";

const JOINER = { pubkey: "b".repeat(64), name: "Ana" };

const toast = vi.fn();
const welcomeBack = vi.fn(async (_pks: string[]) => true);
const dismiss = vi.fn();

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));
vi.mock("@/hooks/useNewJoiners", () => ({
  useNewJoiners: () => ({
    joiners: [JOINER],
    welcomeBack: (...a: unknown[]) => welcomeBack(...(a as [string[]])),
    dismiss,
    busy: false,
    established: true,
  }),
}));
vi.mock("@/components/PersonRow", () => ({
  PersonRow: ({ person }: { person: { pubkey: string } }) => <div data-testid={`row-${person.pubkey.slice(0, 6)}`} />,
}));

import { WelcomeBackCard } from "./WelcomeBackCard";

const welcome = async () => {
  renderWithProviders(<WelcomeBackCard />);
  const button = await screen.findByTestId(/button-welcome-back(-all)?$/);
  fireEvent.click(button);
  await waitFor(() => expect(welcomeBack).toHaveBeenCalled());
};

describe("welcoming someone back from the card", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    welcomeBack.mockResolvedValue(true);
  });

  it("says the welcome didn't go through, instead of claiming it did", async () => {
    welcomeBack.mockResolvedValue(false);

    await welcome();

    await waitFor(() => expect(toast).toHaveBeenCalled());
    const [{ title, description, variant }] = toast.mock.calls.at(-1) as [
      { title: string; description?: string; variant?: string },
    ];
    expect(`${title} ${description ?? ""}`).not.toMatch(/Welcomed/i);
    expect(variant).toBe("destructive");
  });

  it("says so when it really went out", async () => {
    await welcome();

    await waitFor(() => expect(toast).toHaveBeenCalled());
    const [{ title }] = toast.mock.calls.at(-1) as [{ title: string }];
    expect(title).toMatch(/Welcomed/i);
  });
});
