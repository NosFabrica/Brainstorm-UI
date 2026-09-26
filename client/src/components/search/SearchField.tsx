import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { getDisplayLabel, type SearchResult } from "@/lib/profileSearch";
import { fetchPillProfiles } from "@/services/searchFaces";
import { mountSearchField, type ActiveToken, type SearchFieldHandle } from "@/lib/searchFieldDom";
import { ymd } from "@/lib/searchQuery";
import {
  DOW, dayLabel, midnight, monthGrid, quickPicks, sameMonth, shiftDays, shiftMonths, typedMonth,
} from "@/lib/searchCalendar";
import { groupName, knowsGroup, where, type GroupCandidate } from "@/lib/nip29";
import { nameGroups, suggestGroups } from "@/services/groups";

const DEBOUNCE_MS = 150;
const PICKER_LIMIT = 8;

/**
 * The search box: a contenteditable that draws the grammar's tokens as pills, with the two
 * popups the Filters panel cannot express under the token being built — a month grid for
 * `since:`/`until:`, and a group picker for `group:`.
 *
 * The people picker is deliberately NOT here. `from:`/`to:` completion already runs through the
 * page's own suggestion dropdown, which knows about recent searches, topics and tags too; two
 * lists under one box would fight over the same square of screen and the same arrow keys. This
 * component says when it owns that square (`onPickerChange`) and the page stands down.
 *
 * The DOM half lives in `lib/searchFieldDom` — React cannot own the children of a
 * contenteditable without fighting the browser over the caret, the IME and undo.
 */
