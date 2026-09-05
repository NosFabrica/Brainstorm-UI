// @vitest-environment jsdom
/**
 * At the top of an issue or patch page: what became of it, and which repo
 * it belongs to.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const statusesMock = vi.fn<(ids: string[]) => Promise<Map<string, { kind: number; at: number }>>>();
vi.mock("@/services/search", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/search")>()),
  fetchGitStatuses: (ids: string[]) => statusesMock(ids),
}));

import { GitStatusLine } from "./GitStatusLine";

const ISSUE = { id: "1".repeat(64), kind: 1621, pubkey: "a".repeat(64), created_at: 1, content: "crashes", tags: [["a", "30617:" + "9".repeat(64) + ":armada"], ["subject", "crashes"]] };

describe("GitStatusLine", () => {
  beforeEach(() => statusesMock.mockReset());
  it("names the state and the repo", async () => {
    statusesMock.mockResolvedValue(new Map([[ISSUE.id, { kind: 1632, at: 5 }]]));
    render(<GitStatusLine event={ISSUE} />);
    expect(await screen.findByTestId("git-status-state")).toHaveTextContent("Closed");
    expect(screen.getByTestId("git-status-repo")).toHaveTextContent("armada");
    expect(statusesMock).toHaveBeenCalledWith([ISSUE.id]);
  });
  it("an issue nobody has touched is open", async () => {
    statusesMock.mockResolvedValue(new Map());
    render(<GitStatusLine event={ISSUE} />);
    expect(await screen.findByTestId("git-status-state")).toHaveTextContent("Open");
  });
});
