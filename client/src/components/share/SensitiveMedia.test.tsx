// @vitest-environment jsdom
/**
 * What stands in for a video its creator marked sensitive: a cover that asks
 * before showing it, and a small placeholder where only a thumbnail would be.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { SensitiveCover, SensitiveTile, sensitiveVideoLabel } from "./SensitiveMedia";

describe("SensitiveCover", () => {
  it("says the creator marked the video sensitive, with the reason when there is one", () => {
    const { rerender } = render(<SensitiveCover onShow={vi.fn()} />);
    expect(screen.getByTestId("sensitive-cover")).toHaveTextContent(/^The creator marked this video as sensitive/);
    expect(screen.getByTestId("sensitive-cover")).not.toHaveTextContent(":");
    rerender(<SensitiveCover reason="nudity" onShow={vi.fn()} />);
    expect(screen.getByTestId("sensitive-cover")).toHaveTextContent(
      "The creator marked this video as sensitive: nudity",
    );
  });

  // A reason is the creator's free text. A long one must not push the button out of a short frame.
  it("cuts a long reason short, and still offers the video", () => {
    render(<SensitiveCover reason={"graphic injury detail ".repeat(40)} onShow={vi.fn()} />);
    const said = screen.getByTestId("sensitive-reason");
    expect(said.textContent).toMatch(/^The creator marked this video as sensitive: graphic injury detail .*…$/);
    expect(said.textContent!.length).toBeLessThanOrEqual("The creator marked this video as sensitive: ".length + 80);
    expect(said.className).toMatch(/line-clamp-2/);
    expect(screen.getByRole("button", { name: "Show video" })).toBeInTheDocument();
  });

  it('"Show video" is the way through', () => {
    const onShow = vi.fn();
    render(<SensitiveCover onShow={onShow} />);
    fireEvent.click(screen.getByRole("button", { name: "Show video" }));
    expect(onShow).toHaveBeenCalledTimes(1);
  });
});

describe("SensitiveCover — what it covers", () => {
  it("names pictures, several pictures, or a post's mixed media, and asks for them by name", () => {
    const { rerender } = render(<SensitiveCover onShow={vi.fn()} subject="photo" />);
    expect(screen.getByTestId("sensitive-reason")).toHaveTextContent("The creator marked this photo as sensitive");
    expect(screen.getByRole("button", { name: "Show photo" })).toBeInTheDocument();
    rerender(<SensitiveCover onShow={vi.fn()} subject="photo" count={3} />);
    expect(screen.getByTestId("sensitive-reason")).toHaveTextContent("The creator marked these photos as sensitive");
    expect(screen.getByRole("button", { name: "Show photos" })).toBeInTheDocument();
    rerender(<SensitiveCover onShow={vi.fn()} subject="media" count={2} />);
    expect(screen.getByTestId("sensitive-reason")).toHaveTextContent(
      "The creator marked this post's media as sensitive",
    );
    expect(screen.getByRole("button", { name: "Show media" })).toBeInTheDocument();
  });
});

describe("SensitiveTile", () => {
  it('is a placeholder labelled "Sensitive", with no picture in it', () => {
    render(<SensitiveTile className="h-16 w-16" />);
    const tile = screen.getByTestId("sensitive-tile");
    expect(tile).toHaveTextContent("Sensitive");
    expect(tile.className).toMatch(/h-16/);
    expect(tile.querySelector("img, video")).toBeNull();
  });
});

describe("sensitiveVideoLabel", () => {
  it("names a flagged tile for a screen reader, with its title when it has one", () => {
    expect(sensitiveVideoLabel("Morning at the lake")).toBe("Sensitive video: Morning at the lake");
    expect(sensitiveVideoLabel("  ")).toBe("Sensitive video");
    expect(sensitiveVideoLabel()).toBe("Sensitive video");
  });
});