export function SearchField({
  value,
  onChange,
  onEnter,
  onKeyDown,
  onPickerChange,
  onRemoveToken,
  onFocus,
  onBlur,
  onPointerDown,
  placeholder,
  ariaLabel,
  className,
  inputClassName,
  autoFocus,
  testId = "search-field",
  fieldRef,
  combobox,
}: {
  value: string;
  onChange: (next: string) => void;
  /**
   * Enter, with no popup of ours open. Carries the box's value, because a soft keyboard's
   * action key edits and submits in one event and React has not re-rendered in between.
   */
  onEnter: (value: string) => void;
  /** Keys no popup of ours took. Return true to consume. */
  onKeyDown?: (e: KeyboardEvent) => boolean;
  /** True while one of our popups owns the space under the box (and the arrow keys). */
  onPickerChange?: (open: boolean) => void;
  /** A pill's × dropped a token; the value the box is left with. */
  onRemoveToken?: (next: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  onPointerDown?: () => void;
  /** Drawn over an EMPTY field. A node, so a caller can fade it between examples. */
  placeholder?: ReactNode;
  ariaLabel?: string;
  className?: string;
  inputClassName?: string;
  autoFocus?: boolean;
  testId?: string;
  /** The field's imperative handle, for a caller that needs to focus or select it. */
  fieldRef?: (handle: SearchFieldHandle | null) => void;
  /** The page's own dropdown, so the box carries one coherent set of combobox attributes. */
  combobox?: { expanded: boolean; controls: string; activeDescendant?: string };
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<SearchFieldHandle | null>(null);
  const [token, setToken] = useState<ActiveToken | null>(null);

  // Which people the pills are drawing — `from:`, `to:` and `observer:` alike. The field asks
  // this map for a face and re-labels in place when one arrives, so a pill never waits on the
  // network to exist. Keys are asked once: a person nobody has a kind-0 for must not become a
  // request per render.
  const [profiles, setProfiles] = useState<Map<string, SearchResult>>(new Map());
  const askedFor = useRef<Set<string>>(new Set());
  const wantFace = useCallback((pubkeys: string[]) => {
    const fresh = pubkeys.filter((pk) => !askedFor.current.has(pk));
    if (!fresh.length) return;
    for (const pk of fresh) askedFor.current.add(pk);
    void fetchPillProfiles(fresh).then((found) => {
      if (!found.size) return;
      setProfiles((was) => new Map([...was, ...found]));
    });
  }, []);

  // ---- the group picker ----------------------------------------------------
  const [groupRows, setGroupRows] = useState<GroupCandidate[] | null>(null);
  const [groupActive, setGroupActive] = useState(-1);
  const groupReq = useRef(0);
  const groupTimer = useRef<number>();
  // Group names arrive into a module cache the pills read; this counter is what tells React a
  // repaint is due.
  const [namedAt, setNamedAt] = useState(0);
  const asking = useRef<Set<string>>(new Set());

  // ---- the calendar --------------------------------------------------------
  const [month, setMonth] = useState<Date | null>(null);
  const [cursor, setCursor] = useState<Date | null>(null);

  const today = useMemo(() => midnight(new Date()), []);
  const pickerOpen = token !== null;

  useEffect(() => { onPickerChange?.(pickerOpen); }, [pickerOpen, onPickerChange]);

  // --- the handlers the DOM half calls. Held in a ref so the field is mounted once: a
  //     remount would drop the caret and the undo stack on every keystroke.
  const latest = useRef({ onChange, onEnter, onKeyDown, onRemoveToken, profiles, wantFace });
  latest.current = { onChange, onEnter, onKeyDown, onRemoveToken, profiles, wantFace };

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const handle = mountSearchField(el, {
      onEdit: (next) => latest.current.onChange(next),
      onEnter: (value) => {
        // A day the keyboard is on is what Enter means while the grid is up.
        if (takeEnterRef.current()) return;
        handle.settle();
        latest.current.onEnter(value);
      },
      onRemoveToken: (next) => latest.current.onRemoveToken?.(next),
      onToken: setToken,
      personFace: (pk) => {
        const p = latest.current.profiles.get(pk);
        return p ? { name: getDisplayLabel(p), picture: p.picture ?? null } : null;
      },
      needPeople: (pks) => latest.current.wantFace(pks),
      groupFace: groupName,
      needGroups: (ids) => {
        const fresh = ids.filter((id) => !knowsGroup(id) && !asking.current.has(id));
        if (!fresh.length) return;
        for (const id of fresh) asking.current.add(id);
        void nameGroups(fresh).then((changed) => { if (changed) setNamedAt(Date.now()); });
      },
      onKeyDown: (e) => keysRef.current(e),
    });
    handleRef.current = handle;
    handle.setValue(value);
    fieldRef?.(handle);
    if (autoFocus) handle.focus();
    return () => {
      handle.destroy();
      handleRef.current = null;
      fieldRef?.(null);
    };
    // Mounted once, on purpose — see the comment above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A controlled value: push it down only when it differs from what the field already holds,
  // or every keystroke would re-render the nodes under the caret.
  useEffect(() => {
    const handle = handleRef.current;
    if (handle && handle.getValue() !== value) handle.setValue(value);
  }, [value]);

  // Profiles and group names land after a render; the pills re-label in place.
  useEffect(() => { handleRef.current?.repaint(); }, [profiles, namedAt]);


  // --- the group lookup, debounced, with the last rows left up while the next answer runs.
  useEffect(() => {
    if (token?.kind !== "group") {
      setGroupRows(null);
      setGroupActive(-1);
      return;
    }
    const id = ++groupReq.current;
    const partial = token.partial;
    if (!partial) {
      // `group:` alone is not a match-all over every room on the network.
      setGroupRows([]);
      setGroupActive(-1);
      return;
    }
    setGroupRows(null);
    window.clearTimeout(groupTimer.current);
    groupTimer.current = window.setTimeout(() => {
      void suggestGroups(partial).then((rows) => {
        if (groupReq.current !== id) return;
        setGroupRows(rows.slice(0, PICKER_LIMIT));
        setGroupActive(rows.length ? 0 : -1);
        setNamedAt(Date.now());
      });
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(groupTimer.current);
  }, [token]);

  // --- the calendar's month follows the token: what was typed wins, then the month the reader
  //     had stepped to, then this month.
  const dateToken = token?.kind === "date" ? token : null;
  const dateKey = dateToken ? `${dateToken.field}:${dateToken.start}` : null;
  const lastDateKey = useRef<string | null>(null);
  useEffect(() => {
    if (!dateToken) { lastDateKey.current = null; setCursor(null); return; }
    const typed = typedMonth(dateToken.partial);
    const fresh = lastDateKey.current !== dateKey;
    lastDateKey.current = dateKey;
    setMonth((was) => typed ?? (fresh ? shiftMonths(today, 0) : was ?? shiftMonths(today, 0)));
    if (typed && !sameMonth(cursor, typed)) setCursor(null);
    // `cursor` is read, not watched: a keyboard step sets both and must not re-enter here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateKey, dateToken?.partial, today]);

  const pick = useCallback((tok: string) => {
    const handle = handleRef.current;
    if (!handle || !token) return;
    handle.replaceToken(token, tok);
    setToken(null);
  }, [token]);

  const pickDay = useCallback((day: string) => {
    if (token?.kind !== "date" || !day) return;
    pick(`${token.field}:${day}`);
  }, [token, pick]);

  const pickGroup = useCallback((cand: GroupCandidate) => {
    if (token?.kind !== "group" || !cand) return;
    pick(`group:${cand.id}`);
  }, [token, pick]);

  // --- Enter, while a popup is up. A ref, because the DOM half is mounted once.
  const takeEnterRef = useRef<() => boolean>(() => false);
  takeEnterRef.current = () => {
    if (dateToken && cursor) { pickDay(ymd(cursor)); return true; }
    if (token?.kind === "group" && groupRows && groupRows[groupActive]) {
      pickGroup(groupRows[groupActive]);
      return true;
    }
    return false;
  };

  const moveDay = useCallback((by: number) => {
    setCursor((was) => {
      const shown = month ?? today;
      const next = was ? shiftDays(was, by) : sameMonth(today, shown) ? today : new Date(shown.getFullYear(), shown.getMonth(), 1);
      setMonth(shiftMonths(next, 0));
      return next;
    });
  }, [month, today]);

  // --- the keys a popup owns while it is open. Everything else goes to the page.
  const keysRef = useRef<(e: KeyboardEvent) => boolean>(() => false);
  keysRef.current = (e: KeyboardEvent) => {
    if (!token) return onKeyDown?.(e) ?? false;
    if (e.key === "Escape") { e.preventDefault(); setToken(null); return true; }
    if (dateToken) {
      const by = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
      if (by) { e.preventDefault(); moveDay(by); return true; }
      if (e.key === "PageUp" || e.key === "PageDown") {
        e.preventDefault();
        setMonth((was) => shiftMonths(was ?? today, e.key === "PageUp" ? -1 : 1));
        return true;
      }
      // Enter on nothing highlighted stays the page's Enter (handled in onEnter).
      return false;
    }
    const rows = groupRows ?? [];
    if (e.key === "ArrowDown" && rows.length) {
      e.preventDefault();
      setGroupActive((i) => (i + 1) % rows.length);
      return true;
    }
    if (e.key === "ArrowUp" && rows.length) {
      e.preventDefault();
      setGroupActive((i) => (i - 1 + rows.length) % rows.length);
      return true;
    }
    if (e.key === "Tab" && rows[groupActive]) { e.preventDefault(); pickGroup(rows[groupActive]); return true; }
    return false;
  };

  const grid = useMemo(
    () => (dateToken ? monthGrid(month ?? shiftMonths(today, 0), today) : null),
    [dateToken, month, today],
  );

  const HEAD = { since: "Written on or after", until: "Written on or before" } as const;

  return (
    // `text-left` is not decoration: the pristine hero centers its column, and where an
    // <input> ignored that (the UA stylesheet pins it to `start`), a contenteditable inherits
    // it — so swapping the element quietly centered the query.
    <div className={cn("relative min-w-0 text-left", className)}>
      <div
        ref={boxRef}
        role="combobox"
        contentEditable
        suppressContentEditableWarning
        spellCheck={false}
        // A contenteditable gets a soft keyboard's "return" key unless told otherwise; the
        // <input type="search"> it replaced showed "Search".
        enterKeyHint="search"
        aria-label={ariaLabel}
        aria-expanded={pickerOpen || combobox?.expanded || false}
        aria-controls={pickerOpen ? `${testId}-picker` : combobox?.controls}
        aria-haspopup={pickerOpen ? (dateToken ? "dialog" : "listbox") : "listbox"}
        aria-autocomplete="list"
        onFocus={onFocus}
        onBlur={onBlur}
        onPointerDown={onPointerDown}
        aria-activedescendant={
          pickerOpen
            ? dateToken
              ? cursor ? `${testId}-day-${ymd(cursor)}` : undefined
              : groupActive >= 0 ? `${testId}-group-${groupActive}` : undefined
            : combobox?.activeDescendant
        }
        className={cn(
          // `leading-[1.55]` is the height this bar has always been, and the pill is built to
          // fit INSIDE it (22px in a 24.8px line box) so the bar never grows by a pixel when a
          // token forms. The line box is what separates wrapped rows, too — a pill with a
          // margin would stretch the line and take the bar with it.
          //
          // `whitespace-pre-wrap` is load-bearing, not cosmetic: under the default collapsing
          // the browser drops the trailing space this field renders after a pill, and the
          // next word lands glued to it (`#nostrlabel:`). `break-words` so a pasted npub
          // wraps instead of widening the box past the page.
          "w-full min-w-0 whitespace-pre-wrap break-words bg-transparent py-1.5 text-base leading-[1.55] text-slate-900 outline-none dark:text-slate-100",
          // Pills sit 1px off the text before them and 6px clear of what follows: the caret, and
          // the words typed after a pill, start clear of its border instead of on it. Sideways
          // margin never touches the line box.
          "[&>span]:ml-[1px] [&>span]:mr-1.5",
          inputClassName,
        )}
        data-testid={testId}
      />
      {placeholder && !value.trim() && (
        <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 right-0 flex items-center overflow-hidden" data-testid={`${testId}-placeholder`}>
          {placeholder}
        </span>
      )}

      {pickerOpen && (
        <div
          id={`${testId}-picker`}
          role={dateToken ? "dialog" : "listbox"}
          aria-label={dateToken ? HEAD[dateToken.field] : "Groups"}
          className="absolute left-0 top-full z-50 mt-2 min-w-[18rem] max-w-[22rem] overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-[0_8px_30px_rgba(0,0,0,0.12)] dark:border-slate-800 dark:bg-slate-900"
          // The caret in the field is what a pick splices into, so the field must not lose it.
          onMouseDown={(e) => e.preventDefault()}
          data-testid={`${testId}-picker`}
        >
          <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:border-slate-800/60 dark:text-slate-400">
            <span>{dateToken ? HEAD[dateToken.field] : "Posted in"}</span>
            <span className="font-mono normal-case tracking-normal text-slate-400 dark:text-slate-500">
              {dateToken ? `${dateToken.field}:` : "group:"}
            </span>
          </div>

          {dateToken && grid && (
            <div className="p-2">
              <div className="mb-1 flex items-center justify-between">
                <button
                  type="button" tabIndex={-1} aria-label="Previous month"
                  onClick={() => setMonth((was) => shiftMonths(was ?? today, -1))}
                  className="h-7 w-7 rounded-lg text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                >‹</button>
                <div className="text-sm font-medium text-slate-700 dark:text-slate-200">{grid.label}</div>
                <button
                  type="button" tabIndex={-1} aria-label="Next month"
                  onClick={() => setMonth((was) => shiftMonths(was ?? today, 1))}
                  className="h-7 w-7 rounded-lg text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                >›</button>
              </div>
              <div role="listbox" aria-label="Days" className="grid grid-cols-7 gap-0.5">
                {DOW.map((w) => (
                  <span key={w.long} title={w.long} aria-hidden="true" className="py-1 text-center text-[10px] font-medium text-slate-400 dark:text-slate-500">
                    {w.narrow}
                  </span>
                ))}
                {Array.from({ length: grid.lead }, (_, i) => <span key={`pad-${i}`} aria-hidden="true" />)}
                {grid.days.map((d) => {
                  const on = !!cursor && ymd(cursor) === d.value;
                  return (
                    <button
                      key={d.value}
                      id={`${testId}-day-${d.value}`}
                      type="button" tabIndex={-1} role="option" aria-selected={on}
                      aria-label={dayLabel(d.at)}
                      onClick={() => pickDay(d.value)}
                      className={cn(
                        "h-7 rounded-lg text-xs tabular-nums transition-colors",
                        on ? "bg-brand-primary text-white" : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800",
                        d.today && !on && "font-bold text-brand-primary dark:text-brand-link",
                        d.ahead && !on && "text-slate-300 dark:text-slate-600",
                      )}
                      data-testid={`${testId}-day`}
                    >
                      {d.at.getDate()}
                    </button>
                  );
                })}
              </div>
              <div className="mt-2 flex flex-wrap gap-1 border-t border-slate-100 pt-2 dark:border-slate-800/60">
                {quickPicks(dateToken.field, today).map((p) => (
                  <button
                    key={p.label}
                    type="button" tabIndex={-1}
                    onClick={() => pickDay(p.value)}
                    className="rounded-full border border-slate-200 px-2 py-0.5 text-[11px] text-slate-600 hover:border-brand-primary/40 hover:text-brand-link dark:border-slate-700 dark:text-slate-300"
                    data-testid={`${testId}-quick`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {token?.kind === "group" && (
            <div className="max-h-72 overflow-y-auto">
              {groupRows === null ? (
                <p className="px-3 py-3 text-xs text-slate-400 dark:text-slate-500">Finding groups…</p>
              ) : !token.partial ? (
                <p className="px-3 py-3 text-xs text-slate-400 dark:text-slate-500">
                  Type a few letters of a group's name, or paste its id — group ids are not memorable.
                </p>
              ) : !groupRows.length ? (
                <p className="px-3 py-3 text-xs text-slate-400 dark:text-slate-500">
                  No group matches “{token.partial.slice(0, 40)}”
                </p>
              ) : (
                groupRows.map((cand, i) => (
                  <button
                    key={`${cand.id}\u0000${cand.host ?? ""}`}
                    id={`${testId}-group-${i}`}
                    type="button" role="option" aria-selected={i === groupActive}
                    onMouseEnter={() => setGroupActive(i)}
                    onClick={() => pickGroup(cand)}
                    className={cn(
                      "flex w-full items-start gap-2 px-3 py-2 text-left transition-colors",
                      i === groupActive ? "bg-slate-50 dark:bg-slate-800" : "hover:bg-slate-50 dark:hover:bg-slate-800",
                    )}
                    data-testid={`${testId}-group`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {cand.name.trim() || cand.id}
                      </span>
                      <span className="block truncate text-xs text-slate-500 dark:text-slate-400">
                        {cand.about.trim() ? `${cand.about.trim().slice(0, 90)} · ` : ""}
                        {where(cand)}
                      </span>
                    </span>
                    {cand.ambiguous && (
                      <span
                        title={`More than one group here carries the id “${cand.id}”, and a search filters on the id alone — so the results include all of them.`}
                        className="shrink-0 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-500/10 dark:text-amber-300"
                      >
                        shared id
                      </span>
                    )}
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
