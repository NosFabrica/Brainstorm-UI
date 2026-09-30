import { describe, expect, it } from "vitest";
import { dedupeRelays } from "./relayList";
import { isLocalNetworkHost, isUnreachableLocalRelay } from "./localNetwork";

const host = (url: string) => new URL(url).hostname;

describe("isLocalNetworkHost", () => {
  it.each([
    "ws://localhost:4869", // Citrine, the relay on an Android phone
    "ws://LOCALHOST",
    "ws://relay.localhost",
    "ws://umbrel.local:4848",
    "ws://umbrel.local.:4848",
    "ws://umbrel.lan:4848",
    "ws://relay.home.arpa",
    "ws://relay.internal",
    "ws://nas.localdomain",
    "ws://raspberrypi:7777", // single-label: no public relay has one
    "ws://127.0.0.1:7777",
    "ws://127.1.2.3",
    "ws://0.0.0.0:8080",
    "ws://10.0.0.5",
    "ws://172.16.0.1",
    "ws://172.31.255.255",
    "ws://192.168.1.10:4848",
    "ws://169.254.1.1",
    "ws://100.64.0.1",
    "ws://100.127.255.255",
    "ws://[::1]:4869",
    "ws://[::]",
    "ws://[fd12:3456::1]",
    "ws://[fc00::1]",
    "ws://[fe80::1]",
    "ws://[::ffff:127.0.0.1]",
    "ws://[::ffff:192.168.0.1]",
    // Other spellings of loopback, which URL canonicalizes to dotted form.
    "ws://2130706433",
    "ws://0x7f.1",
  ])("%s is on the reader's own device or network", (url) => {
    expect(isLocalNetworkHost(host(url))).toBe(true);
  });

  it.each([
    "wss://relay.damus.io",
    "wss://nos.lol",
    "wss://relay.community",
    "wss://local.example.com", // "local" as a label, not the .local TLD
    "wss://relay.homes", // .homes is a public TLD; .home is not
    "wss://mylocal.com",
    "ws://172.15.0.1",
    "ws://172.32.0.1",
    "ws://100.63.0.1",
    "ws://100.128.0.1",
    "ws://8.8.8.8",
    "ws://[2001:db8::1]",
    // Canonical IPv6 drops leading zeros: these are 0x0fe8 and 0x00fc, not fe80::/10 or fc00::/7.
    "ws://[0fe8::1]",
    "ws://[00fc::1]",
    "ws://[0fd1::1]",
    "ws://[::ffff:8.8.8.8]",
  ])("%s is not", (url) => {
    expect(isLocalNetworkHost(host(url))).toBe(false);
  });

  it("an empty host is not local", () => {
    expect(isLocalNetworkHost("")).toBe(false);
  });
});

// The test page is served from localhost (jsdom's default URL), which is the
// dev-server case: a local relay may be the one being developed against.
describe("on a page served from the reader's own machine", () => {
  it("keeps local relays", () => {
    expect(location.hostname).toBe("localhost");
    expect(isUnreachableLocalRelay("ws://localhost:4869")).toBe(false);
    expect(dedupeRelays(["ws://localhost:4869", "wss://nos.lol"])).toEqual(["ws://localhost:4869/", "wss://nos.lol/"]);
  });
});
