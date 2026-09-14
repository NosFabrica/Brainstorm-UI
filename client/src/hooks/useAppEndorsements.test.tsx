// @vitest-environment jsdom
/**
 * An app's endorsements for a component — with the discipline results pages
 * need: one fetch per address per session no matter how many cards ask, and
 * never more than a few in flight, so an Apps tab of a hundred hits doesn't
 * open hundreds of subscriptions at once.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";

type Deferred = { resolve: (v: unknown) => void };
const pending: Deferred[] = [];
const fetchMock = vi.fn(
  () =>
    new Promise((resolve) => {
      pending.push({ resolve });
    }),
);
vi.mock("@/services/endorsements", () => ({ fetchAppEndorsements: (...a: unknown[]) => fetchMock(...a) }));

import { useAppEndorsements, __resetAppEndorsementsCache } from "./useAppEndorsements";

const PUB = "b".repeat(64);
const addr = (d: string) => `32267:${PUB}:${d}`;

function Card({ d, reviewLimit = 8 }: { d: string; reviewLimit?: number }) {
  const e = useAppEndorsements(addr(d), { publisher: PUB, reviewLimit, zapLimit: 0 });
  return <div data-testid={`card-${d}`}>{e ? `reviews:${e.reviewCount}` : "…"}</div>;
}

beforeEach(() => {
  vi.clearAllMocks();
  pending.length = 0;
  __resetAppEndorsementsCache();
});

describe("useAppEndorsements", () => {
  it("fetches once per address and hands every card the same answer", async () => {
    render(
      <>
        <Card d="one" />
        <Card d="one" />
      </>,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(addr("one"), { publisher: PUB, reviewLimit: 8, zapLimit: 0 });
    await act(async () => {
      pending[0].resolve({ address: addr("one"), reviews: [], reviewCount: 14, zaps: [], zapCount: 0, collectionCount: 0 });
    });
    expect(screen.getAllByText("reviews:14")).toHaveLength(2);
  });

  it("keeps at most four fetches in flight, starting the next as one settles", async () => {
    render(
      <>
        {["a", "b", "c", "d", "e"].map((d) => (
          <Card key={d} d={d} />
        ))}
      </>,
    );
    expect(fetchMock).toHaveBeenCalledTimes(4);
    await act(async () => {
      pending[0].resolve({ address: addr("a"), reviews: [], reviewCount: 1, zaps: [], zapCount: 0, collectionCount: 0 });
    });
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(screen.getByTestId("card-a")).toHaveTextContent("reviews:1");
    expect(screen.getByTestId("card-e")).toHaveTextContent("…");
  });

  it("asks nothing for a listing without an address", () => {
    function NoAddr() {
      const e = useAppEndorsements(null, { publisher: PUB });
      return <span>{e ? "yes" : "no"}</span>;
    }
    render(<NoAddr />);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText("no")).toBeInTheDocument();
  });
});
