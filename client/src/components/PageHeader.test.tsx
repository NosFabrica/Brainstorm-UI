/**
 * The page masthead can seat an action beside its title — the hashtag page's
 * ⋯ (2026-09-08). Without one, nothing about the header changes.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PageHeader } from "./PageHeader";

describe("PageHeader", () => {
  it("without actions the title is the header's own child", () => {
    render(<PageHeader kicker="Topic" title="#bitcoin" testId="ph" />);
    const header = screen.getByTestId("ph");
    const h1 = header.querySelector("h1")!;
    expect(h1.parentElement).toBe(header);
  });

  it("with actions, the node sits in the title row", () => {
    render(<PageHeader kicker="Topic" title="#bitcoin" testId="ph" actions={<button data-testid="act">⋯</button>} />);
    const header = screen.getByTestId("ph");
    const h1 = header.querySelector("h1")!;
    const act = screen.getByTestId("act");
    expect(h1.parentElement).not.toBe(header);
    expect(h1.parentElement).toBe(act.parentElement?.parentElement);
  });
});
