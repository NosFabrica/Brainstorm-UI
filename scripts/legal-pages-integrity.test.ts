/**
 * Legal pages integrity test.
 *
 * Guards the Privacy and Terms pages against accidental wording changes by
 * asserting that the `TITLE`, `LAST_REVISED`, `PREAMBLE` and `SECTIONS` content
 * authored in:
 *   - client/src/pages/PrivacyPage.tsx
 *   - client/src/pages/TermsPage.tsx
 * still matches, in order and text, the canonical approved legal source copy in
 * the attached source documents:
 *   - attached_assets/Pasted-BRAINSTORM-PRIVACY-NOTICE-...txt
 *   - attached_assets/Pasted-BRAINSTORM-TERMS-OF-USE-...txt
 *
 * The page content is extracted statically from the TypeScript AST (so no React
 * / JSX is executed and reformatting the file does not affect the result), then
 * flattened into an ordered list of text tokens:
 *
 *   [ TITLE, LAST_REVISED, ...PREAMBLE,
 *     (per section) title, ...blocks (p -> text, address -> ...lines) ]
 *
 * The canonical source is the list of non-empty, trimmed lines of the source
 * .txt, in order. The two lists must match element-for-element. Any paragraph,
 * section title, or address line that is changed, removed, added, or reordered
 * causes a clear failure that points at the exact offending token.
 *
 * Run with:  npx tsx scripts/legal-pages-integrity.test.ts
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import ts from "typescript";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const ASSETS_DIR = path.join(ROOT, "attached_assets");
const PAGES_DIR = path.join(ROOT, "client", "src", "pages");

interface DocCase {
  name: string;
  pagePath: string;
  sourcePattern: RegExp;
}

const DOCS: DocCase[] = [
  {
    name: "Privacy Notice",
    pagePath: path.join(PAGES_DIR, "PrivacyPage.tsx"),
    sourcePattern: /^Pasted-BRAINSTORM-PRIVACY-NOTICE-.*\.txt$/,
  },
  {
    name: "Terms of Use",
    pagePath: path.join(PAGES_DIR, "TermsPage.tsx"),
    sourcePattern: /^Pasted-BRAINSTORM-TERMS-OF-USE-.*\.txt$/,
  },
];

function fail(message: string): never {
  console.error(`\n\u274c  Legal pages integrity test FAILED\n\n${message}\n`);
  process.exit(1);
}

function findSourceFile(pattern: RegExp): string {
  const matches = fs
    .readdirSync(ASSETS_DIR)
    .filter((f) => pattern.test(f))
    .sort();
  if (matches.length === 0) {
    fail(
      `Could not find canonical source document matching ${pattern} in ${ASSETS_DIR}.\n` +
        `The legal source-of-truth file is missing — restore it before this test can run.`,
    );
  }
  if (matches.length > 1) {
    fail(
      `Found multiple canonical source documents matching ${pattern} in ${ASSETS_DIR}:\n` +
        matches.map((m) => `  - ${m}`).join("\n") +
        `\nThere must be exactly one approved source per document.`,
    );
  }
  return path.join(ASSETS_DIR, matches[0]);
}

function getStringLiteral(node: ts.Node | undefined): string | null {
  if (!node) return null;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }
  return null;
}

function findTopLevelInitializer(
  sourceFile: ts.SourceFile,
  name: string,
): ts.Expression | undefined {
  let result: ts.Expression | undefined;
  sourceFile.forEachChild((node) => {
    if (ts.isVariableStatement(node)) {
      for (const decl of node.declarationList.declarations) {
        if (ts.isIdentifier(decl.name) && decl.name.text === name) {
          result = decl.initializer;
        }
      }
    }
  });
  return result;
}

function getObjectProp(
  obj: ts.ObjectLiteralExpression,
  name: string,
): ts.Expression | undefined {
  for (const prop of obj.properties) {
    if (
      ts.isPropertyAssignment(prop) &&
      prop.name &&
      ts.isIdentifier(prop.name) &&
      prop.name.text === name
    ) {
      return prop.initializer;
    }
  }
  return undefined;
}

/** Extract the ordered list of text tokens authored in a legal page .tsx file. */
function extractPageTokens(pagePath: string): string[] {
  const fileText = fs.readFileSync(pagePath, "utf8");
  const sf = ts.createSourceFile(
    pagePath,
    fileText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );

  const where = path.relative(ROOT, pagePath);

  const title = getStringLiteral(findTopLevelInitializer(sf, "TITLE"));
  if (title === null) fail(`${where}: could not read a string \`TITLE\` constant.`);
  const lastRevised = getStringLiteral(
    findTopLevelInitializer(sf, "LAST_REVISED"),
  );
  if (lastRevised === null)
    fail(`${where}: could not read a string \`LAST_REVISED\` constant.`);

  const preambleNode = findTopLevelInitializer(sf, "PREAMBLE");
  if (!preambleNode || !ts.isArrayLiteralExpression(preambleNode)) {
    fail(`${where}: could not read a \`PREAMBLE\` string array.`);
  }
  const preamble: string[] = [];
  preambleNode.elements.forEach((el, i) => {
    const s = getStringLiteral(el);
    if (s === null)
      fail(`${where}: PREAMBLE[${i}] is not a plain string literal.`);
    preamble.push(s);
  });

  const sectionsNode = findTopLevelInitializer(sf, "SECTIONS");
  if (!sectionsNode || !ts.isArrayLiteralExpression(sectionsNode)) {
    fail(`${where}: could not read a \`SECTIONS\` array.`);
  }

  const tokens: string[] = [title, lastRevised, ...preamble];

  sectionsNode.elements.forEach((sectionEl, si) => {
    if (!ts.isObjectLiteralExpression(sectionEl)) {
      fail(`${where}: SECTIONS[${si}] is not an object literal.`);
    }
    const sectionTitle = getStringLiteral(getObjectProp(sectionEl, "title"));
    if (sectionTitle === null)
      fail(`${where}: SECTIONS[${si}] has no string \`title\`.`);
    tokens.push(sectionTitle);

    const blocksNode = getObjectProp(sectionEl, "blocks");
    if (!blocksNode || !ts.isArrayLiteralExpression(blocksNode)) {
      fail(`${where}: SECTIONS[${si}] (\"${sectionTitle}\") has no \`blocks\` array.`);
    }
    blocksNode.elements.forEach((blockEl, bi) => {
      if (!ts.isObjectLiteralExpression(blockEl)) {
        fail(`${where}: SECTIONS[${si}].blocks[${bi}] is not an object literal.`);
      }
      const textNode = getObjectProp(blockEl, "text");
      const linesNode = getObjectProp(blockEl, "lines");
      if (textNode) {
        const s = getStringLiteral(textNode);
        if (s === null)
          fail(
            `${where}: SECTIONS[${si}].blocks[${bi}].text is not a plain string literal.`,
          );
        tokens.push(s);
      } else if (linesNode && ts.isArrayLiteralExpression(linesNode)) {
        linesNode.elements.forEach((lineEl, li) => {
          const s = getStringLiteral(lineEl);
          if (s === null)
            fail(
              `${where}: SECTIONS[${si}].blocks[${bi}].lines[${li}] is not a plain string literal.`,
            );
          tokens.push(s);
        });
      } else {
        fail(
          `${where}: SECTIONS[${si}].blocks[${bi}] has neither a \`text\` nor a \`lines\` field.`,
        );
      }
    });
  });

  return tokens.map((t) => t.trim());
}

