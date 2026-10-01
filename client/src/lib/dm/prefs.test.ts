import { beforeEach, describe, expect, it } from "vitest";
import { __resetDmPrefs, forgetDmPrefs, readDmPrefs, updateDmPrefs } from "./prefs";

const PK = "a".repeat(64);
const KEY = `brainstorm_dm_prefs:${PK}`;

describe("message prefs", () => {
  beforeEach(() => {
    localStorage.clear();
    __resetDmPrefs();
  });

  it("reads a damaged row field by field instead of throwing later", () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({ accepted: null, read: { x: "soon", y: 5 }, pinned: [1, "k"], notify: 3 }),
    );
    const p = readDmPrefs(PK);
    expect(p.accepted).toEqual([]);
    expect(p.read).toEqual({ y: 5 });
    expect(p.pinned).toEqual(["k"]);
    expect(p.notify).toEqual({ desktop: false, sound: true, preview: true });
  });

  it("keeps the per-room maps bounded, newest first", () => {
    const read: Record<string, number> = {};
    for (let i = 0; i < 2500; i++) read[`room${i}`] = i;
    updateDmPrefs(PK, (p) => ({ ...p, read }));
    const kept = readDmPrefs(PK).read;
    expect(Object.keys(kept)).toHaveLength(2000);
    expect(kept.room2499).toBe(2499);
    expect(kept.room0).toBeUndefined();
  });

  it("forgets what it held once sign-out removed the row", () => {
    updateDmPrefs(PK, (p) => ({ ...p, pinned: ["k"] }));
    localStorage.removeItem(KEY);
    forgetDmPrefs();
    expect(readDmPrefs(PK).pinned).toEqual([]);
  });
});
