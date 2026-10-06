import { describe, expect, it } from "vitest";
import { openTarget } from "./openTarget";

const NPUB = "npub1sg6plzptd64u62a878hep2kev88swjh3tw00gjsfl8f237lmu63q0uf63m";
const NOTE = "note1fntxtkcy9pjwucqwa9mddn7v03wwwsu9j330jj350nvhpky2tuaspk6nqc";

describe("openTarget", () => {
  it("opens a web+nostr: link's person", () => {
    expect(openTarget(`?text=${encodeURIComponent(`web+nostr:${NPUB}`)}`)).toBe(`/p/${NPUB}`);
  });

  it("opens a shared link that carries an event, wherever the share sheet put it", () => {
    expect(openTarget(`?url=${encodeURIComponent(`https://njump.me/${NOTE}`)}`)).toBe(`/e/${NOTE}`);
    expect(openTarget(`?title=Look&text=${encodeURIComponent(`look at this nostr:${NOTE}`)}`)).toBe(`/e/${NOTE}`);
  });

  it("searches for anything else", () => {
    expect(openTarget("?text=web%20of%20trust")).toBe("/?q=web%20of%20trust");
    expect(openTarget(`?url=${encodeURIComponent("https://example.com/post")}`)).toBe(
      `/?q=${encodeURIComponent("https://example.com/post")}`,
    );
  });

  it("goes home with nothing to go on", () => {
    expect(openTarget("")).toBe("/");
  });
});
