// @vitest-environment node
import { describe, expect, it } from "vitest";
import { nip19 } from "nostr-tools";
import {
  chatTags,
  fileMetaOf,
  othersIn,
  participantsOf,
  reactionLabel,
  reactionTargetOf,
  replyTargetOf,
  roomKey,
  roomKeyFromSlug,
  roomSlug,
  subjectOf,
  fileDisplayName,
} from "./rooms";

const A = "a".repeat(64);
const B = "b".repeat(64);
const C = "c".repeat(64);

describe("rooms", () => {
  it("names a room by everyone in it, whoever sent", () => {
    const fromA = participantsOf({
      pubkey: A,
      tags: [
        ["p", B],
        ["p", C],
      ],
    });
    const fromC = participantsOf({
      pubkey: C,
      tags: [
        ["p", A],
        ["p", B],
      ],
    });
    expect(roomKey(fromA)).toBe(roomKey(fromC));
    expect(roomKey(fromA)).toBe([A, B, C].join(","));
  });

  it("treats adding a person as a different room", () => {
    expect(roomKey([A, B])).not.toBe(roomKey([A, B, C]));
  });

  it("round-trips a room through its URL slug", () => {
    const key = roomKey([A, B, C]);
    const slug = roomSlug(key, A);
    expect(slug).toBe(`${nip19.npubEncode(B)}+${nip19.npubEncode(C)}`);
    expect(roomKeyFromSlug(slug, A)).toBe(key);
    expect(roomKeyFromSlug("not-a-key", A)).toBeNull();
  });

  it("knows who a chat is with, including a note to self", () => {
    expect(othersIn(roomKey([A, B]), A)).toEqual([B]);
    expect(othersIn(roomKey([A]), A)).toEqual([A]);
  });

  it("reads subject, reply and reaction targets", () => {
    const msg = { kind: 14, tags: chatTags([B], { replyTo: "e1", subject: " Plans " }) };
    expect(subjectOf(msg)).toBe("Plans");
    expect(replyTargetOf(msg)).toBe("e1");
    expect(
      reactionTargetOf({
        kind: 7,
        tags: [
          ["e", "e2"],
          ["p", B],
        ],
      }),
    ).toBe("e2");
    expect(reactionLabel("+")).toBe("❤️");
    expect(reactionLabel("🔥")).toBe("🔥");
  });

  it("reads a file message's decryption metadata", () => {
    const meta = fileMetaOf({
      kind: 15,
      content: "https://blossom.example/abc",
      tags: [
        ["file-type", "image/png"],
        ["encryption-algorithm", "aes-gcm"],
        ["decryption-key", "k"],
        ["decryption-nonce", "n"],
        ["size", "1024"],
      ],
    });
    expect(meta).toMatchObject({
      url: "https://blossom.example/abc",
      mime: "image/png",
      key: "k",
      nonce: "n",
      size: 1024,
    });
    expect(fileMetaOf({ kind: 15, content: "javascript:alert(1)", tags: [] })).toBeUndefined();
  });
});

describe("fileDisplayName", () => {
  const hash = "d88b15d59dc4efe796acb73f2daf1da8457191f006a0a98b7f18c9f60dcfd671";
  it("uses the sender's name for the file", () => {
    expect(
      fileDisplayName({ url: `https://nostr.download/${hash}.bin`, mime: "application/pdf", name: "plan.pdf" }),
    ).toBe("plan.pdf");
  });
  it("names a hash-named blob by its type when the sender gave no name", () => {
    expect(fileDisplayName({ url: `https://nostr.download/${hash}.bin`, mime: "application/pdf" })).toBe(
      "File d88b15d5.pdf",
    );
    expect(fileDisplayName({ url: `https://nostr.download/${hash}`, mime: "application/x-unknown" })).toBe(
      "File d88b15d5",
    );
  });
  it("keeps a readable URL name", () => {
    expect(fileDisplayName({ url: "https://example.com/files/report.pdf?dl=1" })).toBe("report.pdf");
  });
});
