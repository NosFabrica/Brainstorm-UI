import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { FileMessage } from "./FileMessage";

const SVG = new TextEncoder().encode(
  '<svg xmlns="http://www.w3.org/2000/svg"><script>localStorage.getItem("brainstorm_accounts_v2")</script></svg>',
);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);

let blobs: Blob[];

beforeEach(() => {
  blobs = [];
  // jsdom has no blob: URLs.
  URL.createObjectURL = vi.fn((blob: Blob) => {
    blobs.push(blob);
    return `blob:http://localhost/${blobs.length}`;
  });
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => vi.unstubAllGlobals());

function serve(bytes: Uint8Array) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(bytes.slice())),
  );
}

async function openAttachment(mime: string, bytes: Uint8Array) {
  serve(bytes);
  const view = render(
    <FileMessage meta={{ url: "https://files.example/abc", mime, size: bytes.length }} mine={false} autoOpen={false} />,
  );
  fireEvent.click(screen.getByRole("button", { name: /open the file/i }));
  await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalled());
  return view;
}

describe("FileMessage", () => {
  it("never draws or links an SVG on our origin, whatever its sender called it", async () => {
    const { container } = await openAttachment("image/svg+xml", SVG);
    await waitFor(() => expect(screen.getByRole("link", { name: /save the file/i })).toBeInTheDocument());
    expect(container.querySelector("img")).toBeNull();
    for (const a of container.querySelectorAll("a")) {
      expect(a.hasAttribute("download")).toBe(true);
      expect(a.getAttribute("target")).toBeNull();
    }
    expect(blobs[0].type).toBe("application/octet-stream");
  });

  it("goes by the bytes, not the label: SVG sent as image/png is a download", async () => {
    const { container } = await openAttachment("image/png", SVG);
    await waitFor(() => expect(screen.getByRole("link", { name: /save the file/i })).toBeInTheDocument());
    expect(container.querySelector("img")).toBeNull();
    expect(blobs[0].type).toBe("application/octet-stream");
  });

  it("draws a real picture inline, typed as what it is, and never as a link", async () => {
    const { container } = await openAttachment("image/svg+xml", PNG);
    await waitFor(() => expect(container.querySelector("img")).not.toBeNull());
    expect(container.querySelector("a")).toBeNull();
    expect(blobs[0].type).toBe("image/png");
  });

  it("offers anything else as a download that can't be opened as a page", async () => {
    const html = new TextEncoder().encode("<!doctype html><script>alert(1)</script>");
    const { container } = await openAttachment("text/html", html);
    await waitFor(() => expect(screen.getByRole("link", { name: /save the file/i })).toBeInTheDocument());
    expect(container.querySelector("a")?.hasAttribute("download")).toBe(true);
    expect(blobs[0].type).toBe("application/octet-stream");
  });
});
