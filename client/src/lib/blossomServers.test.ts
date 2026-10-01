import { describe, expect, it } from "vitest";
import {
  ENCRYPTED_BLOSSOM_SERVERS,
  blossomServerTags,
  encryptedUploadServers,
  normalizeServer,
  parseBlossomServers,
} from "./blossomServers";

describe("Blossom server lists (kind 10063)", () => {
  it("normalizes an address and rejects what isn't one", () => {
    expect(normalizeServer("cdn.example.com/")).toBe("https://cdn.example.com");
    expect(normalizeServer(" https://cdn.example.com/files/ ")).toBe("https://cdn.example.com/files");
    expect(normalizeServer("wss://relay.example.com")).toBeNull();
    expect(normalizeServer("localhost")).toBeNull();
    expect(normalizeServer("")).toBeNull();
  });

  it("reads servers in order, once each, ignoring other tags", () => {
    const event = {
      tags: [
        ["server", "https://b.example.com/"],
        ["r", "https://ignored.example.com"],
        ["server", "https://a.example.com"],
        ["server", "https://b.example.com"],
        ["server", "not a url"],
      ],
    };
    expect(parseBlossomServers(event)).toEqual(["https://b.example.com", "https://a.example.com"]);
    expect(parseBlossomServers(null)).toEqual([]);
  });

  it("writes one server tag per server", () => {
    expect(blossomServerTags(["https://a.example.com/", "https://a.example.com"])).toEqual([
      ["server", "https://a.example.com"],
    ]);
  });

  it("tries a person's own servers before the ones that take ciphertext", () => {
    const own = ["https://mine.example.com", ENCRYPTED_BLOSSOM_SERVERS[1]];
    expect(encryptedUploadServers(own)).toEqual([
      "https://mine.example.com",
      ...ENCRYPTED_BLOSSOM_SERVERS.slice(1),
      ENCRYPTED_BLOSSOM_SERVERS[0],
    ]);
    expect(encryptedUploadServers([])).toEqual(ENCRYPTED_BLOSSOM_SERVERS);
  });
});
