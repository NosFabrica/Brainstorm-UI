// @vitest-environment jsdom
/**
 * The book page's reviews, written the books contract's way (#253): one review per person. A
 * reader who has one opens it to change it — their stars and words as they left them — and the
 * change replaces it; they can also take it down. Someone else's review offers neither.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";

const ME = "f".repeat(64);
const OTHER = "a".repeat(64);
vi.mock("@/hooks/useActiveAccountDisplay", () => ({ useActiveAccountDisplay: () => ({ pubkey: ME }) }));
vi.mock("@/components/score/VerificationCoin", () => ({ useTierRing: () => () => null }));
const io = vi.hoisted(() => ({ publishBookReview: vi.fn(), removeBookReview: vi.fn() }));
vi.mock("@/services/bookReviews", () => ({
  fetchBookReviews: async () => [],
  publishBookReview: io.publishBookReview,
  removeBookReview: io.removeBookReview,
}));

import { BookReviews } from "./BookReviews";

const item = { id: "1".repeat(64), kind: 39999, pubkey: "6".repeat(64), tags: [["d", "ol-ol1w"]] };
const review = (pubkey: string, text: string, rating: number) => ({
  id: `${pubkey.slice(0, 2)}-review`,
  pubkey,
  at: 1,
  text,
  photos: [],
  price: null,
  paid: null,
  rating,
  tags: [
    ["d", `book:39999:${item.pubkey}:ol-ol1w`],
    ["m", "book"],
    ["s", String(rating)],
  ],
});
const ranked = (reviews: ReturnType<typeof review>[]) =>
  ({
    reviews,
    pending: false,
    nameOf: (pk: string) => (pk === ME ? "Me" : "Reader"),
    pictureOf: () => undefined,
    npubOf: () => undefined,
    scoreOf: () => null,
  }) as never;

beforeEach(() => vi.clearAllMocks());

describe("BookReviews", () => {
  it("opens the reader's own review to change it, and the change replaces it", async () => {
    const mine = review(ME, "Read it in three sittings.", 4);
    io.publishBookReview.mockResolvedValue({ ...mine, text: "Better the second time.", rating: 5 });
    renderWithProviders(
      <BookReviews item={item} title="The storm before the storm" ranked={ranked([mine, review(OTHER, "Fine.", 3)])} />,
    );
    const box = screen.getByLabelText("Your review") as HTMLTextAreaElement;
    expect(box.value).toBe("Read it in three sittings.");
    expect(screen.getByRole("button", { name: "4 stars" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.change(box, { target: { value: "Better the second time." } });
    fireEvent.click(screen.getByRole("button", { name: "5 stars" }));
    fireEvent.click(screen.getByRole("button", { name: "Update review" }));
    await waitFor(() => expect(io.publishBookReview).toHaveBeenCalledTimes(1));
    const [, draft, options] = io.publishBookReview.mock.calls[0];
    expect(draft).toEqual({ text: "Better the second time.", rating: 5 });
    expect(options).toMatchObject({ title: "The storm before the storm", previous: { tags: mine.tags } });
  });

  it("lets the reader take their own review down, and nobody else's", async () => {
    const mine = review(ME, "Read it in three sittings.", 4);
    io.removeBookReview.mockResolvedValue(undefined);
    renderWithProviders(
      <BookReviews item={item} title="The storm before the storm" ranked={ranked([mine, review(OTHER, "Fine.", 3)])} />,
    );
    expect(screen.getAllByRole("button", { name: "Remove" })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove review" }));
    await waitFor(() => expect(io.removeBookReview).toHaveBeenCalledWith(mine));
  });

  it("starts empty for a reader with no review yet, and posts a new one", async () => {
    io.publishBookReview.mockResolvedValue(review(ME, "Loved it.", 5));
    renderWithProviders(<BookReviews item={item} title="Dune" ranked={ranked([review(OTHER, "Fine.", 3)])} />);
    expect((screen.getByLabelText("Your review") as HTMLTextAreaElement).value).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "5 stars" }));
    fireEvent.click(screen.getByRole("button", { name: "Post review" }));
    await waitFor(() => expect(io.publishBookReview).toHaveBeenCalledTimes(1));
    expect(io.publishBookReview.mock.calls[0][2]).toMatchObject({ title: "Dune", previous: undefined });
  });
});
