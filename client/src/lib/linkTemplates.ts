/**
 * PROVISIONAL (2026-10-01) — links built from data, not code. A concept's
 * header names a URL template and says which of its fields fills each
 * placeholder:
 *
 *   ["link", <template event id>, <relay hint>, <placeholder>, <field>, …]
 *
 * The template is an item of the URL Templates concept
 * (`39998:2efaa715…:url-templates`, config `urlTemplatesConcept`):
 *
 *   ["url-template", "https://github.com/{username}"], ["name", "GitHub profile"]
 *
 * Referenced by event id, never by address: an address follows its author's
 * edits, so a template could be re-pointed under every list that uses it;
 * an id is frozen, like a dependency pinned by hash. Pairs are named, not
 * positional, and may only bind declared fields — the rule `field-type` and
 * the display hints follow. Behind the same `displayHints` flag; every tag
 * name is here, so a rename is one edit.
 *
 * Templates are RFC 6570 level 1 — `{name}`, nothing else — so values are
 * percent-encoded and can't add a path, query or fragment. And a template
 * must begin with a literal `https://host/`: placeholders only after the
 * host, so no value can choose where a link goes. The expanded URL must
 * still parse as https on that same host.
 */
export const LINK_TAG = "link";
export const URL_TEMPLATE_FIELD = "url-template";

export interface LinkRef {
  templateId: string;
  /** Where the template can be fetched; empty when the header gave none. */
  relay: string;
  /** Placeholder → the declared field that fills it, in tag order. */
  bindings: [placeholder: string, field: string][];
}

export interface UrlTemplate {
  id: string;
  pubkey: string;
  name: string;
  template: string;
}

export interface ItemLink {
  label: string;
  href: string;
  /** The host the link goes to, shown beside it. */
  host: string;
}

const HEX64 = /^[0-9a-f]{64}$/i;
const VARNAME = /^[A-Za-z0-9_]+$/;
const PLACEHOLDER = /\{([^{}]*)\}/g;

export function parseLinkRefs(header: { tags: string[][] }, declaredFields: string[]): LinkRef[] {
  const declared = new Set(declaredFields);
  const out: LinkRef[] = [];
  for (const t of header.tags) {
    if (t[0] !== LINK_TAG || !HEX64.test(t[1] ?? "")) continue;
    const bindings: [string, string][] = [];
    for (let i = 3; i + 1 < t.length; i += 2) {
      if (VARNAME.test(t[i]) && declared.has(t[i + 1])) bindings.push([t[i], t[i + 1]]);
    }
    out.push({ templateId: t[1].toLowerCase(), relay: /^wss?:\/\//.test(t[2] ?? "") ? t[2] : "", bindings });
  }
  return out;
}

export function linkTags(refs: LinkRef[]): string[][] {
  return refs.map((r) => [LINK_TAG, r.templateId, r.relay, ...r.bindings.flat()]);
}

/** A URL Templates item, read; null when it isn't one. */
export function templateOf(ev: { id: string; pubkey: string; tags: string[][] }): UrlTemplate | null {
  const template = ev.tags.find((t) => t[0] === URL_TEMPLATE_FIELD)?.[1]?.trim();
  if (!template) return null;
  const name = ev.tags.find((t) => t[0] === "name")?.[1]?.trim() || "Link";
  return { id: ev.id, pubkey: ev.pubkey, name, template };
}

/**
 * A template's placeholders, in order — or null when it breaks the rules:
 * not a literal `https://host/` start, a placeholder in the host, or
 * anything beyond level 1 (`{+path}`, `{?q}`, `{a,b}`, an unclosed brace).
 */
export function templatePlaceholders(template: string): string[] | null {
  const head = /^https:\/\/([^/?#{}]+)(\/|$)/i.exec(template);
  if (!head) return null;
  const names: string[] = [];
  for (const [, name] of template.matchAll(PLACEHOLDER)) {
    if (!VARNAME.test(name)) return null;
    names.push(name);
  }
  // Braces left over once the placeholders are gone are a malformed template.
  if (/[{}]/.test(template.replace(PLACEHOLDER, ""))) return null;
  return [...new Set(names)];
}

/** RFC 6570 simple expansion encodes everything but RFC 3986's unreserved characters. */
const encodeValue = (v: string) =>
  encodeURIComponent(v).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

/** The link, or null when the template breaks the rules or a placeholder has no value. */
export function expandTemplate(template: string, values: Record<string, string | null | undefined>): string | null {
  const names = templatePlaceholders(template);
  if (!names || names.some((n) => !values[n]?.trim())) return null;
  const href = template.replace(PLACEHOLDER, (_, n: string) => encodeValue(values[n]!.trim()));
  try {
    const url = new URL(href);
    const host = new URL(template.replace(PLACEHOLDER, "x")).host;
    return url.protocol === "https:" && url.host === host ? url.href : null;
  } catch {
    return null;
  }
}

/** An item's links: each ref whose template was found and whose placeholders the item fills. */
export function itemLinks(
  item: { tags: string[][] },
  refs: LinkRef[],
  templates: Map<string, UrlTemplate>,
): ItemLink[] {
  const valueOf = (field: string) => item.tags.find((t) => t[0] === field)?.[1] ?? null;
  const out: ItemLink[] = [];
  for (const ref of refs) {
    const tpl = templates.get(ref.templateId);
    if (!tpl) continue;
    const values = Object.fromEntries(ref.bindings.map(([p, f]) => [p, valueOf(f)]));
    const href = expandTemplate(tpl.template, values);
    // A header that names the same link twice still shows it once.
    if (href && !out.some((l) => l.href === href)) out.push({ label: tpl.name, href, host: new URL(href).host });
  }
  return out;
}
