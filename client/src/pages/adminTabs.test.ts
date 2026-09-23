import { describe, expect, it } from "vitest";
import { parseAdminTab } from "./adminTabs";

// `?tab=` is how other pages (and the Users tab's shortcuts) open a section.
// An unknown or gated value must land on Overview, never a blank panel.
describe("parseAdminTab", () => {
  it("opens the Trusted Lists tab", () => {
    expect(parseAdminTab("trusted-lists", { assistants: false })).toBe("trusted-lists");
  });

  it("keeps the tabs it always opened", () => {
    for (const t of ["users", "activity", "health", "scheduling", "billing", "support"] as const) {
      expect(parseAdminTab(t, { assistants: false })).toBe(t);
    }
  });

  it("opens Assistants only when that section is switched on", () => {
    expect(parseAdminTab("assistants", { assistants: true })).toBe("assistants");
    expect(parseAdminTab("assistants", { assistants: false })).toBe("overview");
  });

  it("falls back to Overview for anything else", () => {
    expect(parseAdminTab(null, { assistants: true })).toBe("overview");
    expect(parseAdminTab("nope", { assistants: true })).toBe("overview");
  });
});
