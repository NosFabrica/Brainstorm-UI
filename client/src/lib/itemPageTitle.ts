/**
 * A list item's page is named for the item, not for whoever listed it:
 * "vitorpamplona · GitHub Account", "Il Sole Italian Food · Food and Drink
 * Place". The tab, the share sheet and a link preview all read it. An item
 * with no title is named for what it is, as its page is.
 */
export function itemPageTitle(shown: { title: string | null }, singular: string): string {
  const title = shown.title?.trim();
  return title ? `${title} · ${singular}` : `Untitled ${singular.toLowerCase()}`;
}
