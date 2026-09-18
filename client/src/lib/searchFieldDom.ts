/**
 * The search box's DOM half: a contenteditable that draws the tokens it holds as pills, while
 * its VALUE stays the plain text somebody typed. Every rendering is a view of that string —
 * nothing is stored in the DOM that the text does not already say.
 *
 * Ported from the relay's own operator field (`web/searchfield.js`). The caret arithmetic is
 * the part worth transcribing rather than reinventing: every offset here indexes the value
 * string, never the DOM, and a pill is worth its whole token.
 *
 * No React in here on purpose. React cannot own the children of a contenteditable without
 * fighting the browser over the caret, the IME and the undo stack, so this module owns the
 * nodes and the component owns everything around them — the popups, the chrome, the state.
 */
import { drawable, groupAt, dateAt, scopeIds, SCOPE_NOUNS, type Segment } from "@/lib/searchQuery";
import { dayLabel } from "@/lib/searchCalendar";
import { tone } from "@/lib/tones";
import { DEFAULT_AVATAR_SRC } from "@/lib/profileDefaults";
import { nip19 } from "nostr-tools";

const NEWLINE = /[\r\n]/;
const NEWLINES = /[\r\n]+/g;

/** The token the caret is inside that has a popup under it. */
export type ActiveToken =
  | { kind: "date"; field: "since" | "until"; partial: string; start: number; end: number }
  | { kind: "group"; partial: string; start: number; end: number };

export interface PersonFace {
  name: string;
  picture: string | null;
}

export interface SearchFieldHandlers {
  /** The value changed because somebody typed, pasted, dropped or picked. */
  onEdit: (value: string) => void;
  /** Enter, however it arrived — including a soft keyboard's action key. */
  onEnter: () => void;
  /**
   * A pill's × took a token out. Separate from [onEdit] because dropping a filter is a
   * decision, not a keystroke: the page re-runs the search on it rather than waiting for Enter.
   */
  onRemoveToken?: (next: string) => void;
  /** Which token the caret is building, so the host can put a popup under it. */
  onToken: (token: ActiveToken | null) => void;
  /** What a person pill draws. */
  personFace: (pubkey: string) => PersonFace | null;
  /** Keys a pill is drawing but cannot name yet; the host fetches and calls [repaint]. */
  needPeople: (pubkeys: string[]) => void;
  /** What a group pill draws over the id, or "" while nothing can be said. */
  groupFace: (id: string) => string;
  needGroups: (ids: string[]) => void;
  /** Keys the popups did not take. Return true to consume. */
  onKeyDown?: (e: KeyboardEvent) => boolean;
}

export interface SearchFieldHandle {
  getValue: () => string;
  /** The muted words drawn after the last pill, or "" for none. */
  setHint: (text: string, testId?: string) => void;
  /** A programmatic set is a restore, never a keystroke: it fires no onEdit. */
  setValue: (v: string) => void;
  /** Re-label the pills, for when profiles or group names land after a render. */
  repaint: () => void;
  /** Splice a finished token over the partial the caret is in. */
  replaceToken: (ctx: { start: number; end: number }, token: string) => void;
  focus: () => void;
  select: () => void;
  caret: () => number;
  destroy: () => void;
}

const esc = (s: string): string =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

const clip = (s: string, n: number): string =>
  s.length > n ? `${s.slice(0, Math.max(0, n - 1))}…` : s;

const shortKey = (hex: string): string => {
  try {
    const np = nip19.npubEncode(hex);
    return `${np.slice(0, 10)}…${np.slice(-4)}`;
  } catch {
    return `${hex.slice(0, 8)}…`;
  }
};
const shortId = (hex: string): string => `${hex.slice(0, 8)}…${hex.slice(-4)}`;
const shortAddr = (coord: string): string => {
  const parts = coord.split(":");
  return parts.length === 3 && parts[2] ? parts[2] : shortId(parts[1] ?? coord);
};

