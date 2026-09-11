// @vitest-environment node
/**
 * Translation the way X does it — a quiet "Translate" on posts in another
 * language — using the browser's own on-device Translator and Language
 * Detector (Chrome 138+): free, private, no server. Browsers without them
 * simply never show the link. Faked here; jsdom has neither.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetTranslation, detectLanguage, languageName, readerLanguage, translateText, translationAvailable } from "./translate";

type Detection = { detectedLanguage: string; confidence: number };
const detectMock = vi.fn<(text: string) => Promise<Detection[]>>();
const translateMock = vi.fn<(text: string) => Promise<string>>();
const availabilityMock = vi.fn<(o: { sourceLanguage: string; targetLanguage: string }) => Promise<string>>();
const translatorCreateMock = vi.fn();

let detectorState = "available";
function installBrowserApis() {
  (globalThis as Record<string, unknown>).LanguageDetector = {
    availability: () => Promise.resolve(detectorState),
    create: () => Promise.resolve({ detect: (t: string) => detectMock(t) }),
  };
  (globalThis as Record<string, unknown>).Translator = {
    availability: (o: { sourceLanguage: string; targetLanguage: string }) => availabilityMock(o),
    create: (o: unknown) => {
      translatorCreateMock(o);
      return Promise.resolve({ translate: (t: string) => translateMock(t) });
    },
  };
}
function removeBrowserApis() {
  delete (globalThis as Record<string, unknown>).LanguageDetector;
  delete (globalThis as Record<string, unknown>).Translator;
}

beforeEach(() => {
  vi.clearAllMocks();
  __resetTranslation();
  detectorState = "available";
  installBrowserApis();
  availabilityMock.mockResolvedValue("available");
});
afterEach(removeBrowserApis);

describe("translation seam", () => {
  it("knows when the browser can translate at all", () => {
    expect(translationAvailable()).toBe(true);
    removeBrowserApis();
    expect(translationAvailable()).toBe(false);
  });

  it("detects a post's language when the detector is confident, else nothing", async () => {
    detectMock.mockResolvedValue([{ detectedLanguage: "ja", confidence: 0.94 }, { detectedLanguage: "zh", confidence: 0.03 }]);
    expect(await detectLanguage("ちくわ大明神")).toBe("ja");
    detectMock.mockResolvedValue([{ detectedLanguage: "pt", confidence: 0.4 }, { detectedLanguage: "es", confidence: 0.38 }]);
    expect(await detectLanguage("Se o mundo")).toBeNull();
    // Too short to judge — never a guess.
    expect(await detectLanguage("gm")).toBeNull();
  });

  // Seen live: creating the detector before its model is on the device
  // starts a download and hung a page of rows behind it. Not our call to
  // make for the reader — no model, no detection, no link.
  it("never detects when the detector's model would have to download first", async () => {
    detectorState = "downloadable";
    detectMock.mockResolvedValue([{ detectedLanguage: "pt", confidence: 0.99 }]);
    // Latin script gives nothing away, and the model isn't on the device: no verdict.
    expect(await detectLanguage("Se o mundo for contra a verdade, seja contra o mundo")).toBeNull();
    expect(detectMock).not.toHaveBeenCalled();
  });

  // Non-Latin scripts tell their language without any model: a page of
  // Japanese, Russian or Arabic rows gets its Translate link even before the
  // detector is on the device. Latin-script languages still need the model.
  it("reads the language off the script when the text leaves no doubt", async () => {
    detectorState = "downloadable";
    expect(await detectLanguage("ちくわ大明神")).toBe("ja");
    expect(await detectLanguage("Привет, как дела сегодня?")).toBe("ru");
    expect(await detectLanguage("مرحبا بكم في نوستر")).toBe("ar");
    expect(await detectLanguage("안녕하세요 여러분")).toBe("ko");
    expect(await detectLanguage("今天天气很好，我们去公园")).toBe("zh");
    // Latin script: no verdict without the model.
    expect(await detectLanguage("Se o mundo for contra a verdade")).toBeNull();
    // Mostly English with one stray character stays undecided.
    expect(await detectLanguage("Bitcoin is money — 日")).toBeNull();
    expect(detectMock).not.toHaveBeenCalled();
  });

  it("translates through one Translator per language pair", async () => {
    translateMock.mockResolvedValue("Chikuwa Great Deity");
    expect(await translateText("ちくわ大明神", { from: "ja", to: "en" })).toBe("Chikuwa Great Deity");
    await translateText("こんにちは", { from: "ja", to: "en" });
    expect(translatorCreateMock).toHaveBeenCalledTimes(1);
    expect(translatorCreateMock).toHaveBeenCalledWith(expect.objectContaining({ sourceLanguage: "ja", targetLanguage: "en" }));
  });

  it("refuses a pair the browser can't do, and names languages for the reader", async () => {
    availabilityMock.mockResolvedValue("unavailable");
    await expect(translateText("x", { from: "xx", to: "en" })).rejects.toThrow(/can't translate/i);
    expect(languageName("ja", "en")).toBe("Japanese");
    expect(readerLanguage("pt-BR")).toBe("pt");
  });
});
