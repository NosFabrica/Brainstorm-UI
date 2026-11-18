/**
 * brainstorm.world/<bech32>, the njump shape: nginx 301s a person's id to /p/
 * and an event's to /e/, so a crawler reaches og's card in one hop.
 */
import { describe, expect, it } from "vitest";
import { locationBody, nginxConf } from "./nginxConf";

const PERSON = "~* ^/(?:nostr:)?((?:npub|nprofile)1[02-9ac-hj-np-z]+)/?$";
const EVENT = "~* ^/(?:nostr:)?((?:note|nevent|naddr)1[02-9ac-hj-np-z]+)/?$";

/** The location's regex, as nginx (PCRE, `~*`) would run it. */
const regexOf = (matcher: string) => new RegExp(matcher.replace(/^~\*\s+/, ""), "i");

describe("nginx /<bech32>", () => {
  it("redirects a person's id to /p/ and an event's to /e/, query kept", () => {
    expect(locationBody(PERSON)).toContain("return 301 /p/$1$is_args$args;");
    expect(locationBody(EVENT)).toContain("return 301 /e/$1$is_args$args;");
  });

  it("matches entities, not words that start like one", () => {
    const person = regexOf(PERSON);
    const event = regexOf(EVENT);
    expect("/npub1sg6plzptd64u62a878hep2kev88swjh3tw00gjsfl8f237lmu63q0uf63m".match(person)?.[1]).toMatch(/^npub1/);
    expect("/nostr:nevent1qqs8wumn8ghj7".match(event)?.[1]).toBe("nevent1qqs8wumn8ghj7");
    expect("/naddr1qq9rzd3h/".match(event)?.[1]).toBe("naddr1qq9rzd3h");
    // Not bech32: `b`, `i`, `o` and `1` after the separator are outside its alphabet.
    for (const path of ["/nostr", "/notes", "/note1book", "/npub1/hops", "/p/npub1abc", "/naddr1abc.php"]) {
      expect(path).not.toMatch(person);
      expect(path).not.toMatch(event);
    }
  });

  it("sits above the extension deny-list, like the other id routes", () => {
    for (const matcher of [PERSON, EVENT]) {
      expect(nginxConf.indexOf(`location ${matcher} {`)).toBeGreaterThan(-1);
      expect(nginxConf.indexOf(`location ${matcher} {`)).toBeLessThan(nginxConf.indexOf("location ~* \\.(php|"));
    }
  });
});
