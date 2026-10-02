import { afterEach, describe, expect, it } from "vitest";
import { setTitleCount } from "./titleBadge";

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("title badge", () => {
  afterEach(() => setTitleCount(0));

  it("prefixes the count, keeps it when a page changes the title, and clears it", async () => {
    document.title = "Brainstorm";
    setTitleCount(3);
    expect(document.title).toBe("(3) Brainstorm");
    document.title = "Ana · Brainstorm";
    await flush();
    expect(document.title).toBe("(3) Ana · Brainstorm");
    setTitleCount(120);
    expect(document.title).toBe("(99+) Ana · Brainstorm");
    setTitleCount(0);
    expect(document.title).toBe("Ana · Brainstorm");
  });
});
