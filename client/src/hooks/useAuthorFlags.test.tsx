// @vitest-environment jsdom
/**
 * The house overview every ambient ring already fetches per author also says
 * whether the network has FLAGGED the account. useAuthorFlags reads that off
 * the same cache — the "reported" chip on a person card costs no request the
 * ring didn't already make.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const signalsMock = vi.fn<(pk: string) => Promise<{ influence: number | null; flagged: boolean }>>();
vi.mock("@/services/api", () => ({
  apiClient: { getHouseSignals: (pk: string) => signalsMock(pk) },
}));

import { useAuthorScores, __resetAuthorSignals } from "./useAuthorScores";
import { useAuthorFlags } from "./useAuthorFlags";

const A = "a".repeat(64);
const B = "b".repeat(64);

function Probe({ pks }: { pks: string[] }) {
  const scoreOf = useAuthorScores(pks);
  const flagged = useAuthorFlags(pks);
  return (
    <ul>
      {pks.map((pk) => (
        <li key={pk} data-testid={`row-${pk.slice(0, 1)}`}>
          {String(scoreOf(pk))}/{String(flagged(pk))}
        </li>
      ))}
    </ul>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  __resetAuthorSignals();
  signalsMock.mockImplementation(async (pk) => (pk === A ? { influence: 0.8, flagged: true } : { influence: null, flagged: false }));
});

describe("useAuthorFlags", () => {
  it("shares one overview fetch with the score ring and reports the flag", async () => {
    render(<Probe pks={[A, B]} />);
    await waitFor(() => expect(screen.getByTestId("row-a")).toHaveTextContent("0.8/true"));
    expect(screen.getByTestId("row-b")).toHaveTextContent("null/false");
    // One request per author, for both hooks together.
    expect(signalsMock).toHaveBeenCalledTimes(2);
  });

  it("is undefined until the answer lands — never a false 'clean'", () => {
    signalsMock.mockImplementation(() => new Promise(() => {}));
    render(<Probe pks={[A]} />);
    expect(screen.getByTestId("row-a")).toHaveTextContent("undefined/undefined");
  });
});