/**
 * One pill's classes, from this app's own parts rather than invented here.
 *
 *  - the SHAPE is `<Chip>` (`components/ui/chip.tsx`): a rounded-full, tinted, bordered pill
 *    whose light and dark treatment comes from `lib/tones`, never from a hand-written
 *    `bg-x-50 dark:bg-x-500/10` pair.
 *  - the SIZE is `ScopeChip`'s, the pill this box used to carry for `from:` — `text-sm` on a
 *    20px line with `py-0.5` and `gap-1.5`. That was already this app's answer to "how big is
 *    a pill sitting inside the search field", and the pills that joined it should not each
 *    invent their own.
 *
 * The right padding is cut because every pill carries an ×, whose own 20px box fills it —
 * the mirror of the person pill cutting its LEFT padding for a face.
 */
const PILL =
  "inline-flex max-w-full select-none items-center gap-1.5 whitespace-nowrap rounded-full border" +
  " my-[3px] py-0.5 pl-2 pr-1 align-middle text-sm font-medium leading-5";

/**
 * A pill is 26px tall in a 24.8px line, so a query that wraps puts its rows flush against each
 * other — the line box grows to exactly the pill and no further. The 3px of vertical margin is
 * what separates them: an inline-flex box contributes its MARGIN box to the line's height, so
 * rows of pills sit 6px apart while a row of plain words keeps the field's own line-height.
 */
const pillClass = (t: Parameters<typeof tone>[0]): string => {
  const c = tone(t);
  // The neutral tone fills with slate-100 and outlines with slate-200 — a step apart, which
  // reads as no outline at all while every other tone's pale -50 tint shows its border plainly.
  // One step further out, so a person pill is outlined like the rest of them.
  const border = t === "slate" ? "border-slate-300 dark:border-slate-600" : c.border;
  return `${PILL} ${c.bg} ${c.text} ${border}`;
};
/** A person, as ScopeChip had it: a round face fills a rounded corner by itself. */
const FACE_PILL = "!pl-0.5";
/**
 * The face fills the pill's inner height exactly (20px inside 2px of padding and a 1px border),
 * so a person pill stands the same 26px tall as every other one. ScopeChip's face was larger
 * because it stood alone beside the text; these sit in a row with the rest of the grammar, and
 * one of them being taller is what reads as "off".
 */
const FACE_SIZE = "h-5 w-5 shrink-0 rounded-full object-cover";
/** The prefix inside a pill — `since`, `group:`, `site:` — a shade quieter than its value. */
const KEY_CLASS = "opacity-70";
const VALUE_CLASS = "max-w-[14rem] truncate";

/** lucide's X, inlined: this module builds HTML rather than JSX, and the app's icons are lucide. */
const X_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor"' +
  ' stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-3 w-3" aria-hidden="true">' +
  '<path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';

/**
 * Every pill carries its own ×, in ScopeChip's button. Backspace deletes one too — a pill is
 * contenteditable=false, so the browser takes the whole token in one press — but a filter
 * somebody did not mean to add needs a way out that does not involve first finding the caret.
 */
const removeHtml = (what: string, testId: string) =>
  `<button type="button" tabindex="-1" data-remove="1" data-testid="${testId}"` +
  ` aria-label="Remove ${esc(what)}"` +
  ' class="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-slate-400' +
  ' transition-colors hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-slate-700' +
  ` dark:hover:text-slate-200">${X_ICON}</button>`;

