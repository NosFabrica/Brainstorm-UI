/**
 * Who the first run suggests for a topic: the house's list for it when one is
 * published, else the built-in hand-picked people — topped up from a search
 * only when that leaves too few, and never with bots, faceless accounts,
 * repeats, or Bitcoin accounts outside the Bitcoin topic.
 */
import { describe, expect, it } from "vitest";
import { cleanDisplayName, pickTopicPeople } from "./onboardingPeople";

const pk = (c: string) => c.repeat(64);
const face = (name: string, extra: Record<string, unknown> = {}) => ({
  name,
  picture: `https://img.example/${encodeURIComponent(name)}.png`,
  ...extra,
});
const hit = (c: string, name: string, extra: Record<string, unknown> = {}) => ({
  pubkey: pk(c),
  npub: `npub-${c}`,
  name,
  picture: `https://img.example/${c}.png`,
  ...extra,
});

describe("pickTopicPeople", () => {
  it("leads with the house's list when one is published, in its order", () => {
    const people = pickTopicPeople({
      topic: "music",
      listed: [pk("b"), pk("a")],
      curated: [pk("c")],
      profiles: new Map([
        [pk("a"), face("Alice")],
        [pk("b"), face("Bob")],
        [pk("c"), face("Cara")],
      ]),
      found: [],
      size: 2,
    });
    expect(people.map((p) => p.name)).toEqual(["Bob", "Alice"]);
  });

  it("falls back to the built-in hand-picked people without a list", () => {
    const people = pickTopicPeople({
      topic: "music",
      listed: null,
      curated: [pk("c")],
      profiles: new Map([[pk("c"), face("Cara")]]),
      found: [],
      size: 6,
    });
    expect(people.map((p) => p.name)).toEqual(["Cara"]);
  });

  it("tops up from the search only to fill the topic, skipping bots, the faceless, repeats and Bitcoin crossover", () => {
    const people = pickTopicPeople({
      topic: "sports",
      listed: null,
      curated: [pk("c")],
      profiles: new Map([[pk("c"), face("ESPN")]]),
      found: [
        hit("c", "ESPN"), // already picked
        hit("d", "Bitcoin Sports Network"), // crossover
        hit("e", "Score Bot", { bot: true }),
        hit("f", "No Face", { picture: undefined }),
        hit("g", "Global Sports Central"),
        hit("h", "global sports central"), // a repeat by name
        hit("i", "Real Man Sports"),
        hit("j", "One Too Many"),
      ],
      size: 3,
    });
    expect(people.map((p) => p.name)).toEqual(["ESPN", "Global Sports Central", "Real Man Sports"]);
  });

  it("keeps Bitcoin accounts in the Bitcoin topic", () => {
    const people = pickTopicPeople({
      topic: "bitcoin",
      listed: null,
      curated: [],
      profiles: new Map(),
      found: [hit("d", "Bitcoin Magazine")],
      size: 3,
    });
    expect(people.map((p) => p.name)).toEqual(["Bitcoin Magazine"]);
  });

  it("leaves out a hand-picked account with no picture: the row needs a face", () => {
    const people = pickTopicPeople({
      topic: "news",
      listed: null,
      curated: [pk("a"), pk("b")],
      profiles: new Map([
        [pk("a"), { name: "Faceless" }],
        [pk("b"), face("AP News")],
      ]),
      found: [],
      size: 6,
    });
    expect(people.map((p) => p.name)).toEqual(["AP News"]);
  });
});

describe("cleanDisplayName", () => {
  it.each([
    ["Reuters / @Reuters (RSS Feed)", "Reuters"],
    ["GameSpot :press:", "GameSpot"],
    ["The Economist (NewsBot)", "The Economist"],
    ["Interesting Engineering (bot)", "Interesting Engineering"],
    ["Nature (RSS/Atom feed)", "Nature"],
    ["espn ✔️", "espn"],
    ["Lyn Alden", "Lyn Alden"],
  ])("%s → %s", (raw, clean) => {
    expect(cleanDisplayName(raw)).toBe(clean);
  });
});
