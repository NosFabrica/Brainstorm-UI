/**
 * One list item in a side panel, down to its raw event: who filed it and
 * when, how the app draws it (the real renderers, through ItemPreview), what
 * is wrong with it, what each field of the list holds for it, and the event
 * itself. Draws the item, definition and check it is handed and reads nothing
 * itself; a caller decides which item is open. An `entry` of null with the
 * panel open is an address that names no item on this list.
 *
 * A curator's name is one they chose, and two may choose the same: the start
 * of their npub shows beside it, and the whole of it copies. Never a rank.
 *
 * The copy buttons hand the panel's own element to `copyToClipboard`: a
 * dialog traps focus, so the fallback's textarea has to live inside it.
 */
import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { curatorKey, shortCuratorKey } from "@/components/lists/curatorKey";
import { ItemPreview } from "@/components/lists/ItemPreview";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { SectionHeader } from "@/components/ui/section-header";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { dictionaryRelays } from "@/config/dictionary";
import { copyToClipboard } from "@/lib/clipboard";
import { coordinateOf, undeclaredFields } from "@/lib/dlistFields";
import type { ResolvedConcept } from "@/lib/conceptResolution";
import type { CheckedItem } from "@/lib/listHealth";
import { eventPath } from "@/lib/shareId";

/** How long a copy button reads "Copied". */
const COPIED_MS = 2000;

const updatedOf = (createdAt: number) =>
  new Date(createdAt * 1000).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });

type CopyState = "idle" | "copied" | "failed";

/** A button that copies `text` and says, for a moment, whether it did. */
function CopyButton({
  text,
  label,
  container,
  testId,
}: {
  text: string;
  label: string;
  container: () => HTMLElement | null;
  testId: string;
}) {
  const [state, setState] = useState<CopyState>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const copy = async () => {
    const ok = await copyToClipboard(text, { container: container() });
    if (!mounted.current) return;
    setState(ok ? "copied" : "failed");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), COPIED_MS);
  };

  return (
    <Button variant="outline" size="sm" onClick={copy} data-testid={testId}>
      {state === "copied" ? "Copied" : state === "failed" ? "Couldn't copy" : label}
    </Button>
  );
}