/** Canonical tokens = the non-empty, trimmed lines of the approved source .txt. */
function extractSourceTokens(sourcePath: string): string[] {
  return fs
    .readFileSync(sourcePath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function preview(s: string, focusAt?: number): string {
  const max = 160;
  const oneLine = s.replace(/\s+/g, " ");
  if (oneLine.length <= max) return oneLine;
  // When a focus index is given (the first differing char), center the window
  // on it so the actual change is always visible, not just the shared prefix.
  if (focusAt !== undefined && focusAt > max - 40) {
    const start = Math.max(0, focusAt - 40);
    const end = Math.min(oneLine.length, start + max);
    const head = start > 0 ? "…" : "";
    const tail = end < oneLine.length ? "…" : "";
    return `${head}${oneLine.slice(start, end)}${tail}`;
  }
  return `${oneLine.slice(0, max)}…`;
}

/** Index of the first character that differs between two strings. */
function firstDiffIndex(a: string, b: string): number {
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    if (a[i] !== b[i]) return i;
  }
  return len;
}

function compareDoc(doc: DocCase): void {
  const sourcePath = findSourceFile(doc.sourcePattern);
  const pageTokens = extractPageTokens(doc.pagePath);
  const sourceTokens = extractSourceTokens(sourcePath);

  const pageWhere = path.relative(ROOT, doc.pagePath);
  const sourceWhere = path.relative(ROOT, sourcePath);

  const max = Math.max(pageTokens.length, sourceTokens.length);
  for (let i = 0; i < max; i++) {
    const expected = sourceTokens[i];
    const actual = pageTokens[i];
    if (expected !== actual) {
      const prevExpected = i > 0 ? sourceTokens[i - 1] : "(start of document)";
      const focus =
        expected !== undefined && actual !== undefined
          ? firstDiffIndex(expected, actual)
          : undefined;
      fail(
        `${doc.name}: content diverged from the approved legal source at entry #${i + 1}.\n\n` +
          `  Page file:   ${pageWhere}\n` +
          `  Source copy: ${sourceWhere}\n\n` +
          `  After (matching) text:\n    ${preview(prevExpected ?? "")}\n\n` +
          `  Expected (canonical source):\n    ${
            expected === undefined ? "(no more content — page has EXTRA content)" : preview(expected, focus)
          }\n\n` +
          `  Found (in page .tsx):\n    ${
            actual === undefined ? "(missing — page is MISSING content)" : preview(actual, focus)
          }\n\n` +
          `If this change to the binding legal text is intentional, update the\n` +
          `approved source document (${sourceWhere}) in lockstep with the page.`,
      );
    }
  }

  console.log(
    `\u2713  ${doc.name}: ${pageTokens.length} content entries match the approved source ` +
      `(${path.basename(sourcePath)}).`,
  );
}

function main(): void {
  console.log("Verifying legal pages match approved source copy…\n");
  for (const doc of DOCS) {
    compareDoc(doc);
  }
  console.log("\n\u2705  All legal pages match their approved source documents.\n");
}

main();
