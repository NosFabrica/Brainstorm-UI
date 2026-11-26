import { afterEach, describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import {
  openingTab,
  tabFromUrl,
  urlKind,
  urlList,
  urlTagged,
  useSearchUrlState,
  writeKindToUrl,
  writeListToUrl,
  writeTabToUrl,
  writeTaggedToUrl,
} from "./useSearchUrlState";

const at = (search: string) => window.history.replaceState({}, "", `/search${search}`);
const params = () => new URLSearchParams(window.location.search);

afterEach(() => at(""));

describe("reading the address", () => {
  it("names a tab by `t`, Top when it names none or one that isn't a tab", () => {
    at("?q=x&t=shop");
    expect(tabFromUrl()).toBe("shop");
    at("?q=x");
    expect(tabFromUrl()).toBe("top");
    at("?t=places");
    expect(tabFromUrl()).toBe("top");
  });

  it("keeps old links working: `code` is Repos and `everything` is Top", () => {
    at("?t=code");
    expect(tabFromUrl()).toBe("repos");
    at("?t=everything");
    expect(tabFromUrl()).toBe("top");
  });

  it("reads a `t` that is no tab as a kind's own page", () => {
    at("?t=places");
    expect(urlKind()).toBe("places");
    at("?t=notes");
    expect(urlKind()).toBeNull();
  });

  it("opens Classic Vines on Media only when the address names no tab", () => {
    at("");
    expect(openingTab("#vine-archive")).toBe("media");
    at("?t=notes");
    expect(openingTab("#vine-archive")).toBe("notes");
    at("");
    expect(openingTab("#bitcoin")).toBe("top");
  });

  it("reads All's list and tag", () => {
    at("?list=30000%3Aab%3Ad&tagged=ab%7Cslug");
    expect(urlList()).toBe("30000:ab:d");
    expect(urlTagged()).toBe("ab|slug");
  });
});

describe("writing the address", () => {
  it("writes Top as no tab, and a tab or a kind drops the area, list and tag", () => {
    at("?q=x&t=shop&area=1&list=l&tagged=t");
    writeTabToUrl("notes");
    expect(params().get("t")).toBe("notes");
    expect(["area", "list", "tagged"].map((k) => params().get(k))).toEqual([null, null, null]);
    expect(params().get("q")).toBe("x");
    writeTabToUrl("top");
    expect(params().get("t")).toBeNull();
    at("?list=l&tagged=t");
    writeKindToUrl("places");
    expect(params().get("t")).toBe("places");
    expect(params().get("list")).toBeNull();
  });

  it("sets and clears All's list and tag", () => {
    writeListToUrl("30000:ab:d");
    writeTaggedToUrl("ab|slug");
    expect(urlList()).toBe("30000:ab:d");
    expect(urlTagged()).toBe("ab|slug");
    writeListToUrl(null);
    writeTaggedToUrl(null);
    expect(window.location.search).toBe("");
  });
});

describe("useSearchUrlState", () => {
  it("changes tab or kind in the address, and follows Back and Forward", () => {
    at("?t=notes");
    const { result } = renderHook(() => useSearchUrlState("bitcoin"));
    expect(result.current).toMatchObject({ tab: "notes", kindTab: null });
    act(() => result.current.openKind("places"));
    expect(result.current).toMatchObject({ tab: "top", kindTab: "places" });
    expect(params().get("t")).toBe("places");
    act(() => result.current.changeTab("shop"));
    expect(result.current).toMatchObject({ tab: "shop", kindTab: null });
    expect(params().get("t")).toBe("shop");
    act(() => {
      at("?t=media");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(result.current.tab).toBe("media");
  });

  it("moves to Media when the words become Classic Vines on a page that names no tab", () => {
    at("");
    const { result, rerender } = renderHook(({ q }) => useSearchUrlState(q), { initialProps: { q: "bitcoin" } });
    expect(result.current.tab).toBe("top");
    rerender({ q: "#vine-archive" });
    expect(result.current.tab).toBe("media");
    // The address says so, for a reload or a link.
    expect(params().get("t")).toBe("media");
  });
});
