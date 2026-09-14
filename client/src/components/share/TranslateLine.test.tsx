// @vitest-environment jsdom
/**
 * The "Translate" link under a post in another language — X's pattern. It
 * appears only when the browser can translate and the post isn't already in
 * the reader's language; a tap swaps in the translation with "Translated
 * from Japanese · Show original". The seam is mocked; the lib has its own tests.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const availableMock = vi.fn(() => true);
const detectMock = vi.fn<(t: string) => Promise<string | null>>(() => Promise.resolve(null));
const translateMock = vi.fn<(t: string, p: { from: string; to: string }) => Promise<string>>(() => Promise.resolve(""));
vi.mock("@/lib/translate", () => ({
  translationAvailable: () => availableMock(),
  detectLanguage: (t: string) => detectMock(t),
  translateText: (t: string, p: { from: string; to: string }) => translateMock(t, p),
  readerLanguage: () => "en",
  languageName: (code: string) => ({ ja: "Japanese", pt: "Portuguese" })[code] ?? code,
}));

import { TranslateLine } from "./TranslateLine";

beforeEach(() => {
  vi.clearAllMocks();
  availableMock.mockReturnValue(true);
  detectMock.mockImplementation(() => Promise.resolve(null));
});

describe("TranslateLine", () => {
  it("offers Translate on a post in another language, then swaps in the translation", async () => {
    detectMock.mockResolvedValue("ja");
    translateMock.mockResolvedValue("Chikuwa Great Deity");
    const onClickRow = vi.fn();
    render(
      <div onClick={onClickRow}>
        <TranslateLine text="ちくわ大明神" />
      </div>,
    );
    const link = await screen.findByTestId("translate-link");
    expect(link).toHaveTextContent("Translate");
    fireEvent.click(link);
    // The row it sits in must not open — the tap was for the translation.
    expect(onClickRow).not.toHaveBeenCalled();
    expect(await screen.findByTestId("translated-text")).toHaveTextContent("Chikuwa Great Deity");
    expect(screen.getByTestId("translate-note")).toHaveTextContent("Translated from Japanese");
    expect(translateMock).toHaveBeenCalledWith("ちくわ大明神", { from: "ja", to: "en" });
    fireEvent.click(screen.getByTestId("translate-original"));
    expect(screen.queryByTestId("translated-text")).toBeNull();
    expect(screen.getByTestId("translate-link")).toBeInTheDocument();
  });

  it("stays silent for the reader's own language, unsure detection, or a browser without the APIs", async () => {
    detectMock.mockResolvedValue("en");
    const { unmount } = render(<TranslateLine text="Good morning everyone, coffee time" />);
    await new Promise((r) => setTimeout(r, 5));
    expect(screen.queryByTestId("translate-link")).toBeNull();
    unmount();
    detectMock.mockResolvedValue(null);
    render(<TranslateLine text="???" />);
    await new Promise((r) => setTimeout(r, 5));
    expect(screen.queryByTestId("translate-link")).toBeNull();
    availableMock.mockReturnValue(false);
    detectMock.mockResolvedValue("ja");
    render(<TranslateLine text="ちくわ大明神" />);
    await new Promise((r) => setTimeout(r, 5));
    expect(screen.queryByTestId("translate-link")).toBeNull();
    expect(detectMock).toHaveBeenCalledTimes(2); // never asked when the browser can't translate
  });

  it("a pair the browser can't do just takes the link away, quietly", async () => {
    detectMock.mockResolvedValue("pt");
    translateMock.mockRejectedValue(new Error("This browser can't translate pt to en"));
    render(<TranslateLine text="Se o mundo for contra a verdade" />);
    fireEvent.click(await screen.findByTestId("translate-link"));
    await new Promise((r) => setTimeout(r, 5));
    expect(screen.queryByTestId("translate-link")).toBeNull();
    expect(screen.queryByTestId("translated-text")).toBeNull();
  });
});
