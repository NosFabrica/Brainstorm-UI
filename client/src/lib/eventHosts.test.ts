// @vitest-environment node
/**
 * Who hosts a NIP-52 calendar event. NIP-52 lets a `p` tag carry a role, and the
 * word is left free: Flockstr writes "host", Formstr writes "organizer". Event
 * Index signs each event with the calendar's own key and adds a "host" `p` for
 * every calendar that lists it, so a co-hosted event names each calendar.
 */
import { describe, expect, it } from "vitest";
import { hostsOf } from "./eventHosts";

const SIGNER = "a".repeat(64);
const B = "b".repeat(64);
const C = "c".repeat(64);
const D = "d".repeat(64);
const ev = (tags: string[][]) => ({ pubkey: SIGNER, tags });

describe("hostsOf", () => {
  it("is the signer when no p tag names a host", () => {
    expect(hostsOf(ev([]))).toEqual([SIGNER]);
    expect(
      hostsOf(
        ev([
          ["p", B],
          ["p", C, "", "speaker"],
        ]),
      ),
    ).toEqual([SIGNER]);
  });

  it("reads the host role and the organizer role, in the order written", () => {
    expect(hostsOf(ev([["p", B, "wss://relay.example", "host"]]))).toEqual([B]);
    expect(
      hostsOf(
        ev([
          ["p", C, "", "organizer"],
          ["p", B, "", "host"],
        ]),
      ),
    ).toEqual([C, B]);
  });

  it("reads the role whatever its case or spacing", () => {
    expect(
      hostsOf(
        ev([
          ["p", B, "", " Host "],
          ["p", C, "", "ORGANIZER"],
        ]),
      ),
    ).toEqual([B, C]);
  });

  it("names a co-hosted event's calendars once each, as Event Index writes them", () => {
    const tags = [
      ["p", SIGNER, "wss://relay.eventindex.space", "host"],
      ["p", B, "wss://relay.eventindex.space", "host"],
      ["p", B, "wss://relay.eventindex.space", "host"],
    ];
    expect(hostsOf(ev(tags))).toEqual([SIGNER, B]);
  });

  it("leaves out other roles and anything that is not a public key", () => {
    const tags = [
      ["p", D, "", "speaker"],
      ["p", "npub1notahexkey", "", "host"],
      ["p", "", "", "host"],
      ["p", B.toUpperCase(), "", "host"],
    ];
    expect(hostsOf(ev(tags))).toEqual([B]);
  });
});
