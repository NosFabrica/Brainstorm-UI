// @vitest-environment jsdom
/** The privacy page names the same four location sources the search's explainer does. */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// The layout needs the app's providers; the words are what this checks.
vi.mock("@/components/LegalDocLayout", () => ({
  LegalDocLayout: ({ sections }: { sections: unknown }) => (
    <div data-testid="privacy-location">{JSON.stringify(sections)}</div>
  ),
}));

import PrivacyPage from "./PrivacyPage";

describe("PrivacyPage", () => {
  it("says what places you: the words, the browser's language, a network guess, and a tapped position", () => {
    render(<PrivacyPage />);
    const page = screen.getByTestId("privacy-location");
    expect(page).toHaveTextContent(/words you type/i);
    expect(page).toHaveTextContent(/browser's language/i);
    expect(page).toHaveTextContent(/network/i);
    expect(page).toHaveTextContent(/near me/i);
    expect(page).toHaveTextContent(/not stored/i);
  });
});