export function ItemInspector({
  open,
  entry,
  resolved,
  curatorName,
  onClose,
  onPrev,
  onNext,
}: {
  open: boolean;
  /** Null with `open` set: the id in the address is not on this list. */
  entry: CheckedItem | null;
  /** The definition the item was checked under. */
  resolved: ResolvedConcept;
  curatorName: string;
  onClose: () => void;
  onPrev: (() => void) | null;
  onNext: (() => void) | null;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const container = () => panel.current;
  const { fields, singular } = resolved.governing;

  const item = entry?.item ?? null;
  const title = entry ? entry.check.resolved.title?.trim() || `Untitled ${singular}` : "Item not found";
  const address = item ? coordinateOf(item) : null;
  // An empty `d` names nothing, so it reads as none.
  const d = item?.tags.find((t) => t[0] === "d")?.[1] || null;
  const key = item ? curatorKey(item.pubkey) : "";
  const shortKey = item ? shortCuratorKey(item.pubkey) : "";
  const raw = item ? JSON.stringify(item, null, 2) : "";
  const extra = item ? undeclaredFields(item, fields) : [];

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      {/* The primitive's own close button is hidden (as the sidebar's is) so the panel has one,
          carrying a test id. */}
      <SheetContent
        ref={panel}
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-xl [&>button]:hidden"
        data-testid="item-inspector"
      >
        <SheetHeader className="flex-row items-start justify-between gap-3 space-y-0 border-b border-slate-100 px-5 py-4 text-left dark:border-slate-800/60">
          <div className="min-w-0 space-y-1">
            <SheetTitle className="break-words text-base font-bold text-slate-900 dark:text-slate-100">
              {title}
            </SheetTitle>
            <SheetDescription className="sr-only">
              {entry ? `Details of one ${singular}, down to its raw event.` : "This item is not on the list."}
            </SheetDescription>
          </div>
          <SheetClose asChild>
            <Button
              variant="ghost"
              size="icon"
              className="-mr-2 -mt-1 shrink-0"
              aria-label="Close"
              data-testid="item-inspector-close"
            >
              <X />
            </Button>
          </SheetClose>
        </SheetHeader>

        {entry && item ? (
          <>
            <div className="flex-1 space-y-6 overflow-y-auto px-5 py-4">
              <section className="space-y-3">
                <SectionHeader kicker="Identity" />
                <dl className="grid grid-cols-[6rem_1fr] gap-x-3 gap-y-2 text-sm">
                  <dt className="text-slate-500 dark:text-slate-400">d tag</dt>
                  {d ? (
                    <dd className="break-all text-slate-900 dark:text-slate-100">{d}</dd>
                  ) : (
                    <dd className="text-slate-500 dark:text-slate-400">—</dd>
                  )}
                  <dt className="text-slate-500 dark:text-slate-400">Event id</dt>
                  <dd className="space-y-2">
                    <span
                      className="block break-all font-mono text-xs text-slate-900 dark:text-slate-100"
                      data-testid="item-inspector-id"
                    >
                      {item.id}
                    </span>
                    <span className="flex flex-wrap gap-2">
                      <CopyButton
                        text={item.id}
                        label="Copy id"
                        container={container}
                        testId="item-inspector-copy-id"
                      />
                      {address && (
                        <CopyButton
                          text={address}
                          label="Copy address"
                          container={container}
                          testId="item-inspector-copy-address"
                        />
                      )}
                    </span>
                  </dd>
                  <dt className="text-slate-500 dark:text-slate-400">Kind</dt>
                  <dd className="text-slate-900 dark:text-slate-100">{item.kind}</dd>
                  <dt className="text-slate-500 dark:text-slate-400">Curator</dt>
                  <dd className="space-y-2">
                    <span className="flex flex-wrap items-baseline gap-x-2 text-slate-900 dark:text-slate-100">
                      {/* A curator with no profile name is already shown by this key. */}
                      {curatorName !== shortKey && <span className="break-words">{curatorName}</span>}
                      <span className="font-mono text-xs text-slate-500 dark:text-slate-400">{shortKey}</span>
                    </span>
                    <span className="flex flex-wrap gap-2">
                      <CopyButton
                        text={key}
                        label={key === item.pubkey ? "Copy key" : "Copy npub"}
                        container={container}
                        testId="item-inspector-copy-curator"
                      />
                    </span>
                  </dd>
                  <dt className="text-slate-500 dark:text-slate-400">Updated</dt>
                  <dd className="text-slate-900 dark:text-slate-100">{updatedOf(item.created_at)}</dd>
                </dl>
                <Link
                  href={eventPath(item, dictionaryRelays())}
                  className="inline-block text-sm font-medium text-brand-link underline-offset-4 hover:underline"
                  data-testid="item-inspector-page-link"
                >
                  Open its page
                </Link>
              </section>

              <section className="space-y-3">
                <SectionHeader kicker="How it draws" />
                <ItemPreview resolved={resolved} item={item} />
              </section>

              <section className="space-y-3">
                <SectionHeader kicker="Problems" />
                <div data-testid="item-inspector-problems">
                  {entry.check.problems.length === 0 ? (
                    <p className="text-sm text-slate-500 dark:text-slate-400">None.</p>
                  ) : (
                    <ul className="space-y-2 text-sm text-slate-900 dark:text-slate-100">
                      {entry.check.problems.map((p, i) => (
                        <li key={i}>
                          {p.message}
                          {p.blocking && (
                            <Chip tone="warning" size="sm" className="ml-2">
                              blocks publishing
                            </Chip>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </section>

              <section className="space-y-3">
                <SectionHeader kicker="Fields" />
                <ul className="divide-y divide-border rounded-xl border border-border">
                  {fields.map((f) => {
                    const values = item.tags
                      .filter((t) => t[0] === f.name && t[1] != null && t[1] !== "")
                      .map((t) => t[1]);
                    return (
                      <li
                        key={f.name}
                        className="space-y-1 px-3 py-2 text-sm"
                        data-testid={`item-inspector-field-${f.name}`}
                      >
                        <div className="flex flex-wrap items-baseline gap-x-2">
                          <span className="font-medium text-slate-900 dark:text-slate-100">{f.name}</span>
                          <span className="text-xs text-slate-500 dark:text-slate-400">
                            {f.requirement}, {f.type}
                          </span>
                        </div>
                        {values.length === 0 ? (
                          <div className="text-slate-500 dark:text-slate-400">—</div>
                        ) : (
                          values.map((v, i) => (
                            <div key={i} className="break-all text-slate-900 dark:text-slate-100">
                              {v}
                            </div>
                          ))
                        )}
                      </li>
                    );
                  })}
                </ul>
                {extra.length > 0 && (
                  <div className="space-y-2" data-testid="item-inspector-undeclared">
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Not declared by the list</p>
                    <ul className="divide-y divide-border rounded-xl border border-border">
                      {extra.map((u, i) => (
                        <li key={i} className="space-y-1 px-3 py-2 text-sm">
                          <div className="font-medium text-slate-900 dark:text-slate-100">{u.name}</div>
                          <div className="break-all text-slate-900 dark:text-slate-100">{u.value}</div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </section>

              <section className="space-y-3">
                <SectionHeader kicker="Raw event" />
                <CopyButton text={raw} label="Copy raw event" container={container} testId="item-inspector-copy-raw" />
                {/* It scrolls, so the keyboard has to be able to land on it. */}
                <pre
                  tabIndex={0}
                  role="region"
                  aria-label="Raw event"
                  className="max-h-80 overflow-auto rounded-xl border border-border bg-muted p-3 font-mono text-xs text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent dark:text-slate-100"
                  data-testid="item-inspector-raw"
                >
                  {raw}
                </pre>
              </section>
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-5 py-3 dark:border-slate-800/60">
              <Button
                variant="outline"
                size="sm"
                disabled={onPrev === null}
                onClick={() => onPrev?.()}
                data-testid="item-inspector-prev"
              >
                <ChevronLeft />
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={onNext === null}
                onClick={() => onNext?.()}
                data-testid="item-inspector-next"
              >
                Next
                <ChevronRight />
              </Button>
            </div>
          </>
        ) : (
          <p className="px-5 py-4 text-sm text-slate-500 dark:text-slate-400" data-testid="item-inspector-missing">
            That item isn't on this list.
          </p>
        )}
      </SheetContent>
    </Sheet>
  );
}
