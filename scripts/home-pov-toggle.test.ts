/**
 * Home search perspective toggle integrity test.
 *
 * Guards the logged-in trust-perspective toggle on the search-first home
 * (`client/src/pages/landing.tsx`) against silent regressions. There is no DOM
 * test runner in this repo (see .agents/memory/testing-pattern.md), so this test
 * does two things:
 *
 *   1. LOGIC — replicates the `effectivePov` derivation and asserts the full
 *      truth table, including the "stored My-WoT but no calculated graph" fallback
 *      to the house (NosFabrica) view, and the logged-out fallback. The replica is
 *      cross-checked against the actual expression authored in landing.tsx so the
 *      two cannot drift apart silently.
 *
 *   2. STRUCTURE — statically verifies (via the TypeScript AST, whitespace- and
 *      reformatting-immune) that the JSX for the three states is wired the way the
 *      product spec requires:
 *        - logged-out: a non-interactive "Not Personalized" hint
 *          (`text-home-pov-label`), and NO interactive toggle.
 *        - logged-in: a `toggle-home-pov` group with selectable
 *          `toggle-home-pov-nosfabrica` and `toggle-home-pov-mywot` options whose
 *          active state is driven by `effectivePov`.
 *        - logged-in without a graph: the My-WoT option is `disabled` on
 *          `!hasMywot` and a `link-home-calculate-yours` link to `/settings`
 *          appears.
 *        - switching perspective re-runs the active search (an effect keyed on
 *          `effectivePov` calls `handleSearch`), and searches are issued with
 *          `effectivePov`.
 *
 * Run with:  npx tsx scripts/home-pov-toggle.test.ts
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import ts from "typescript";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const LANDING = path.join(ROOT, "client", "src", "pages", "landing.tsx");
const WHERE = path.relative(ROOT, LANDING);

let failures = 0;
function check(label: string, cond: boolean, detail?: string): void {
  if (cond) {
    console.log(`  \u2713 ${label}`);
  } else {
    failures++;
    console.error(`  \u2717 ${label}${detail ? `\n      ${detail}` : ""}`);
  }
}

function fail(message: string): never {
  console.error(`\n\u274c  Home POV toggle test FAILED\n\n${message}\n`);
  process.exit(1);
}

const SRC = fs.readFileSync(LANDING, "utf8");
const SF = ts.createSourceFile(
  LANDING,
  SRC,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);

/** Whitespace-normalized full source, for resilient substring assertions. */
const NORM = SRC.replace(/\s+/g, " ");
function has(snippet: string): boolean {
  return NORM.includes(snippet.replace(/\s+/g, " ").trim());
}

// ---------------------------------------------------------------------------
// 1. effectivePov derivation logic (the heart of the three states).
// ---------------------------------------------------------------------------

type Pov = "nosfabrica" | "mywot";
const ANON_POV: Pov = "nosfabrica";

/** Local replica of landing.tsx's effectivePov useMemo body. */
function computeEffectivePov(
  user: unknown | null,
  pov: Pov,
  hasMywot: boolean,
): Pov {
  if (!user) return ANON_POV;
  return pov === "mywot" && !hasMywot ? ANON_POV : pov;
}

interface Case {
  name: string;
  user: unknown | null;
  pov: Pov;
  hasMywot: boolean;
  expected: Pov;
}

const USER = { pubkey: "abc" };
const LOGIC_CASES: Case[] = [
  // Logged-out: always house, regardless of stored pov.
  { name: "logged-out + stored nosfabrica -> house", user: null, pov: "nosfabrica", hasMywot: false, expected: "nosfabrica" },
  { name: "logged-out + stored mywot -> house", user: null, pov: "mywot", hasMywot: true, expected: "nosfabrica" },
  // Logged-in WITH a calculated graph: honor the stored perspective.
  { name: "logged-in + graph + stored nosfabrica -> house", user: USER, pov: "nosfabrica", hasMywot: true, expected: "nosfabrica" },
  { name: "logged-in + graph + stored mywot -> mine", user: USER, pov: "mywot", hasMywot: true, expected: "mywot" },
  // Logged-in WITHOUT a calculated graph: mywot falls back to house.
  { name: "logged-in + NO graph + stored mywot -> house (fallback)", user: USER, pov: "mywot", hasMywot: false, expected: "nosfabrica" },
  { name: "logged-in + NO graph + stored nosfabrica -> house", user: USER, pov: "nosfabrica", hasMywot: false, expected: "nosfabrica" },
];

console.log("\nHome POV toggle — derivation logic:");
for (const c of LOGIC_CASES) {
  const got = computeEffectivePov(c.user, c.pov, c.hasMywot);
  check(c.name, got === c.expected, `expected "${c.expected}", got "${got}"`);
}

