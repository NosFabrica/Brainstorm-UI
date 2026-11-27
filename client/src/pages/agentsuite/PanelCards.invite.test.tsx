// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import type { useSocialActions } from "@/hooks/useSocialActions";

const toast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));
const copyToClipboard = vi.fn();
vi.mock("@/lib/clipboard", () => ({
  dialogOf: () => null,
  copyToClipboard: (...a: unknown[]) => copyToClipboard(...a),
}));
vi.mock("@/services/nostr", () => ({ fetchProfiles: vi.fn() }));

import { InviteCard } from "./PanelCards";

const socialActions = {} as ReturnType<typeof useSocialActions>;

afterEach(() => {
  cleanup();
  toast.mockReset();
  copyToClipboard.mockReset();
});

describe("InviteCard's invite link", () => {
  it("says it was copied only once the copy succeeded", async () => {
    let finish: (ok: boolean) => void = () => {};
    copyToClipboard.mockReturnValue(new Promise<boolean>((r) => (finish = r)));
    const { getByTestId } = render(<InviteCard socialActions={socialActions} />);
    fireEvent.click(getByTestId("button-copy-invite-link"));
    expect(copyToClipboard).toHaveBeenCalledTimes(1);
    expect(toast).not.toHaveBeenCalled();

    finish(true);
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Invite link copied!" })));
  });

  it("says so when the copy failed", async () => {
    copyToClipboard.mockResolvedValue(false);
    const { getByTestId } = render(<InviteCard socialActions={socialActions} />);
    fireEvent.click(getByTestId("button-copy-invite-link"));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" })));
    expect(toast).not.toHaveBeenCalledWith(expect.objectContaining({ title: "Invite link copied!" }));
  });
});
