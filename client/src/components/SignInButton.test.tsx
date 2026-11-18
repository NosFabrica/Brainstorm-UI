// @vitest-environment jsdom
/**
 * The header's Sign in, pressed on a search's results: it carries the query to
 * /login, so signing in returns to those results instead of an empty home.
 * The app's real (browser) location, as in the app: its path has no query.
 */
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { SignInButton } from "./SignInButton";

describe("SignInButton", () => {
  it("pressed on a search's results, goes to /login carrying the search", () => {
    window.history.replaceState(null, "", "/?q=jack");
    render(<SignInButton />);
    fireEvent.click(screen.getByTestId("button-sign-in"));
    expect(window.location.pathname + window.location.search).toBe("/login?next=%2F%3Fq%3Djack");
  });
});
