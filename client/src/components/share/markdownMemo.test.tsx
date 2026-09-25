// @vitest-environment jsdom
/**
 * Parsing markdown (remark → GFM → sanitize) is the costly part of an article
 * or issue page, and the screens around these bodies re-render often — the
 * author's profile, trust score, comments and newer versions all land after
 * the text does. Only new text may parse again.
 */
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { useState, type ReactNode } from "react";
import { act } from "react";

let parses = 0;
vi.mock("react-markdown", async (importOriginal) => {
  const real = await importOriginal<typeof import("react-markdown")>();
  const Counted = (props: Parameters<typeof real.default>[0]) => {
    parses += 1;
    return real.default(props);
  };
  return { ...real, default: Counted };
});

import { MarkdownBody } from "./MarkdownBody";
import { ArticleBody } from "./ArticleScreen";

/** A parent that re-renders on demand without changing its child's props. */
function Rerendering({ child }: { child: (tick: number) => ReactNode }) {
  const [tick, setTick] = useState(0);
  return (
    <>
      <button type="button" onClick={() => setTick((t) => t + 1)}>tick</button>
      {child(tick)}
    </>
  );
}

const MARKDOWN = "# Title\n\nSome **bold** text and a [link](https://example.com).\n\n- one\n- two";

describe("markdown bodies parse only when their text changes", () => {
  it("an article body", () => {
    parses = 0;
    const { getByText, rerender } = render(<Rerendering child={() => <ArticleBody body={MARKDOWN} fromHtml={false} />} />);
    expect(parses).toBe(1);
    act(() => getByText("tick").click());
    act(() => getByText("tick").click());
    expect(parses).toBe(1);
    rerender(<Rerendering child={() => <ArticleBody body={`${MARKDOWN}\n\nEdited.`} fromHtml={false} />} />);
    expect(parses).toBe(2);
  });

  it("an issue body", () => {
    parses = 0;
    const { getByText } = render(<Rerendering child={() => <MarkdownBody text={MARKDOWN} />} />);
    expect(parses).toBe(1);
    act(() => getByText("tick").click());
    expect(parses).toBe(1);
  });
});
