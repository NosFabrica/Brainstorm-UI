/**
 * Translation the way X does it — a quiet "Translate" on posts in another
 * language — through the browser's own on-device Translator and Language
 * Detector (Chrome 138+). Free, private, no server; browsers without the
 * APIs never show the link. A server-backed path can slot in behind this
 * seam later so every browser gets it (team ask).
 */

// The APIs aren't in TypeScript's DOM lib yet — the sliver we use, typed here.
interface LanguageDetection {
  detectedLanguage: string;
  confidence: number;
}
interface LanguageDetectorApi {
  availability(): Promise<string>;
  create(): Promise<{ detect(text: string): Promise<LanguageDetection[]> }>;
}
interface TranslatorApi {
  availability(opts: { sourceLanguage: string; targetLanguage: string }): Promise<string>;
  create(opts: { sourceLanguage: string; targetLanguage: string }): Promise<{ translate(text: string): Promise<string> }>;
}
const apis = () => {
  const g = globalThis as unknown as { LanguageDetector?: LanguageDetectorApi; Translator?: TranslatorApi };
  return { detector: g.LanguageDetector, translator: g.Translator };
};

/** Both APIs present — the only case the Translate link ever renders. */
export function translationAvailable(): boolean {
  const { detector, translator } = apis();
  return !!detector && !!translator;
}

/** The reader's language, base tag only ("pt-BR" → "pt"). */
export function readerLanguage(tag: string = typeof navigator !== "undefined" ? navigator.language : "en"): string {
  return (tag || "en").toLowerCase().split("-")[0];
}

/** "ja" → "Japanese", in the reader's language. */
export function languageName(code: string, inLanguage: string = readerLanguage()): string {
  try {
    return new Intl.DisplayNames([inLanguage], { type: "language" }).of(code) ?? code;
  } catch {
    return code;
  }
}

const MIN_CONFIDENCE = 0.6;
const MIN_CHARS = 4;
let detectorPromise: Promise<{ detect(text: string): Promise<LanguageDetection[]> }> | null = null;
let detectorReady: Promise<boolean> | null = null;

/** Detection only when the model is already on the device. Creating the
 *  detector otherwise starts a download the reader never asked for — and can
 *  hang a page full of rows behind it (seen live). */
function detectorAvailable(detector: LanguageDetectorApi): Promise<boolean> {
  detectorReady ??= detector
    .availability()
    .then((state) => state === "available")
    .catch(() => false);
  return detectorReady;
}
const translators = new Map<string, Promise<{ translate(text: string): Promise<string> }>>();
const detected = new Map<string, string | null>();

/** Scripts that name their language without a model. Han without kana is
 *  called Chinese — Japanese text almost always carries hiragana/katakana. */
const SCRIPTS: [RegExp, string][] = [
  [/[\u3040-\u30ff]/u, "ja"],
  [/[\uac00-\ud7af]/u, "ko"],
  [/[\u4e00-\u9fff]/u, "zh"],
  [/[\u0400-\u04ff]/u, "ru"],
  [/[\u0600-\u06ff]/u, "ar"],
  [/[\u0590-\u05ff]/u, "he"],
  [/[\u0e00-\u0e7f]/u, "th"],
  [/[\u0900-\u097f]/u, "hi"],
  [/[\u0370-\u03ff]/u, "el"],
];

/** The language a text's script gives away, when most of its letters are in
 *  one non-Latin script. Null for Latin script or a mixed bag. */
export function scriptLanguage(text: string): string | null {
  const letters = [...text].filter((ch) => /\p{L}/u.test(ch));
  if (letters.length < MIN_CHARS) return null;
  for (const [re, lang] of SCRIPTS) {
    const hits = letters.filter((ch) => re.test(ch)).length;
    // Japanese: kana decides even when kanji (Han) outnumber them.
    if (lang === "ja" && hits > 0 && letters.filter((ch) => /[\u3040-\u30ff\u4e00-\u9fff]/u.test(ch)).length / letters.length >= 0.5) return "ja";
    if (lang !== "ja" && hits / letters.length >= 0.5) return lang;
  }
  return null;
}

/** The post's language, or null when nobody can tell (or the text is too
 *  short to judge — "gm" is nobody's language). The script answers first,
 *  instantly and offline; the detector model, when present, does the rest. */
export async function detectLanguage(text: string): Promise<string | null> {
  const t = text.trim();
  if (t.length < MIN_CHARS) return null;
  const byScript = scriptLanguage(t);
  if (byScript) return byScript;
  const { detector } = apis();
  if (!detector) return null;
  const cached = detected.get(t);
  if (cached !== undefined) return cached;
  try {
    if (!(await detectorAvailable(detector))) return null;
    detectorPromise ??= detector.create();
    const results = await (await detectorPromise).detect(t);
    const top = results[0];
    const lang = top && top.confidence >= MIN_CONFIDENCE && top.detectedLanguage !== "und" ? top.detectedLanguage.toLowerCase().split("-")[0] : null;
    detected.set(t, lang);
    return lang;
  } catch {
    detected.set(t, null);
    return null;
  }
}

/** Translate through one Translator per language pair. Rejects when the
 *  browser can't do that pair, so the caller can say so and hide the link. */
export async function translateText(text: string, pair: { from: string; to: string }): Promise<string> {
  const { translator } = apis();
  if (!translator) throw new Error("This browser can't translate");
  const key = `${pair.from}>${pair.to}`;
  let p = translators.get(key);
  if (!p) {
    p = (async () => {
      const state = await translator.availability({ sourceLanguage: pair.from, targetLanguage: pair.to });
      if (state === "unavailable") throw new Error(`This browser can't translate ${pair.from} to ${pair.to}`);
      return translator.create({ sourceLanguage: pair.from, targetLanguage: pair.to });
    })();
    translators.set(key, p);
    p.catch(() => translators.delete(key));
  }
  return (await p).translate(text);
}

/** Test seam. */
export function __resetTranslation(): void {
  detectorPromise = null;
  detectorReady = null;
  translators.clear();
  detected.clear();
}
