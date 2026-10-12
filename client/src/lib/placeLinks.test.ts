/**
 * A place's ways out — directions, a call, its site — built from its fields,
 * and its category as words. Expected values are the links a phone opens.
 */
import { describe, expect, it } from "vitest";
import { addressLine, addressLines, categoryWords, directionsUrl, placeLocalMinutes, platformOf } from "./placeLinks";

describe("directionsUrl", () => {
  const place = { lat: "10.2875153", lon: "-85.8505374", name: "El Sapo" };
  it("on an iPhone or iPad, Apple Maps, which iOS hands to the Maps app", () => {
    expect(directionsUrl(place, "ios")).toBe("https://maps.apple.com/?daddr=10.2875153%2C-85.8505374&q=El%20Sapo");
  });
  it("on Android, a geo link, which opens the system's chooser of maps apps", () => {
    expect(directionsUrl(place, "android")).toBe("geo:10.2875153,-85.8505374?q=10.2875153,-85.8505374(El%20Sapo)");
  });
  it("on a desktop, Google Maps in the browser", () => {
    expect(directionsUrl(place, "desktop")).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=10.2875153%2C-85.8505374",
    );
  });
  it("without coordinates, nothing", () => {
    expect(directionsUrl({ lat: null, lon: null, name: "x" }, "desktop")).toBeNull();
    expect(directionsUrl({ lat: "x", lon: "1", name: "x" }, "ios")).toBeNull();
  });
});

describe("platformOf", () => {
  it("reads the device from the user agent", () => {
    expect(platformOf("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15")).toBe("ios");
    expect(platformOf("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15")).toBe("ios");
    expect(platformOf("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120")).toBe("android");
    expect(platformOf("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 Safari/605.1.15")).toBe(
      "desktop",
    );
  });
});

describe("categoryWords", () => {
  it("turns OpenStreetMap values into words", () => {
    expect(categoryWords("fast_food")).toBe("Fast food");
    expect(categoryWords("ice_cream")).toBe("Ice cream");
    expect(categoryWords("restaurant")).toBe("Restaurant");
    expect(categoryWords("pizza")).toBe("Pizza");
    expect(categoryWords("")).toBeNull();
  });
});

describe("placeLocalMinutes", () => {
  it("estimates the place's local wall clock from its longitude: 15° per hour", () => {
    // 12:00 UTC at −85.85° (Costa Rica, UTC−6) is 06:00 local, a Thursday either way.
    const at = new Date("2026-10-15T12:00:00Z");
    expect(placeLocalMinutes(-85.85, at)).toEqual({ day: "th", minutes: 360 });
    // 23:30 UTC at +139.7° (Tokyo, UTC+9) is 08:30 the next day.
    expect(placeLocalMinutes(139.7, new Date("2026-10-15T23:30:00Z"))).toEqual({ day: "fr", minutes: 510 });
  });
});

describe("addressLines", () => {
  it("the street on one line, the city, state and postcode on the next, like a postal address", () => {
    expect(
      addressLines({
        address: "6519 Midnight Pass Road Sarasota 34242",
        locality: "Sarasota",
        region: "FL",
        postalCode: "34242",
      }),
    ).toEqual(["6519 Midnight Pass Road", "Sarasota, FL 34242"]);
  });
  it("one line when only one part is known", () => {
    expect(addressLines({ address: null, locality: "Sarasota", region: "FL", postalCode: null })).toEqual([
      "Sarasota, FL",
    ]);
    expect(addressLines({ address: "Calle 5", locality: null, region: null, postalCode: null })).toEqual(["Calle 5"]);
    expect(addressLines({ address: null, locality: null, region: null, postalCode: null })).toBeNull();
  });
});

describe("addressLine", () => {
  it("street, city, state and postcode, with the city and postcode said once however the list's line had them", () => {
    expect(
      addressLine({
        address: "6519 Midnight Pass Road Sarasota 34242",
        locality: "Sarasota",
        region: "FL",
        postalCode: "34242",
      }),
    ).toBe("6519 Midnight Pass Road, Sarasota, FL 34242");
    expect(
      addressLine({
        address: "2328 Gulf Gate Drive Sarasota 34231-5608",
        locality: "Sarasota",
        region: "FL",
        postalCode: "34231",
      }),
    ).toBe("2328 Gulf Gate Drive, Sarasota, FL 34231-5608");
  });
  it("what the list gives, when it gives less", () => {
    expect(addressLine({ address: "Calle 5", locality: "Tamarindo", region: null, postalCode: null })).toBe(
      "Calle 5, Tamarindo",
    );
    expect(addressLine({ address: "Hauptstraße 1", locality: null, region: null, postalCode: "10115" })).toBe(
      "Hauptstraße 1, 10115",
    );
    expect(addressLine({ address: null, locality: "Sarasota", region: "FL", postalCode: null })).toBe("Sarasota, FL");
    expect(addressLine({ address: null, locality: null, region: null, postalCode: null })).toBeNull();
  });
});
