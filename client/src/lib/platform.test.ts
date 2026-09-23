// @vitest-environment node
/**
 * Which phone OS a visitor is on decides which "open in" links make sense:
 * a nostr: link only does anything on a phone with a Nostr app, and Amethyst
 * exists only on Android. Read from the user agent, injectable for tests.
 */
import { describe, expect, it } from "vitest";
import { isAndroid, isIOS, isPhoneOS } from "./platform";

const PIXEL = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";
const IPAD = "Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";
const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const WINDOWS = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

describe("platform", () => {
  it("a Pixel is Android; an iPhone and an iPad are iOS; a Mac and Windows are neither", () => {
    expect(isAndroid(PIXEL)).toBe(true);
    expect(isAndroid(IPHONE)).toBe(false);
    expect(isIOS(IPHONE)).toBe(true);
    expect(isIOS(IPAD)).toBe(true);
    expect(isIOS(PIXEL)).toBe(false);
    expect(isAndroid(MAC) || isIOS(MAC) || isAndroid(WINDOWS) || isIOS(WINDOWS)).toBe(false);
  });
  it("a phone OS is Android or iOS", () => {
    expect(isPhoneOS(PIXEL)).toBe(true);
    expect(isPhoneOS(IPHONE)).toBe(true);
    expect(isPhoneOS(MAC)).toBe(false);
    expect(isPhoneOS("")).toBe(false);
  });
});
