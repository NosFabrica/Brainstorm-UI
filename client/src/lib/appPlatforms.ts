/**
 * The platforms a Zap Store app (kind 32267) runs on, from its `f` tags
 * ("android-arm64-v8a", "darwin-arm64", "web"…), one human word each, deduped:
 * what its card, its page and its All row all say.
 */
export function platformWords(event: { tags: string[][] }): string[] {
  const words = new Set<string>();
  for (const tag of event.tags) {
    if (tag[0] !== "f" || !tag[1]) continue;
    const f = tag[1].toLowerCase();
    if (f.startsWith("android")) words.add("Android");
    else if (f.startsWith("ios")) words.add("iOS");
    else if (f.includes("darwin") || f.includes("mac")) words.add("macOS");
    else if (f.includes("windows")) words.add("Windows");
    else if (f.includes("linux")) words.add("Linux");
    else if (f.includes("web")) words.add("Web");
  }
  return [...words];
}
