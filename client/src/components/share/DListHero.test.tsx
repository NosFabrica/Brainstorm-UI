// @vitest-environment jsdom
/**
 * A D-list event on its own page: the list's header as the list it is —
 * name, category, icon, what it holds — and an item as the song or the
 * musician it is, under the same icon. The team (2026-09-24): associate the
 * musician/songs D-list event ids with the music icon in the UI. Before
 * this, both fell through to "Kind 39998" and "Kind 9999".
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/hooks/useAuthorScores", () => ({ useAuthorScores: () => () => null }));
vi.mock("@/hooks/useNip05", () => ({ useNip05: () => "none" }));

import { DListHero } from "./DListHero";

const AUTHOR = "77599c5c4a7ba08456679d812a414037f4b01c975fb4f577187df11d189f80d3";
const SONGS = `39998:${AUTHOR}:b504f5a8-949f-4d31-ad14-8afcebde2b34`;
const MUSICIANS = `39998:${AUTHOR}:c7e2e5f1-2258-4d9d-92ed-d29b9837a82a`;
const header = { id: "eadfab91".padEnd(64, "0"), pubkey: AUTHOR, kind: 39998, created_at: 1773688562, content: "", tags: [["d", "b504f5a8-949f-4d31-ad14-8afcebde2b34"], ["name", "V4V Songs"], ["description", "Value-for-value enabled music tracks from Podcast Index"]] };
const songItem = { id: "a313660f".padEnd(64, "0"), pubkey: AUTHOR, kind: 9999, created_at: 1773697595, content: "", tags: [["z", SONGS], ["t", "https://podcastindex.org/podcast/4148683#4"], ["title", "Step Into the Light"], ["artist", "Torcon 7"], ["url", "https://mp3s.podcastindex.org/Step_Into_The_Light.mp3"], ["duration", "316"], ["artwork", "https://feeds.podcastindex.org/torcon7cover.jpg"]] };
const musicianItem = { id: "4921a433".padEnd(64, "0"), pubkey: AUTHOR, kind: 9999, created_at: 1773697595, content: "", tags: [["z", MUSICIANS], ["t", "a94f5cc9"], ["name", "Torcon 7"], ["feedId", "4148683"], ["artwork", "https://feeds.podcastindex.org/torcon7cover.jpg"]] };

describe("DListHero", () => {
  it("a list header reads as the list: its name, that it is a music list from Podcast Index, its description, under the Music icon", () => {
    render(<DListHero event={header} />);
    const hero = screen.getByTestId("dlist-hero");
    expect(hero).toHaveTextContent("V4V Songs");
    expect(hero).toHaveTextContent("Music list");
    expect(hero).toHaveTextContent("from Podcast Index");
    expect(hero).toHaveTextContent("Value-for-value enabled music tracks from Podcast Index");
    expect(hero.querySelector("svg.lucide-music")).not.toBeNull();
    expect(screen.getByRole("link", { name: /Open the Music tab/ })).toHaveAttribute("href", "/?t=music");
  });

  it("a song item reads as the song: playable, the artist named, in its list, under the Music icon", () => {
    render(<DListHero event={songItem} />);
    const hero = screen.getByTestId("dlist-hero");
    expect(hero).toHaveTextContent("Step Into the Light");
    expect(hero).toHaveTextContent("Torcon 7");
    expect(hero).toHaveTextContent("V4V Songs");
    expect(hero.querySelector("svg.lucide-music")).not.toBeNull();
    expect(screen.getByTestId("track-play")).toHaveAttribute("aria-label", "Play");
  });

  it("a musician item reads as the musician: their name and artwork, their list, and where to support them", () => {
    render(<DListHero event={musicianItem} />);
    const hero = screen.getByTestId("dlist-hero");
    expect(hero).toHaveTextContent("Torcon 7");
    expect(hero).toHaveTextContent("V4V Musicians");
    expect(screen.getByRole("link", { name: "Support the artist" })).toHaveAttribute("href", "https://podcastindex.org/podcast/4148683");
    expect(screen.getByRole("link", { name: /Their music here/ })).toHaveAttribute("href", "/?q=Torcon%207&t=music");
  });
});