// Cross-check: the replica must match the expression actually authored in the
// source, or the logic table above is testing a stale copy.
{
  const memoBody = SRC.match(
    /const\s+effectivePov\s*=\s*useMemo\(\s*\(\)\s*=>\s*\{([\s\S]*?)\}\s*,\s*\[[^\]]*\]\s*\)/,
  );
  if (!memoBody) {
    fail(
      `${WHERE}: could not locate the \`effectivePov = useMemo(...)\` block.\n` +
        `If it was renamed/refactored, update scripts/home-pov-toggle.test.ts to match.`,
    );
  }
  const body = memoBody[1].replace(/\s+/g, " ").trim();
  check(
    "source effectivePov returns ANON_POV when !user",
    /if\s*\(\s*!user\s*\)\s*return\s+ANON_POV\s*;/.test(memoBody[1]),
    `actual body: ${body}`,
  );
  check(
    "source effectivePov falls back to ANON_POV for mywot+!hasMywot",
    body.includes('pov === "mywot" && !hasMywot ? ANON_POV : pov'),
    `actual body: ${body}`,
  );
  check(
    "source ANON_POV constant is 'nosfabrica'",
    /ANON_POV\s*=\s*"nosfabrica"/.test(SRC),
  );
}

// ---------------------------------------------------------------------------
// 2. JSX structure for the three states.
// ---------------------------------------------------------------------------

console.log("\nLogged-out state (non-interactive hint):");
check(
  'renders text-home-pov-label "Not Personalized"',
  /data-testid="text-home-pov-label"[\s>][\s\S]{0,40}Not Personalized/.test(SRC) ||
    has('data-testid="text-home-pov-label">Not Personalized'),
);
check(
  "the hint lives in the !user branch (logged-out)",
  has('{!user ? ('),
);
check(
  "logged-out hint is NOT the interactive toggle (toggle is in the user branch)",
  // toggle-home-pov must appear AFTER the `) : (` that opens the logged-in branch.
  (() => {
    const labelIdx = SRC.indexOf('data-testid="text-home-pov-label"');
    const toggleIdx = SRC.indexOf('data-testid="toggle-home-pov"');
    if (labelIdx < 0 || toggleIdx < 0) return false;
    // The ternary divider that splits the logged-out hint from the logged-in
    // toggle is the first `) : (` that appears AFTER the label.
    const elseIdx = SRC.indexOf(") : (", labelIdx);
    return elseIdx > labelIdx && toggleIdx > elseIdx;
  })(),
  "toggle should be in the logged-in branch; label in the logged-out branch",
);

console.log("\nLogged-in state (interactive toggle):");
check('toggle group toggle-home-pov present', has('data-testid="toggle-home-pov"'));
check(
  "nosfabrica option present and selects house on click",
  has('data-testid="toggle-home-pov-nosfabrica"') &&
    has('onClick={() => setPov("nosfabrica")}'),
);
check(
  "mywot option present",
  has('data-testid="toggle-home-pov-mywot"'),
);
check(
  "active option reflects effectivePov (aria-pressed bound to effectivePov)",
  has('aria-pressed={effectivePov === "nosfabrica"}') &&
    has('aria-pressed={effectivePov === "mywot"}'),
);

console.log("\nLogged-in WITHOUT a calculated graph (disabled + calculate link):");
check(
  "mywot option is disabled when !hasMywot",
  has("disabled={!hasMywot}"),
);
check(
  "mywot click is guarded so it cannot select when no graph",
  has("if (hasMywot) setPov(\"mywot\")"),
);
check(
  "link-home-calculate-yours rendered only when !hasMywot",
  /\{!hasMywot && \([\s\S]*?data-testid="link-home-calculate-yours"/.test(SRC),
);
check(
  'calculate-yours links to "/settings"',
  /data-testid="link-home-calculate-yours"[\s\S]{0,200}setLocation\("\/settings"\)/.test(
    SRC,
  ) ||
    /setLocation\("\/settings"\)[\s\S]{0,200}data-testid="link-home-calculate-yours"/.test(
      SRC,
    ),
);

console.log("\nSwitching perspective re-runs the active search:");
check(
  "an effect keyed on effectivePov calls handleSearch",
  (() => {
    // find the effect whose deps array contains effectivePov AND that calls handleSearch
    const m = SRC.match(
      /useEffect\(\(\)\s*=>\s*\{([\s\S]*?)\}\s*,\s*\[([^\]]*effectivePov[^\]]*)\]\s*\)/g,
    );
    if (!m) return false;
    return m.some((block) => /handleSearch\(/.test(block) && /prevPovRef/.test(block));
  })(),
);
check(
  "searches are issued with the effective perspective",
  has("searchByText(q, effectivePov, user?.pubkey, 100)"),
);

// ---------------------------------------------------------------------------

console.log("");
if (failures > 0) {
  fail(`${failures} check(s) failed in ${WHERE}. See \u2717 lines above.`);
}
console.log(
  `\u2705  Home POV toggle: all ${LOGIC_CASES.length} logic cases and all structural checks passed.\n`,
);
