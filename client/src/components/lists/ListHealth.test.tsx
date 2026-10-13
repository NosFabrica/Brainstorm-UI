/**
 * A list's health summary: the totals, how items read, and the problems that
 * recur, each of which filters the items table when pressed.
 */
import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/utils";
import type { ListSummary } from "@/lib/listHealth";
import { ListHealth } from "./ListHealth";

const summary: ListSummary = {
  items: 200,
  curators: 2,
  withProblems: 30,
  blocked: 4,
  coverage: [
    { role: "title", count: 200 },
    { role: "image", count: 1 },
  ],
  problems: [
    {
      key: "link-unusable:website",
      code: "link-unusable",
      field: "website",
      items: 30,
      blocking: false,
      example: '"website" isn\'t an http(s) URL, so the item has no link.',
    },
  ],
};

describe("ListHealth", () => {
  it("shows the totals, how items read, and each problem", () => {
    renderWithProviders(<ListHealth summary={summary} truncated={false} activeProblem={null} onProblem={() => {}} />);
    expect(screen.getByTestId("list-health-tile-items")).toHaveTextContent("200");
    expect(screen.getByTestId("list-health-tile-blocked")).toHaveTextContent("4");
    expect(screen.getByTestId("list-health-coverage-image")).toHaveTextContent("0.5%");
    expect(screen.getByTestId("list-health-problem-link-unusable:website")).toHaveTextContent("15.0%");
    expect(screen.queryByTestId("list-items-truncated")).toBeNull();
  });

  it("a problem row filters, and pressing the active one clears it", async () => {
    const onProblem = vi.fn();
    const { rerender } = renderWithProviders(
      <ListHealth summary={summary} truncated={false} activeProblem={null} onProblem={onProblem} />,
    );
    await userEvent.click(screen.getByTestId("list-health-problem-link-unusable:website"));
    expect(onProblem).toHaveBeenLastCalledWith("link-unusable:website");
    rerender(
      <ListHealth summary={summary} truncated={false} activeProblem="link-unusable:website" onProblem={onProblem} />,
    );
    await userEvent.click(screen.getByTestId("list-health-problem-link-unusable:website"));
    expect(onProblem).toHaveBeenLastCalledWith(null);
  });

  it("says when the relay's answer was cut off, and when nothing is wrong", () => {
    renderWithProviders(
      <ListHealth summary={{ ...summary, problems: [] }} truncated activeProblem={null} onProblem={() => {}} />,
    );
    expect(screen.getByTestId("list-items-truncated")).toHaveTextContent("maximum of 10,000 items");
    expect(screen.getByTestId("list-health-tile-items")).toHaveTextContent("Items read");
    expect(screen.getByTestId("list-health-no-problems")).toBeInTheDocument();
  });

  it("a problem row can be pressed from the keyboard, and says when it is the active one", async () => {
    const onProblem = vi.fn();
    const { rerender } = renderWithProviders(
      <ListHealth summary={summary} truncated={false} activeProblem={null} onProblem={onProblem} />,
    );
    const button = screen.getByRole("button", { name: /Link unusable/ });
    expect(button).toHaveAttribute("aria-pressed", "false");
    await userEvent.tab();
    expect(button).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    expect(onProblem).toHaveBeenCalledTimes(1);
    expect(onProblem).toHaveBeenLastCalledWith("link-unusable:website");
    rerender(
      <ListHealth summary={summary} truncated={false} activeProblem="link-unusable:website" onProblem={onProblem} />,
    );
    expect(screen.getByRole("button", { name: /Link unusable/ })).toHaveAttribute("aria-pressed", "true");
  });

  it("marks a blocking problem, and draws no bars or shares for an empty list", () => {
    const blocking = {
      ...summary.problems[0],
      key: "required-missing:name",
      code: "required-missing" as const,
      blocking: true,
    };
    renderWithProviders(
      <ListHealth
        summary={{ ...summary, items: 0, curators: 0, withProblems: 0, blocked: 0, coverage: [], problems: [blocking] }}
        truncated={false}
        activeProblem={null}
        onProblem={() => {}}
      />,
    );
    const row = screen.getByTestId("list-health-problem-required-missing:name");
    expect(row).toHaveTextContent("blocks publishing");
    expect(row).not.toHaveTextContent("%");
    expect(screen.queryByTestId("list-health-coverage-title")).toBeNull();
  });
});
