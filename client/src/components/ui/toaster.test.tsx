// @vitest-environment jsdom
/**
 * The brand toast: Brainstorm speaking — its "B" beside the words, in the
 * Aurora colours — for announcements like the Trusted Lists update.
 */
import { describe, expect, it } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { toast } from "@/hooks/use-toast";
import { Toaster } from "./toaster";

describe("Toaster", () => {
  it("a brand toast carries the Brainstorm mark", () => {
    render(<Toaster />);

    act(() => {
      toast({ title: "Updated — your lists are live.", variant: "brand" });
    });

    const title = screen.getByText("Updated — your lists are live.");
    const item = title.closest("li") ?? title.parentElement!.parentElement!;
    expect(item.querySelector('svg[aria-label="Brainstorm"]')).not.toBeNull();
  });
});
