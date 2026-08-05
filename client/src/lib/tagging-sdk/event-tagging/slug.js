/**
 * Canonical slug derivation for the event-tagging core.
 *
 * Byte-identical to `src/lib/dtag.js` slug (lowercase, strip diacritics,
 * non-alphanumeric -> hyphen, trim). Re-implemented here (not required from
 * dtag) so this module stays dependency-free and copy-pasteable as an SDK seed.
 *
 * Part of the dependency-free event-tagging core — no imports, no I/O.
 */

function slug(name) {
  return String(name)
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')  // strip diacritics
    .replace(/[^a-z0-9]+/g, '-')                        // non-alphanumeric -> hyphen
    .replace(/^-|-$/g, '');                             // trim leading/trailing
}

export { slug };
