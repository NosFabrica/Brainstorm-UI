// @vitest-environment jsdom
/** The admin console's copy icon says what happened: a copy the browser refused is not "Copied". */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const toast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));
const copyToClipboard = vi.fn<(text: string) => Promise<boolean>>();
vi.mock("@/lib/clipboard", () => ({ copyToClipboard: (text: string) => copyToClipboard(text) }));

import { CopyButton } from "./CopyButton";

beforeEach(() => {
  toast.mockReset();
  copyToClipboard.mockReset();
});

describe("CopyButton", () => {
  it("says Copied once the copy landed", async () => {
    copyToClipboard.mockResolvedValue(true);
    render(<CopyButton text="npub1abcdefghijklmnopqrstuvwxyz" />);
    fireEvent.click(screen.getByTestId("button-copy-npub"));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Copied" })));
  });

  it("says it couldn't copy when the browser refused", async () => {
    copyToClipboard.mockResolvedValue(false);
    render(<CopyButton text="npub1abcdefghijklmnopqrstuvwxyz" />);
    fireEvent.click(screen.getByTestId("button-copy-npub"));
    await waitFor(() => expect(toast).toHaveBeenCalled());
    expect(toast).not.toHaveBeenCalledWith(expect.objectContaining({ title: "Copied" }));
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" }));
  });
});
