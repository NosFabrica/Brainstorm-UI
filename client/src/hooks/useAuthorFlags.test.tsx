// @vitest-environment jsdom
/**
 * Rings and the Flagged chip read one shared memo of Trust signals. Every
 * author a page shows is asked for in one batched request, not one per author.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

type Signals = { influence: number | null; flagged: boolean };
const signalsMock = vi.fn<(pks: string[]) => Promise<Map<string, Signals>>>();
vi.mock("@/services/api", () => ({
  apiClient: { getTrustSignals: (pks: string[]) => signalsMock(pks) },
}));

import { useAuthorScores, __resetAuthorSignals } from "./useAuthorScores";
import { useAuthorFlags } from "./useAuthorFlags";

const A = "a".repeat(64);
const B = "b".repeat(64);
const pk = (i: number) => i.toString(16).padStart(64, "0");

function Probe({ pks }: { pks: string[] }) {
  const scoreOf = useAuthorScores(pks);
  const flagged = useAuthorFlags(pks);
  return (
    <ul>
      {pks.map((p) => (
        <li key={p} data-testid={`row-${p}`}>
          {String(scoreOf(p))}/{String(flagged(p))}
        </li>
      ))}
    </ul>
  );
}

const row = (p: string) => screen.getByTestId(`row-${p}`);

beforeEach(() => {
  vi.clearAllMocks();
  __resetAuthorSignals();
  signalsMock.mockImplementation(async (pks) => new Map(pks.filter((p) => p === A).map((p) => [p, { influence: 0.8, flagged: true }])));
});

describe("Trust signals for a page of authors", () => {
  it("scores and flags every author from one request shared by both hooks", async () => {
    render(<Probe pks={[A, B]} />);
    await waitFor(() => expect(row(A)).toHaveTextContent("0.8/true"));
    expect(row(B)).toHaveTextContent("null/false");
    expect(signalsMock).toHaveBeenCalledTimes(1);
    expect(signalsMock.mock.calls[0][0]).toEqual([A, B]);
  });

  it("scores all 100 authors of a full results page", async () => {
    const pks = Array.from({ length: 100 }, (_, i) => pk(i + 1));
    signalsMock.mockImplementation(async (asked) => new Map(asked.map((p) => [p, { influence: 0.5, flagged: false }])));
    render(<Probe pks={pks} />);
    await waitFor(() => expect(row(pks[99])).toHaveTextContent("0.5/false"));
    expect(signalsMock).toHaveBeenCalledTimes(1);
  });

  it("splits more than 500 authors across requests", async () => {
    const pks = Array.from({ length: 501 }, (_, i) => pk(i + 1));
    render(<Probe pks={pks} />);
    await waitFor(() => expect(row(pks[500])).toHaveTextContent("null/false"));
    expect(signalsMock.mock.calls.map(([asked]) => asked.length)).toEqual([500, 1]);
  });

  it("doesn't ask again for authors it already knows", async () => {
    const { rerender } = render(<Probe pks={[A]} />);
    await waitFor(() => expect(row(A)).toHaveTextContent("0.8/true"));
    rerender(<Probe pks={[A, B]} />);
    await waitFor(() => expect(row(B)).toHaveTextContent("null/false"));
    expect(signalsMock.mock.calls.map(([asked]) => asked)).toEqual([[A], [B]]);
  });

  it("leaves authors unrated when the batch answers nothing", async () => {
    signalsMock.mockResolvedValue(new Map());
    render(<Probe pks={[A]} />);
    await waitFor(() => expect(row(A)).toHaveTextContent("null/false"));
  });

  it("keeps a malformed pubkey out of the batch and matches pubkeys in any case", async () => {
    const upperA = A.toUpperCase();
    render(<Probe pks={[upperA, "not-a-pubkey", B]} />);
    await waitFor(() => expect(row(upperA)).toHaveTextContent("0.8/true"));
    expect(row("not-a-pubkey")).toHaveTextContent("null/false");
    expect(signalsMock.mock.calls.map(([asked]) => asked)).toEqual([[A, B]]);
  });

  it("is undefined until the answer lands — never a false 'clean'", () => {
    signalsMock.mockImplementation(() => new Promise(() => {}));
    render(<Probe pks={[A]} />);
    expect(row(A)).toHaveTextContent("undefined/undefined");
  });
});
