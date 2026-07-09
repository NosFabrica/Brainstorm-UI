import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

const STYLE_ID = "admin-hscroll-style";

/** Force a slim, always-visible horizontal scrollbar (incl. macOS overlay). */
function ensureStyle() {
  if (typeof document === "undefined" || document.getElementById(STYLE_ID)) return;
  const s = document.createElement("style");
  s.id = STYLE_ID;
  s.textContent = `
.admin-hscroll{scrollbar-width:thin;scrollbar-color:rgba(100,116,139,.45) transparent;}
.admin-hscroll::-webkit-scrollbar{height:10px;}
.admin-hscroll::-webkit-scrollbar-thumb{background:rgba(100,116,139,.45);border-radius:9999px;}
.admin-hscroll::-webkit-scrollbar-thumb:hover{background:rgba(100,116,139,.65);}
.admin-hscroll::-webkit-scrollbar-track{background:transparent;}
`;
  document.head.appendChild(s);
}

/**
 * Wraps a wide table so horizontal scrolling is easy: a mirrored scrollbar is
 * pinned at the TOP (always in view — no hunting for the bar buried at the page
 * bottom) and stays in sync with the table's own scroll. Sticky Profile/Actions
 * columns (applied on the cells) keep the key columns fixed while the middle
 * scrolls under them.
 */
export function ScrollableTable({ children }: { children: React.ReactNode }) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const [contentWidth, setContentWidth] = useState(0);
  const [scrollable, setScrollable] = useState(false);

  const measure = useCallback(() => {
    const el = bodyRef.current;
    if (!el) return;
    setContentWidth(el.scrollWidth);
    setScrollable(el.scrollWidth - el.clientWidth > 2);
  }, []);

  useLayoutEffect(() => {
    ensureStyle();
    measure();
    const el = bodyRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => ro.disconnect();
  }, [measure]);

  useEffect(() => {
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure]);

  const onBodyScroll = () => {
    const body = bodyRef.current;
    const top = topRef.current;
    if (body && top && top.scrollLeft !== body.scrollLeft) top.scrollLeft = body.scrollLeft;
  };
  const onTopScroll = () => {
    const body = bodyRef.current;
    const top = topRef.current;
    if (body && top && body.scrollLeft !== top.scrollLeft) body.scrollLeft = top.scrollLeft;
  };

  return (
    <div>
      <div
        ref={topRef}
        onScroll={onTopScroll}
        aria-hidden="true"
        className={
          "admin-hscroll overflow-x-auto overflow-y-hidden " + (scrollable ? "" : "hidden")
        }
      >
        <div style={{ width: contentWidth, height: 1 }} />
      </div>
      <div ref={bodyRef} onScroll={onBodyScroll} className="admin-hscroll overflow-x-auto">
        {children}
      </div>
    </div>
  );
}
