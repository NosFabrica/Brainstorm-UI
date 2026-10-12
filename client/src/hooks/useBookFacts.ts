import { useQuery } from "@tanstack/react-query";
import { fetchBookFacts, type BookFacts } from "@/services/openLibrary";

/**
 * What our origin knows about a book from Open Library
 * (services/openLibrary), for the book's own page only: an HTTP read, so
 * react-query (ADR 0005). Asked once per book; the answer doesn't change
 * within a visit. Nothing is asked of a book with neither ISBN nor work id.
 */
export function useBookFacts(book: { isbn: string | null; workId: string | null } | null) {
  const isbn = book?.isbn ?? null;
  const workId = book?.workId ?? null;
  return useQuery<BookFacts | null>({
    queryKey: ["book-facts", isbn ?? "", workId ?? ""],
    queryFn: () => fetchBookFacts({ isbn, workId }),
    enabled: !!(isbn || workId),
    staleTime: Infinity,
    retry: false,
  });
}
