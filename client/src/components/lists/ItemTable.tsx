/**
 * A list's items as a table: a title, summary, curator, date and problem
 * count a row, with a search, a curator filter, a problems toggle and a sort
 * above and a pager below. Controlled: it is handed the rows already
 * filtered and sorted, and the query, sort and page they were made with, and
 * reports each change through a callback; it holds none of that itself. A
 * curator shows by profile name, never a rank, and a row opens its item.
 */
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Pagination, PaginationContent, PaginationItem } from "@/components/ui/pagination";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EMPTY_QUERY, type CheckedItem, type ItemQuery, type ItemSort } from "@/lib/listHealth";

export const PAGE_SIZE = 50;

/** A Select item cannot hold "", so "every curator" is this. */
const ALL_CURATORS = "all";

const SORTS: { value: ItemSort; label: string }[] = [
  { value: "newest", label: "Newest" },
  { value: "title", label: "Title A to Z" },
  { value: "problems", label: "Most problems" },
];

const count = (n: number) => n.toLocaleString("en-US");

const sameQuery = (a: ItemQuery, b: ItemQuery) =>
  a.text === b.text && a.curator === b.curator && a.problem === b.problem && a.onlyProblems === b.onlyProblems;

const dateOf = (createdAt: number) =>
  new Date(createdAt * 1000).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });

export function ItemTable({
  rows,
  total,
  singular,
  curators,
  query,
  onQuery,
  sort,
  onSort,
  page,
  onPage,
  onOpen,
}: {
  /** Already filtered and sorted. */
  rows: CheckedItem[];
  /** Items on the list, or read from it. */
  total: number;
  singular: string;
  curators: { pubkey: string; name: string }[];
  query: ItemQuery;
  onQuery: (q: ItemQuery) => void;
  sort: ItemSort;
  onSort: (s: ItemSort) => void;
  /** 1-based. */
  page: number;
  onPage: (p: number) => void;
  onOpen: (id: string) => void;
}) {
  const names = new Map(curators.map((c) => [c.pubkey, c.name]));
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = Math.min(Math.max(page, 1), pages);
  const first = (current - 1) * PAGE_SIZE;
  const shown = rows.slice(first, first + PAGE_SIZE);
  const filtered = rows.length !== total;

  return (
    <div className="space-y-4" data-testid="item-table">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          type="search"
          value={query.text}
          onChange={(e) => onQuery({ ...query, text: e.target.value })}
          placeholder="Search items"
          aria-label="Search items"
          className="w-full sm:max-w-xs"
          data-testid="item-table-search"
        />
        {curators.length > 1 && (
          <Select
            value={query.curator ?? ALL_CURATORS}
            onValueChange={(v) => onQuery({ ...query, curator: v === ALL_CURATORS ? null : v })}
          >
            <SelectTrigger aria-label="Curator" className="w-[180px]" data-testid="item-table-curator">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_CURATORS}>All curators</SelectItem>
              {curators.map((c) => (
                <SelectItem key={c.pubkey} value={c.pubkey}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <div className="flex items-center gap-2">
          <Switch
            id="item-table-only-problems"
            checked={query.onlyProblems}
            onCheckedChange={(onlyProblems) => onQuery({ ...query, onlyProblems })}
            data-testid="item-table-only-problems"
          />
          <Label htmlFor="item-table-only-problems">Only items with problems</Label>
        </div>
        <Select value={sort} onValueChange={(v) => onSort(v as ItemSort)}>
          <SelectTrigger aria-label="Sort" className="w-[160px] sm:ml-auto" data-testid="item-table-sort">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORTS.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {!sameQuery(query, EMPTY_QUERY) && (
          <Button variant="ghost" size="sm" onClick={() => onQuery(EMPTY_QUERY)} data-testid="item-table-clear">
            Clear
          </Button>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400" data-testid="item-table-empty">
          No items match.
        </p>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Summary</TableHead>
                <TableHead>Curator</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead className="text-right">Problems</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map(({ item, check }) => {
                const title = check.resolved.title?.trim() || null;
                const problems = check.problems.length;
                return (
                  // The row takes the click, so the whole row is a target; the button in
                  // its first cell is the keyboard's way in, and its click rises to here.
                  <TableRow
                    key={item.id}
                    className="cursor-pointer"
                    data-testid="item-table-row"
                    onClick={() => onOpen(item.id)}
                  >
                    <TableCell className="max-w-[16rem]">
                      <button
                        type="button"
                        className={
                          title
                            ? "block max-w-full truncate rounded text-left font-medium text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent dark:text-slate-100"
                            : "block max-w-full truncate rounded text-left font-medium text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent dark:text-slate-400"
                        }
                      >
                        {title ?? `Untitled ${singular}`}
                      </button>
                    </TableCell>
                    <TableCell className="max-w-[24rem] text-slate-500 dark:text-slate-400">
                      <div className="truncate">{check.resolved.summary}</div>
                    </TableCell>
                    <TableCell className="max-w-[10rem]">
                      <div className="truncate">{names.get(item.pubkey) ?? `${item.pubkey.slice(0, 12)}…`}</div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-slate-500 dark:text-slate-400">
                      {dateOf(item.created_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      {problems > 0 && (
                        <Chip
                          tone={check.problems.some((p) => p.blocking) ? "warning" : "neutral"}
                          size="sm"
                          aria-label={`${problems} ${problems === 1 ? "problem" : "problems"}`}
                        >
                          {problems}
                        </Chip>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-500 dark:text-slate-400" data-testid="item-table-count">
              Showing {count(first + 1)} to {count(first + shown.length)} of{" "}
              {filtered ? `${count(rows.length)} matching, ${count(total)} on the list.` : `${count(rows.length)}.`}
            </p>
            <Pagination className="mx-0 w-auto">
              <PaginationContent>
                <PaginationItem>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={current <= 1}
                    onClick={() => onPage(current - 1)}
                    data-testid="item-table-prev"
                  >
                    <ChevronLeft />
                    Previous
                  </Button>
                </PaginationItem>
                <PaginationItem>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={current >= pages}
                    onClick={() => onPage(current + 1)}
                    data-testid="item-table-next"
                  >
                    Next
                    <ChevronRight />
                  </Button>
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </div>
        </>
      )}
    </div>
  );
}
