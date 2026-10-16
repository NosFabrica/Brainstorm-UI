import { describe, expect, it } from "vitest";
import { nip19 } from "nostr-tools";
import { parseListRef } from "./listRef";

const PK = "b83a28b7e4e5d20bd960c5faeb6625f95529166b8bdb045d42634a2f35919450";
const ID = "21e5b848861b888f7c8e9aeb6f59df434573c3211b218377ef13362dacca8648";

describe("parseListRef", () => {
  it("reads a list's address, as a coordinate or an naddr", () => {
    expect(parseListRef(`39998:${PK}:food-and-drink-places`)).toEqual({
      type: "address",
      coordinate: `39998:${PK}:food-and-drink-places`,
      relays: [],
    });
    const naddr = nip19.naddrEncode({ kind: 39998, pubkey: PK, identifier: "divine-videos", relays: ["wss://hub"] });
    expect(parseListRef(`nostr:${naddr}`)).toEqual({
      type: "address",
      coordinate: `39998:${PK}:divine-videos`,
      relays: ["wss://hub"],
    });
  });

  it("reads one version by id: an nevent, a note, or 64 hex", () => {
    expect(parseListRef(ID)).toEqual({ type: "id", id: ID, relays: [] });
    expect(parseListRef(nip19.noteEncode(ID))).toEqual({ type: "id", id: ID, relays: [] });
    expect(parseListRef(nip19.neventEncode({ id: ID, kind: 39998, relays: ["wss://hub"] }))).toEqual({
      type: "id",
      id: ID,
      relays: ["wss://hub"],
    });
  });

  it("is nothing for what isn't a list: words, another kind's address or event", () => {
    expect(parseListRef("food trucks")).toBeNull();
    expect(parseListRef(`39999:${PK}:an-item`)).toBeNull();
    expect(parseListRef(nip19.naddrEncode({ kind: 30023, pubkey: PK, identifier: "a" }))).toBeNull();
    expect(parseListRef(nip19.neventEncode({ id: ID, kind: 1 }))).toBeNull();
  });
});
