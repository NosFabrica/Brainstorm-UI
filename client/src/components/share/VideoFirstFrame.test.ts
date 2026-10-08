import { describe, expect, it } from "vitest";
import { firstFrameSrc } from "./VideoFirstFrame";

describe("firstFrameSrc", () => {
  it("asks for the frame at 0.1s, replacing a fragment the URL already has", () => {
    expect(firstFrameSrc("https://cdn.example/a.mp4")).toBe("https://cdn.example/a.mp4#t=0.1");
    expect(firstFrameSrc("https://cdn.example/a.mp4#t=30")).toBe("https://cdn.example/a.mp4#t=0.1");
  });
});
