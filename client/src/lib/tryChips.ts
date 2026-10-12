/**
 * The "Try:" chips under the search box on /what-is-wot.
 *
 * They are there to show search leading with tagged people, so each one's
 * words name a people tag outright (lib/tagMatch's strong match: the tag's
 * name, a plural or a typo forgiven), and each opens the People tab, the one
 * tab that asks for tags and lets a strongly named one lead. "Podcasts" used
 * to sit here and landed on a plain word search — two edits from the
 * "Podcaster" tag, so nobody in the results wore a tag and the demo showed
 * nothing; and the Top tab never leads with a tag, so "Musicians" there is a
 * word match on handles, not the twenty people the network calls musicians.
 */
export interface TryChip {
  label: string;
  /** The people tag the words name. */
  tag: string;
  /** Where the chip goes: the People tab, the one place the tag leads the list. */
  href: string;
}

const chip = (label: string, tag: string): TryChip => ({
  label,
  tag,
  href: `/?q=${encodeURIComponent(label)}&t=people`,
});

export const TRY_CHIPS: readonly TryChip[] = [
  chip("Authors", "Author"),
  chip("Musicians", "Musician"),
  chip("Podcasters", "Podcaster"),
];
