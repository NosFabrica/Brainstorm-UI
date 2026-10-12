// @vitest-environment jsdom
/**
 * "Reading from your network" shows four articles and lets the reader see more
 * in place, four at a time, without leaving the dashboard — while "See all"
 * stays as the way to the full list.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { renderWithProviders } from "@/test/utils";

const ME = "f".repeat(64);
const article = (i: number) => ({
  event: {
    id: `a${i}`.padEnd(64, "0"),
    kind: 30023,
    pubkey: i.toString(16).padStart(64, "0"),
    created_at: 1,
    content: "",
    tags: [],
  },
  author: { pubkey: i.toString(16).padStart(64, "0"), trustedFollowerCount: 4, hops: 2 },
});
const ARTICLES = Array.from({ length: 11 }, (_, i) => article(i));

vi.mock("@/hooks/useNetworkArticles", () => ({
  useNetworkArticles: () => ({ articles: ARTICLES, isLoading: false, isError: false, hasAuthors: true }),
}));
vi.mock("@/hooks/useLiveProfile", () => ({ useLiveProfiles: () => new Map() }));
vi.mock("@/components/dashboard/NetworkArticleCard", () => ({
  NetworkArticleCard: ({ article }: { article: { event: { id: string } } }) => (
    <div data-testid="network-article">{article.event.id}</div>
  ),
}));

import { NetworkArticlesModule } from "./NetworkArticlesModule";

function show() {
  const location = memoryLocation({ path: "/dashboard", record: true });
  renderWithProviders(
    <Router hook={location.hook}>
      <NetworkArticlesModule observer={ME} enabled />
    </Router>,
  );
  return location;
}

describe("NetworkArticlesModule", () => {
  it("shows four, then four more in place each time the reader asks, until the eleven are all on the dashboard", async () => {
    show();
    expect(await screen.findAllByTestId("network-article")).toHaveLength(4);
    const more = screen.getByTestId("network-articles-more");
    expect(more).toHaveTextContent("Show 4 more");
    fireEvent.click(more);
    expect(screen.getAllByTestId("network-article")).toHaveLength(8);
    expect(screen.getByTestId("network-articles-more")).toHaveTextContent("Show 3 more");
    fireEvent.click(screen.getByTestId("network-articles-more"));
    expect(screen.getAllByTestId("network-article")).toHaveLength(11);
    expect(screen.queryByTestId("network-articles-more")).toBeNull();
  });

  it("'See all' stays the way to the full list, before and after showing more", async () => {
    const location = show();
    const seeAll = await screen.findByTestId("network-articles-see-all");
    expect(seeAll).toHaveTextContent("See all 11 articles");
    fireEvent.click(screen.getByTestId("network-articles-more"));
    expect(screen.getByTestId("network-articles-see-all")).toHaveTextContent("See all 11 articles");
    fireEvent.click(screen.getByTestId("network-articles-see-all"));
    expect(location.history.at(-1)).toBe("/reading");
  });
});
