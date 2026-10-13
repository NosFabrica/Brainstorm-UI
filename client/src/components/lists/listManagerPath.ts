/**
 * The address of List Management and of what it opens: a list, one of a
 * list's tabs, one of its items. In a file of its own so the tabs drawn
 * inside ListManager can link to each other without importing it.
 */
export const listManagerPath = (list?: string, opts: { view?: "items" | "add"; item?: string } = {}) =>
  "/settings?tab=dictionary&manage=lists" +
  (list ? `&list=${encodeURIComponent(list)}` : "") +
  (opts.view ? `&view=${opts.view}` : "") +
  (opts.item ? `&item=${encodeURIComponent(opts.item)}` : "");
