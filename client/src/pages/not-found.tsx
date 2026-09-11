import { Link } from "wouter";
import { PRIMARY_ACTION, SECONDARY_LINK, SorryFrame } from "@/components/sorry/SorryPage";

/**
 * The app's not-found page.
 *
 * Rewritten because it stopped being a developer's placeholder. Its copy used
 * to read "Did you forget to add the page to the router?" — a note to whoever
 * built the app, shown to whoever visited it.
 *
 * Tag pages now route here when the tag doesn't exist (issue #41 B3), which
 * makes this a page ordinary people reach by clicking a link someone sent them.
 * It deliberately says nothing about what they were looking for: the URL is
 * supplied by whoever wrote the link, and echoing it back is exactly what B3
 * was about. Two ways onward, no blame, no jargon.
 *
 * It wears the house error page — the ostrich and the "Oops!" (Benjamin,
 * 2026-09-11) — but keeps its own words: a missing page isn't a server running
 * behind, so there's no Try again.
 */
export default function NotFound() {
  return (
    <SorryFrame
      testId="not-found"
      headline="Oops!"
      line="This page isn't here."
      body="The link might be out of date, or have a typo in it."
    >
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Link href="/" className={PRIMARY_ACTION} data-testid="notfound-home">
          Go home
        </Link>
        <Link href="/tags" className={SECONDARY_LINK} data-testid="notfound-browse-tags">
          Browse tags
        </Link>
      </div>
    </SorryFrame>
  );
}
