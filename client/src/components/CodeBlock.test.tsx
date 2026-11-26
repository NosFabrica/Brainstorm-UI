// @vitest-environment jsdom
/** A code block's Copy button turns to "Copied" only when the copy landed. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const copyToClipboard = vi.fn<(text: string) => Promise<boolean>>();
vi.mock("@/lib/clipboard", () => ({ dialogOf: () => null, copyToClipboard: (text: string) => copyToClipboard(text) }));

import { CodeBlock } from "./CodeBlock";

beforeEach(() => copyToClipboard.mockReset());

describe("CodeBlock", () => {
  it("shows Copied after a copy that landed", async () => {
    copyToClipboard.mockResolvedValue(true);
    render(<CodeBlock code="npm i" testId="cmd" />);
    fireEvent.click(screen.getByTestId("button-copy-cmd"));
    expect(await screen.findByText("Copied")).toBeTruthy();
  });

  it("says Couldn't copy when the browser refused, never Copied", async () => {
    copyToClipboard.mockResolvedValue(false);
    render(<CodeBlock code="npm i" testId="cmd" />);
    fireEvent.click(screen.getByTestId("button-copy-cmd"));
    expect(await screen.findByText("Couldn't copy")).toBeTruthy();
    expect(copyToClipboard).toHaveBeenCalledWith("npm i");
    expect(screen.queryByText("Copied")).toBeNull();
  });
});
