/**
 * Eleven rows of "Verified —" tell a person nothing. The history keeps the
 * newest run and every run that moved the score, and folds each stretch of
 * runs that changed nothing into one line.
 */
import { describe, expect, it } from "vitest";
import { foldUnchanged, withDeltas } from "./scoreJournal";

const DAY = 86_400_000;
const at = (d: number) => Date.UTC(2026, 8, 1) + d * DAY;

describe("foldUnchanged", () => {
  it("keeps the newest run, keeps every run that moved, and folds the quiet stretches between", () => {
    const rows = foldUnchanged(
      withDeltas([
        { t: at(0), score: 0.5 },
        { t: at(7), score: 0.5 },
        { t: at(14), score: 0.5 },
        { t: at(21), score: 0.62 },
        { t: at(28), score: 0.62 },
        { t: at(35), score: 0.62 },
        { t: at(42), score: 0.62 },
      ]),
    );
    expect(rows.map((r) => (r.kind === "run" ? `run@${(r.entry.t - at(0)) / DAY}` : `fold×${r.count}`))).toEqual([
      "run@42", // newest: the run behind the current score, shown even though it changed nothing
      "fold×2", // days 35 and 28
      "run@21", // the one that moved the score
      "fold×2", // days 14 and 7
      "run@0", // the first run on record has nothing to compare with
    ]);
    const fold = rows[1];
    expect(fold.kind === "fold" && [fold.fromMs, fold.toMs]).toEqual([at(28), at(35)]);
  });

  it("treats a movement too small to show as no change", () => {
    const rows = foldUnchanged(
      withDeltas([
        { t: at(0), score: 0.5 },
        { t: at(7), score: 0.5004 },
        { t: at(14), score: 0.5004 },
        { t: at(21), score: 0.5004 },
      ]),
    );
    expect(rows.map((r) => r.kind)).toEqual(["run", "fold", "run"]);
  });

  it("lets the surface say what counts as a change — in tier words, only a new tier does", () => {
    const tierOf = (score: number) => (score >= 0.6 ? "verified" : "unverified");
    const rows = foldUnchanged(
      withDeltas([
        { t: at(0), score: 0.5 },
        { t: at(7), score: 0.7 }, // crossed into Verified: a change the reader sees
        { t: at(14), score: 0.74 }, // the number moved, the word did not
        { t: at(21), score: 0.78 },
        { t: at(28), score: 0.78 },
      ]),
      (e) => e.previous !== null && tierOf(e.score) !== tierOf(e.previous),
    );
    expect(rows.map((r) => (r.kind === "run" ? `run@${(r.entry.t - at(0)) / DAY}` : `fold×${r.count}`))).toEqual([
      "run@28",
      "fold×2",
      "run@7",
      "run@0",
    ]);
  });

  it("leaves a short history alone", () => {
    const rows = foldUnchanged(
      withDeltas([
        { t: at(0), score: 0.5 },
        { t: at(7), score: 0.5 },
      ]),
    );
    expect(rows.map((r) => r.kind)).toEqual(["run", "run"]);
  });
});
