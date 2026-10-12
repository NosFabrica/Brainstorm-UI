/**
 * The first non-empty value of the first of `names` the event carries. A leaf:
 * it imports nothing, so a kind's reader (lib/nip71, lib/nip84) and the row
 * readers that call it (lib/resultReaders) can both use it without importing
 * each other.
 */
export const tagValue = (ev: { tags: string[][] }, ...names: string[]): string | null => {
  for (const name of names) {
    const v = ev.tags.find((t) => t[0] === name && typeof t[1] === "string" && t[1].trim())?.[1];
    if (v) return v.trim();
  }
  return null;
};
