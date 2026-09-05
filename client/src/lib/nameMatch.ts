/**
 * Does a name answer to the words someone typed? By words, never inside one:
 * "nova" names NOVA and NOVA MOB, not Freddy Donovan. 2 = the whole name,
 * 1 = every word typed starts a word of the name (three letters or more, so
 * two letters never claim an artist), 0 = no.
 */
export function nameMatchScore(name: string, query: string): 0 | 1 | 2 {
  const words = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const n = words(name);
  const q = words(query);
  if (n.length === 0 || q.length === 0) return 0;
  if (n.join(" ") === q.join(" ")) return 2;
  if (q.join("").length < 3) return 0;
  return q.every((w) => n.some((x) => x.startsWith(w))) ? 1 : 0;
}