export function mountSearchField(el: HTMLElement, handlers: SearchFieldHandlers): SearchFieldHandle {
  let token: ActiveToken | null = null;

  // ---- the value, and where the caret is inside it ------------------------
  //
  // Every offset here is an index into the value string, never the DOM; a pill is worth
  // its whole token.

  const isChip = (n: Node | null): n is HTMLElement =>
    !!n && n.nodeType === 1 && (n as HTMLElement).dataset?.token != null;
  /**
   * The trailing hint — "Search Alice's notes" where the pills leave off. It lives inside the
   * field rather than over it, because an overlay would land on top of the pills; it is worth
   * nothing to the value, so every offset below steps straight past it.
   */
  const isHint = (n: Node | null): n is HTMLElement =>
    !!n && n.nodeType === 1 && (n as HTMLElement).dataset?.hint != null;
  const lenOf = (n: Node): number =>
    n.nodeType === 3
      ? (n as Text).data.length
      : isHint(n)
        ? 0
        : isChip(n)
          ? (n.dataset.token as string).length
          : (n.textContent || "").length;

  function readValue(): string {
    let out = "";
    for (const n of Array.from(el.childNodes)) {
      if (isHint(n)) continue;
      out += n.nodeType === 3 ? (n as Text).data : isChip(n) ? n.dataset.token : n.textContent || "";
    }
    // A contenteditable inserts NBSP to keep trailing spaces, which the grammar cannot tokenize.
    return out.replace(/\u00a0/g, " ");
  }

  function indexOf(node: Node, offset: number): number {
    if (node === el) {
      let i = 0;
      for (let k = 0; k < offset && k < el.childNodes.length; k++) i += lenOf(el.childNodes[k]);
      return i;
    }
    let i = 0;
    for (const n of Array.from(el.childNodes)) {
      if (n === node) return i + (n.nodeType === 3 ? offset : lenOf(n));
      if (n.nodeType === 1 && n.contains(node)) return i + lenOf(n);
      i += lenOf(n);
    }
    return i;
  }

  function selectionRange(): [number, number] {
    const sel = document.getSelection();
    const r = sel && sel.rangeCount ? sel.getRangeAt(0) : null;
    const inside = (n: Node) => n === el || el.contains(n);
    if (!r || !inside(r.startContainer) || !inside(r.endContainer)) {
      const n = readValue().length;
      return [n, n];
    }
    return [indexOf(r.startContainer, r.startOffset), indexOf(r.endContainer, r.endOffset)];
  }

  /** Where a drop landed, in value offsets; a drop does not move the selection first. */
  function dropIndex(e: DragEvent): number | null {
    type Legacy = Document & {
      caretRangeFromPoint?: (x: number, y: number) => Range | null;
      caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    };
    const doc = document as Legacy;
    const r = doc.caretRangeFromPoint
      ? doc.caretRangeFromPoint(e.clientX, e.clientY)
      : doc.caretPositionFromPoint
        ? doc.caretPositionFromPoint(e.clientX, e.clientY)
        : null;
    if (!r) return null;
    const node = (r as Range).startContainer ?? (r as { offsetNode: Node }).offsetNode;
    const offset = (r as Range).startOffset ?? (r as { offset: number }).offset;
    if (!node || !(node === el || el.contains(node))) return null;
    return indexOf(node, offset);
  }

  const caretIndex = () => selectionRange()[1];

  function setCaret(index: number): void {
    const r = document.createRange();
    let i = 0;
    let placed = false;
    for (const n of Array.from(el.childNodes)) {
      const len = lenOf(n);
      if (index <= i + len) {
        // Never inside a pill: it is contenteditable=false.
        if (n.nodeType === 3) r.setStart(n, Math.max(0, index - i));
        else if (index <= i) r.setStartBefore(n);
        else r.setStartAfter(n);
        placed = true;
        break;
      }
      i += len;
    }
    if (!placed) {
      r.selectNodeContents(el);
      r.collapse(false);
    } else r.collapse(true);
    const sel = document.getSelection();
    if (!sel) return;
    sel.removeAllRanges();
    sel.addRange(r);
  }

  // ---- rendering the value ------------------------------------------------

  /**
   * What a person pill currently draws; unchanged means no repaint. The separator is written as
   * the escape `\u0000`, never the byte, and is not a space: ("Alice B", "") and ("Alice", "B")
   * are two different faces.
   */
  const faceOf = (pk: string): string => {
    const p = handlers.personFace(pk);
    return `${p?.name || ""}\u0000${p?.picture || ""}`;
  };

  /** The avatar a person-shaped pill leads with: their picture, or a quiet disc until it lands. */
  const avatarHtml = (picture: string | null | undefined): string =>
    picture
      ? `<img src="${esc(picture)}" alt="" class="${FACE_SIZE}" />`
      : `<img src="${esc(DEFAULT_AVATAR_SRC)}" alt="" class="${FACE_SIZE}" />`;

  function paintPersonChip(span: HTMLElement): void {
    const pk = span.dataset.pk as string;
    const field = span.dataset.field;
    const p = handlers.personFace(pk);
    const name = p?.name || "";
    const avatar = avatarHtml(p?.picture);
    // Until the profile answers, a quiet placeholder — never the key. A pill that printed
    // `npub1eee…` while it waited would be the raw scope this box exists not to show.
    const label = name
      ? `<span class="${VALUE_CLASS}">${esc(clip(name, 32))}</span>`
      : `<span class="inline-block h-3 w-16 animate-pulse rounded bg-slate-200 dark:bg-slate-700" aria-label="Loading who this is"></span>`;
    span.dataset.testid = "search-scope-chip";
    span.innerHTML =
      (field ? `<span class="${KEY_CLASS}">${esc(field)}:</span>` : "") +
      avatar +
      label +
      removeHtml(name || "this person", "search-scope-remove");
    span.dataset.face = faceOf(pk);
    const who = name || shortKey(pk);
    span.title = field === "from"
      ? `${span.dataset.token} — only what ${who} wrote`
      : field === "to"
        ? `${span.dataset.token} — only events that mention ${who}`
        : (span.dataset.token as string);
  }

  /**
   * The `observer:` pill: whose eyes the page is read through, as a person.
   *
   * Unlike a `from:` pill this one falls back to the short npub rather than a skeleton. A scope
   * is somebody picked from a list, so a name is coming; an observer is a key somebody typed,
   * and it may belong to an account with no kind-0 anywhere — a pill that waited forever would
   * say less than the key does.
   */
  function paintObserverChip(span: HTMLElement): void {
    const pk = span.dataset.pk as string;
    const p = handlers.personFace(pk);
    const name = p?.name || "";
    span.innerHTML =
      `<span class="${KEY_CLASS}">ranked as</span>` +
      avatarHtml(p?.picture) +
      `<span class="${VALUE_CLASS}">${esc(name ? clip(name, 32) : shortKey(pk))}</span>` +
      removeHtml(`the ${name || "observer"} ranking`, "search-pill-remove");
    span.dataset.face = faceOf(pk);
    span.title =
      `${span.dataset.token} — rank these results through ${name ? `${name}'s` : "that pubkey's"} ` +
      "web of trust rather than your own";
  }

  /**
   * A group pill, repainted when a name arrives. `dataset.face` holds what the cache said, not
   * the clipped drawing; the hover carries the id whether or not a name replaced it.
   */
  function paintGroupChip(span: HTMLElement): void {
    const id = span.dataset.gid as string;
    const known = handlers.groupFace(id);
    // Clipped, where the id is not: a name is a stranger's string.
    const name = clip(known, 48);
    span.innerHTML =
      `<span class="${KEY_CLASS}">group:</span><span class="${VALUE_CLASS}">${esc(name || id)}</span>` +
      removeHtml(`the ${name || id} group filter`, "search-pill-remove");
    span.dataset.face = known;
    span.title =
      `${span.dataset.token} — a NIP-29 group filter: events posted to ` +
      (name ? `“${name}”, the group whose id is ${id}` : `the group whose id is ${id}`);
  }

  function chipEl(seg: Exclude<Segment, { type: "text" }>): HTMLElement {
    const span = document.createElement("span");
    span.contentEditable = "false";
    span.dataset.token = seg.raw;
    span.dataset.type = seg.type;
    // The two pills painted elsewhere ([paintPersonChip], [paintGroupChip]) set their own.
    const x = removeHtml(seg.raw, "search-pill-remove");
    switch (seg.type) {
      case "tag":
        span.className = pillClass("accent");
        span.innerHTML = `<span>${esc(seg.raw)}</span>` + x;
        // The hover says what is asked when that differs from what was typed.
        span.title =
          seg.raw.slice(1) === seg.tag
            ? "tag filter — this word is a #t/#l/#i filter, not a search term"
            : `tag filter for “${seg.tag}”`;
        return span;
      case "scope": {
        // The value draws as typed; the hover carries the canonical spelling that is asked.
        span.className = pillClass("indigo");
        span.innerHTML =
          `<span class="${KEY_CLASS}">${esc(seg.field)}:</span>` +
          `<span class="${VALUE_CLASS}">${esc(seg.value)}</span>` + x;
        const asks = scopeIds(seg.field, seg.value);
        const noun = SCOPE_NOUNS[seg.field] ?? "thing";
        span.title = `${seg.raw} — a NIP-73 scope filter: comments written on that ${noun} (${asks[0] || seg.value})`;
        return span;
      }
      case "pointer": {
        // A `to:` that names an event, not a person.
        span.className = pillClass("slate");
        const shown = seg.tag === "a" ? shortAddr(seg.value) : shortId(seg.value);
        span.innerHTML =
          `<span class="${KEY_CLASS}">to:</span><span class="${VALUE_CLASS}">${esc(clip(shown, 48))}</span>` + x;
        span.title = `${seg.raw} — a NIP-01 #${seg.tag} filter: events that cite ${seg.value}`;
        return span;
      }
      case "label":
        span.className = pillClass("teal");
        span.innerHTML =
          `<span class="${KEY_CLASS}">label:</span>` +
          `<span class="${VALUE_CLASS}">${esc(clip(seg.value, 48))}</span>` + x;
        span.title =
          `${seg.raw} — a NIP-32 label filter: the kind 1985 labels carrying this mark, ` +
          "not the events they name";
        return span;
      case "group":
        // A name drawn over an id nobody can recognise. A view of the token only: the value
        // still reads `group:<id>`, and the name is re-derived from the id on every render.
        span.className = pillClass("violet");
        span.dataset.gid = seg.id;
        paintGroupChip(span);
        return span;
      case "date": {
        // The pill only respells the ISO day the reader's way.
        span.className = pillClass("sky");
        const shown = dayLabel(new Date(seg.at * 1000));
        span.innerHTML =
          `<span class="${KEY_CLASS}">${esc(seg.field)}</span><span class="${VALUE_CLASS}">${esc(shown)}</span>` + x;
        // The hover carries which second of the day the bound lands on.
        span.title =
          `${seg.raw} — a NIP-01 ${seg.field} filter: ` +
          (seg.field === "since" ? "written from 00:00" : "written up to 23:59") +
          ` on ${shown}, your time`;
        return span;
      }
      case "sort":
        span.className = pillClass("slate");
        span.innerHTML =
          `<span class="${KEY_CLASS}">sort:</span><span class="${VALUE_CLASS}">${esc(seg.value)}</span>` + x;
        span.title = `${seg.raw} — a NIP-50 sort: extension, applied by the relay`;
        return span;
      case "observer":
        // A person, like `from:` and `to:` — the difference is only what is being asked about
        // them. Painted by [paintObserverChip] so it re-labels in place when the profile lands.
        span.className = `${pillClass("slate")} ${FACE_PILL}`;
        span.dataset.pk = seg.pubkey;
        paintObserverChip(span);
        return span;
      case "lens":
        span.className = pillClass("amber");
        span.innerHTML = `<span>include spam</span>` + x;
        span.title = `${seg.raw} — lift the trust floor: also show what your web of trust does not rank`;
        return span;
      case "floor":
        span.className = pillClass("amber");
        span.innerHTML =
          `<span class="${KEY_CLASS}">rank ≥</span><span class="${VALUE_CLASS}">${seg.value}</span>` + x;
        span.title = `${seg.raw} — drop results whose author ranks below ${seg.value} of 100`;
        return span;
      case "verified":
        span.className = pillClass("emerald");
        span.innerHTML = `<span>verified only</span>` + x;
        span.title = `${seg.raw} — shown by this page, not asked of the relay`;
        return span;
      case "reach":
        span.className = pillClass("emerald");
        span.innerHTML =
          `<span class="${KEY_CLASS}">within</span>` +
          `<span class="${VALUE_CLASS}">${seg.value === "follows" ? "people you follow" : "friends of friends"}</span>` + x;
        span.title = `${seg.raw} — shown by this page, not asked of the relay`;
        return span;
      default: {
        span.className = `${pillClass("slate")} ${FACE_PILL}`;
        span.dataset.pk = seg.pubkey;
        if (seg.field) span.dataset.field = seg.field;
        paintPersonChip(span);
        return span;
      }
    }
  }

  /** Re-label in place the pills whose name or face changed; no node is replaced, so the caret holds. */
  function repaint(): void {
    for (const c of Array.from(el.querySelectorAll<HTMLElement>('[data-type="key"]'))) {
      if (c.dataset.face !== faceOf(c.dataset.pk as string)) paintPersonChip(c);
    }
    for (const c of Array.from(el.querySelectorAll<HTMLElement>('[data-type="observer"]'))) {
      if (c.dataset.face !== faceOf(c.dataset.pk as string)) paintObserverChip(c);
    }
    for (const c of Array.from(el.querySelectorAll<HTMLElement>('[data-type="group"]'))) {
      if (c.dataset.face !== handlers.groupFace(c.dataset.gid as string)) paintGroupChip(c);
    }
  }

  /** The hint text currently asked for; re-applied after every rebuild of the nodes. */
  let hint = "";
  let hintTestId = "search-field-hint";

  function drawHint(): void {
    const had = el.querySelector<HTMLElement>("[data-hint]");
    if (!hint) { had?.remove(); return; }
    const span = had ?? document.createElement("span");
    span.dataset.hint = "1";
    span.dataset.testid = hintTestId;
    span.contentEditable = "false";
    span.className = "pointer-events-none select-none text-slate-400 dark:text-slate-500";
    span.textContent = hint;
    if (!had) el.appendChild(span);
  }

  function render(text: string, caret: number | null, typingAt: number | null = caret): void {
    const segs = drawable(text, typingAt);
    el.innerHTML = "";
    const unknown: string[] = [];
    const strangeGroups: string[] = [];
    for (const seg of segs) {
      if (seg.type === "text") {
        if (seg.text) el.appendChild(document.createTextNode(seg.text));
        continue;
      }
      el.appendChild(chipEl(seg));
      if (seg.type === "group" && !handlers.groupFace(seg.id)) strangeGroups.push(seg.id);
      // Both person-shaped pills ask the same question of the same place.
      if ((seg.type === "key" || seg.type === "observer") && !handlers.personFace(seg.pubkey)) {
        unknown.push(seg.pubkey);
      }
    }
    drawHint();
    if (caret != null) setCaret(caret);
    if (unknown.length) handlers.needPeople(unknown);
    // A `group:` token from a URL or a paste was never offered by the picker; this names it.
    if (strangeGroups.length) handlers.needGroups(strangeGroups);
  }

  /**
   * Does the DOM still match what the text tokenizes to? The field is left alone (caret, IME,
   * undo) until a token finished or broke, or the browser invented a node.
   */
  function structureChanged(text: string, typingAt: number | null): boolean {
    const want = drawable(text, typingAt).filter((s) => s.type !== "text").map((s) => s.raw);
    const have: string[] = [];
    for (const n of Array.from(el.childNodes)) {
      if (n.nodeType === 3 || isHint(n)) continue;
      if (!isChip(n)) return true;
      have.push(n.dataset.token as string);
    }
    return want.length !== have.length || want.some((w, i) => w !== have[i]);
  }

  function replaceRange(
    from: number,
    to: number,
    insert: string,
    caret: number | null,
    typingAt: number | null = caret,
  ): void {
    const text = readValue();
    render(text.slice(0, from) + insert + text.slice(to), caret, typingAt);
  }

  /** Splice a finished token over the partial the caret is in; the caret lands past the trailing space. */
  function replaceToken(ctx: { start: number; end: number }, tok: string): void {
    const text = readValue();
    const tail = text.slice(ctx.end).startsWith(" ") ? "" : " ";
    const { start, end } = ctx;
    setToken(null);
    replaceRange(start, end, tok + tail, start + tok.length + tail.length);
    el.focus();
    handlers.onEdit(readValue());
  }

  // ---- which token the caret is building ----------------------------------

  function setToken(next: ActiveToken | null): void {
    const same =
      (!token && !next) ||
      (!!token && !!next && token.kind === next.kind && token.start === next.start &&
        token.partial === next.partial &&
        (token.kind !== "date" || next.kind !== "date" || token.field === next.field));
    if (same) return;
    token = next;
    handlers.onToken(next);
  }

  /**
   * Re-read the token under the caret and put the right popup under it. At most one prefix
   * matches, and whichever does not match is shut.
   */
  function updateToken(): void {
    const text = readValue();
    const caret = caretIndex();
    const day = dateAt(text, caret);
    if (day && !day.complete) {
      setToken({ kind: "date", field: day.field as "since" | "until", partial: day.partial, start: day.start, end: day.end });
      return;
    }
    const group = groupAt(text, caret);
    if (group) {
      setToken({ kind: "group", partial: group.partial, start: group.start, end: group.end });
      return;
    }
    setToken(null);
  }

  // ---- the listeners -------------------------------------------------------

  const onInput = (e: Event) => {
    const text = readValue();
    // The browser leaves a `<br>` behind when the last character goes.
    if (!text) {
      if (el.innerHTML) { el.innerHTML = ""; drawHint(); }
    } else if (!(e as InputEvent).isComposing) {
      // Never re-render mid-composition: rebuilding the nodes under an IME tears down its text.
      const at = caretIndex();
      if (structureChanged(text, at)) render(text, at);
    }
    updateToken();
    handlers.onEdit(readValue());
  };

  /** Paste and drop insert text; left to the browser they would insert markup. */
  function insertPlain(e: Event, raw: string | null | undefined, at?: number | null): void {
    e.preventDefault();
    const text = String(raw || "").replace(/\s+/g, " ");
    const [from, to] = at == null ? selectionRange() : [at, at];
    // `typingAt` null: a paste is not somebody midway through a word.
    replaceRange(from, to, text, from + text.length, null);
    updateToken();
    handlers.onEdit(readValue());
  }

  const onPaste = (e: ClipboardEvent) =>
    insertPlain(e, e.clipboardData?.getData("text/plain"));
  const onDrop = (e: DragEvent) =>
    insertPlain(e, e.dataTransfer?.getData("text/plain"), dropIndex(e));

  /**
   * The other door Enter comes through, and on a phone the only one: a soft keyboard's action
   * key arrives as an inserted line break. The break is refused; text committed with it is kept.
   */
  const onBeforeInput = (e: InputEvent) => {
    const t = e.inputType;
    const typed = t === "insertText" && e.data && NEWLINE.test(e.data) ? e.data : null;
    if (!typed && t !== "insertLineBreak" && t !== "insertParagraph") return;
    const rest = typed ? typed.replace(NEWLINES, "") : "";
    // A bare newline leaves nothing to insert and is only the submit.
    if (rest) insertPlain(e, rest);
    else e.preventDefault();
    handlers.onEnter();
  };

  /** A caret move finishes a hashtag, a date or a scope without editing: a pill forms once the caret leaves. */
  function syncPills(typingAt: number | null = caretIndex()): void {
    const text = readValue();
    if (text && structureChanged(text, typingAt)) render(text, typingAt, typingAt);
  }

  const onClick = () => { updateToken(); syncPills(); };
  const onFocus = () => { updateToken(); syncPills(); };
  const onKeyUp = (e: KeyboardEvent) => {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "Home" || e.key === "End") {
      updateToken();
      syncPills();
    }
  };
  const onBlur = () => {
    // Every tag pills, and no caret is placed, which would scroll an unfocused field into view.
    syncPills(null);
    // A range left in this div is a blinking caret in a field the reader left. Dropped only when ours.
    const sel = document.getSelection();
    if (sel && sel.rangeCount && el.contains(sel.getRangeAt(0).startContainer)) sel.removeAllRanges();
  };

  const onKeyDownDom = (e: KeyboardEvent) => {
    if (handlers.onKeyDown?.(e)) return;
  };

  /**
   * A pill's ×. mousedown rather than click, and prevented, because the field must not lose
   * the caret to the button: the splice below puts it where the pill was.
   */
  const onMouseDownDom = (e: MouseEvent) => {
    const target = e.target as HTMLElement | null;
    if (!target?.closest?.("[data-remove]")) return;
    const chip = target.closest("[data-token]") as HTMLElement | null;
    if (!chip) return;
    e.preventDefault();
    let start = 0;
    for (const n of Array.from(el.childNodes)) {
      if (n === chip) break;
      start += lenOf(n);
    }
    const token = chip.dataset.token as string;
    const text = readValue();
    // Take one adjoining space with it, or removing the middle pill leaves a double gap.
    const after = text.slice(start + token.length).startsWith(" ") ? 1 : 0;
    const before = !after && text.slice(0, start).endsWith(" ") ? 1 : 0;
    replaceRange(start - before, start + token.length + after, "", start - before, null);
    const next = readValue();
    handlers.onEdit(next);
    handlers.onRemoveToken?.(next);
  };
  el.addEventListener("mousedown", onMouseDownDom);

  el.addEventListener("input", onInput);
  el.addEventListener("paste", onPaste as EventListener);
  el.addEventListener("drop", onDrop as EventListener);
  el.addEventListener("beforeinput", onBeforeInput as EventListener);
  el.addEventListener("click", onClick);
  el.addEventListener("focus", onFocus);
  el.addEventListener("keyup", onKeyUp);
  el.addEventListener("keydown", onKeyDownDom);
  el.addEventListener("blur", onBlur);

  /**
   * The element answers `.value` like the <input> it replaced: the box's text, read back out
   * of the nodes. A set is a restore, never a keystroke — it fires no onEdit, exactly as
   * setting an input's value fires no input event.
   */
  Object.defineProperty(el, "value", {
    configurable: true,
    get: readValue,
    set: (v: string) => setValue(v),
  });

  function setValue(v: string): void {
    // The last door a line break can come through; `?q=` carries whatever it carries.
    const text = String(v ?? "").replace(NEWLINES, " ");
    setToken(null);
    // typingAt null: a restore or a clear is not typing.
    render(text, document.activeElement === el ? text.length : null, null);
  }

  return {
    getValue: readValue,
    setValue,
    setHint(text: string, testId?: string) {
      const next = String(text ?? "");
      if (testId) hintTestId = testId;
      if (next === hint) return;
      hint = next;
      drawHint();
    },
    repaint,
    replaceToken,
    focus: () => el.focus(),
    select() {
      const sel = document.getSelection();
      if (!sel) return;
      const r = document.createRange();
      r.selectNodeContents(el);
      sel.removeAllRanges();
      sel.addRange(r);
    },
    caret: caretIndex,
    destroy() {
      el.removeEventListener("input", onInput);
      el.removeEventListener("paste", onPaste as EventListener);
      el.removeEventListener("drop", onDrop as EventListener);
      el.removeEventListener("beforeinput", onBeforeInput as EventListener);
      el.removeEventListener("click", onClick);
      el.removeEventListener("focus", onFocus);
      el.removeEventListener("keyup", onKeyUp);
      el.removeEventListener("keydown", onKeyDownDom);
      el.removeEventListener("blur", onBlur);
      el.removeEventListener("mousedown", onMouseDownDom);
    },
  };
}
