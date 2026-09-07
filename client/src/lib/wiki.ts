/**
 * NIP-54 wiki articles (kind 30818) link to one another with [[wikilinks]]:
 * `[[topic]]` or `[[topic|label]]`. Read on Brainstorm, a wikilink is a search
 * for that topic's articles here — people stay, and any author's page on the
 * topic can answer, not only the one that happened to be linked.
 */
export function wikiToMarkdown(content: string): string {
  return content.replace(/\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/g, (_m, target: string, label?: string) => {
    const topic = target.trim();
    const text = (label ?? topic).trim();
    return `[${text}](/?q=${encodeURIComponent(topic)}&t=articles)`;
  });
}
