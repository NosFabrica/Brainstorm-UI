/**
 * Build-time checks on the chunk graph (the `bundle-budget` plugin in
 * vite.config.ts hands it the bundle): what the first page costs, and the
 * chunk cycles that would leave it blank. Never part of the app.
 */
import type { BuiltFile } from "@/sw/precache";

export interface BudgetFile extends BuiltFile {
  code?: string;
}

/**
 * The most the entry chunk may weigh, gzipped. It is what every visitor
 * downloads and runs before the first paint; the vendor chunks beside it are
 * fetched in parallel and change far less often. Set just above its size when
 * the vendor chunks were split out (2026-11-26); raise it on purpose, not to
 * make a build pass.
 */
export const ENTRY_BUDGET_GZ = 400 * 1024;

/** A chunk and every chunk it statically imports, the chunk first. */
function staticClosure(bundle: Record<string, BudgetFile>, start: string): string[] {
  const seen = new Set<string>();
  const walk = (name: string) => {
    if (seen.has(name) || bundle[name]?.type !== "chunk") return;
    seen.add(name);
    for (const next of bundle[name].imports ?? []) walk(next);
  };
  walk(start);
  return [...seen];
}

/**
 * A cycle among the chunks the entry loads, as the file names around it, or
 * null. Chunks run in import order, so in a cycle one of them runs before a
 * chunk it calls into: the page throws on load (an unassigned CommonJS helper
 * did exactly that to React's chunk).
 */
export function chunkCycle(bundle: Record<string, BudgetFile>, start: string): string[] | null {
  const state = new Map<string, "open" | "done">();
  const path: string[] = [];
  const visit = (name: string): string[] | null => {
    if (bundle[name]?.type !== "chunk") return null;
    const at = state.get(name);
    if (at === "done") return null;
    if (at === "open") return [...path.slice(path.indexOf(name)), name];
    state.set(name, "open");
    path.push(name);
    for (const next of bundle[name].imports ?? []) {
      const cycle = visit(next);
      if (cycle) return cycle;
    }
    path.pop();
    state.set(name, "done");
    return null;
  };
  return visit(start);
}

export interface BundleReport {
  entry: string;
  entryGz: number;
  firstLoad: string[];
  firstLoadGz: number;
  problems: string[];
}

/** What the first page downloads, and what is wrong with it. */
export function bundleReport(
  bundle: Record<string, BudgetFile>,
  gzipSize: (code: string) => number,
  budget = ENTRY_BUDGET_GZ,
): BundleReport {
  const entries = Object.values(bundle).filter((file) => file.type === "chunk" && file.isEntry);
  if (entries.length !== 1) throw new Error(`bundle: expected one entry chunk, found ${entries.length}`);
  const entry = entries[0].fileName;
  const firstLoad = staticClosure(bundle, entry);
  const size = (name: string) => gzipSize(bundle[name].code ?? "");
  const entryGz = size(entry);
  const firstLoadGz = firstLoad.reduce((sum, name) => sum + size(name), 0);
  const problems: string[] = [];
  const kb = (bytes: number) => `${(bytes / 1024).toFixed(0)} KB`;
  if (entryGz > budget)
    problems.push(`${entry} is ${kb(entryGz)} gzipped, over its ${kb(budget)} budget (ENTRY_BUDGET_GZ)`);
  const cycle = chunkCycle(bundle, entry);
  if (cycle) problems.push(`chunk import cycle: ${cycle.join(" -> ")} (vite.config.ts manualChunks)`);
  return { entry, entryGz, firstLoad, firstLoadGz, problems };
}
