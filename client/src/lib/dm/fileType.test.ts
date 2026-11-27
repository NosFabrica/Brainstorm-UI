import { describe, expect, it } from "vitest";
import { rasterImageType } from "./fileType";

const bytes = (...parts: (number[] | string)[]) =>
  new Uint8Array(parts.flatMap((p) => (typeof p === "string" ? [...p].map((c) => c.charCodeAt(0)) : p)));

describe("rasterImageType", () => {
  it("reads the type from the file's first bytes", () => {
    expect(rasterImageType(bytes([0x89], "PNG\r\n\x1a\n", [0, 0]))).toBe("image/png");
    expect(rasterImageType(bytes([0xff, 0xd8, 0xff, 0xe0, 0, 0]))).toBe("image/jpeg");
    expect(rasterImageType(bytes("GIF89a", [1, 0]))).toBe("image/gif");
    expect(rasterImageType(bytes("GIF87a", [1, 0]))).toBe("image/gif");
    expect(rasterImageType(bytes("RIFF", [0, 0, 0, 0], "WEBPVP8 "))).toBe("image/webp");
    expect(rasterImageType(bytes([0, 0, 0, 0x1c], "ftypavif", [0, 0, 0, 0], "avifmif1"))).toBe("image/avif");
    expect(rasterImageType(bytes([0, 0, 0, 0x1c], "ftypmif1", [0, 0, 0, 0], "mif1avif"))).toBe("image/avif");
  });

  it("is not a picture whatever the sender called it: SVG, HTML, anything else", () => {
    expect(
      rasterImageType(bytes('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')),
    ).toBeNull();
    expect(rasterImageType(bytes('<?xml version="1.0"?><svg/>'))).toBeNull();
    expect(rasterImageType(bytes("<!doctype html><script>alert(1)</script>"))).toBeNull();
    expect(rasterImageType(bytes("RIFF", [0, 0, 0, 0], "WAVEfmt "))).toBeNull();
    expect(rasterImageType(bytes([0, 0, 0, 0x1c], "ftypisom", [0, 0, 0, 0], "isommp41"))).toBeNull();
    expect(rasterImageType(bytes([0x89, 0x50]))).toBeNull();
    expect(rasterImageType(new Uint8Array())).toBeNull();
  });
});
