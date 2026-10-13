/**
 * A list's health at a glance: how many items, curators, and problems; how
 * many items read as a title, a picture, a link; and which problems recur.
 * Pressing a problem hands its key up so the items table can show just those
 * items, and pressing the active one again hands up null to clear it. Draws
 * the summary it is given and reads nothing itself (lib/listHealth).
 */
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Chip } from "@/components/ui/chip";
import { Progress } from "@/components/ui/progress";
import { SectionHeader } from "@/components/ui/section-header";
import { StatTile } from "@/components/ui/stat-tile";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ROLE_LABEL, type ListSummary, type ProblemRow } from "@/lib/listHealth";
import { cn } from "@/lib/utils";

/** "link-unusable" as "Link unusable". */
const problemLabel = (code: string) => {
  const words = code.replace(/-/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
};

/** A number as every reader sees it, as the items table writes its counts. */
const num = (n: number) => n.toLocaleString("en-US");

/** One decimal and a "%", or null when there are no items to take a share of. */
const share = (count: number, total: number) => (total > 0 ? `${((count / total) * 100).toFixed(1)}%` : null);

/** That a relay ran out of time, shown wherever a read's rows may be short of the list. */
export function CutOffNotice() {
  return (
    <Alert variant="warning" data-testid="list-items-cut-off">
      <AlertDescription>
        A relay didn't finish answering within 20 seconds. This may not be every item.
      </AlertDescription>
    </Alert>
  );
}

export function ListHealth({
  summary,
  truncated,
  cutOff,
  activeProblem,
  onProblem,
}: {
  summary: ListSummary;
  /** The read reached the relay's cap, so the list may hold more. */
  truncated: boolean;
  /** The read ran to its deadline, so a relay may not have finished answering. */
  cutOff: boolean;
  activeProblem: string | null;
  onProblem: (key: string | null) => void;
}) {
  const { items } = summary;
  const pick = (p: ProblemRow) => onProblem(activeProblem === p.key ? null : p.key);
  return (
    <div className="space-y-6" data-testid="list-health">
      {truncated && (
        <Alert variant="warning" data-testid="list-items-truncated">
          <AlertDescription>The relay returned its maximum of 10,000 items. This list may hold more.</AlertDescription>
        </Alert>
      )}
      {cutOff && <CutOffNotice />}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label={truncated || cutOff ? "Items read" : "Items"}
          value={num(items)}
          tone="brand"
          data-testid="list-health-tile-items"
        />
        <StatTile
          label="Curators"
          value={num(summary.curators)}
          tone="neutral"
          data-testid="list-health-tile-curators"
        />
        <StatTile
          label="With a problem"
          value={num(summary.withProblems)}
          tone={summary.withProblems > 0 ? "warning" : "neutral"}
          data-testid="list-health-tile-problems"
        />
        <StatTile
          label="Would be blocked"
          value={num(summary.blocked)}
          tone={summary.blocked > 0 ? "danger" : "neutral"}
          data-testid="list-health-tile-blocked"
        />
      </div>

      {items > 0 && summary.coverage.length > 0 && (
        <section className="space-y-3">
          <SectionHeader kicker="How items read" />
          <ul className="space-y-3">
            {summary.coverage.map(({ role, count }) => (
              <li key={role} data-testid={`list-health-coverage-${role}`}>
                <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                  <span className="text-slate-900 dark:text-slate-100">{ROLE_LABEL[role]}</span>
                  <span className="tabular-nums text-slate-500 dark:text-slate-400">
                    {num(count)} ({share(count, items)})
                  </span>
                </div>
                <Progress value={(count / items) * 100} className="h-2" aria-label={ROLE_LABEL[role]} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {summary.problems.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400" data-testid="list-health-no-problems">
          No problems found.
        </p>
      ) : (
        <section className="space-y-3">
          <SectionHeader kicker="Problems" />
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Problem</TableHead>
                <TableHead>Field</TableHead>
                <TableHead className="text-right">Items</TableHead>
                <TableHead className="text-right">Share</TableHead>
                <TableHead>Example</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {summary.problems.map((p) => {
                const active = activeProblem === p.key;
                return (
                  // The row takes the click, so the whole row is a target; the button in
                  // its first cell is the keyboard's way in, and its click rises to here.
                  <TableRow
                    key={p.key}
                    className="cursor-pointer"
                    data-state={active ? "selected" : undefined}
                    data-testid={`list-health-problem-${p.key}`}
                    onClick={() => pick(p)}
                  >
                    <TableCell>
                      <button
                        type="button"
                        aria-pressed={active}
                        aria-label={p.field ? `${problemLabel(p.code)}, ${p.field}` : problemLabel(p.code)}
                        className={cn(
                          "rounded text-left font-medium text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent dark:text-slate-100",
                          active && "underline",
                        )}
                      >
                        {problemLabel(p.code)}
                      </button>
                      {p.blocking && (
                        <Chip tone="warning" size="sm" className="ml-2">
                          blocks publishing
                        </Chip>
                      )}
                    </TableCell>
                    <TableCell className="text-slate-500 dark:text-slate-400">{p.field ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{num(p.items)}</TableCell>
                    <TableCell className="text-right tabular-nums">{share(p.items, items)}</TableCell>
                    <TableCell className="text-slate-500 dark:text-slate-400">{p.example}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </section>
      )}
    </div>
  );
}
