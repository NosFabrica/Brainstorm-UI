/**
 * The form for a list header's definition — its names, description, the
 * fields its items carry (each with a type and a requirement), its links
 * from URL templates, and how its items read (display hints, facts, the
 * list's image). Shared by "Publish my own version" (OwnVersionDialog) and
 * List Management's editor, which own the draft (lib/conceptCopy), show what
 * it publishes, and publish it.
 *
 * Rows come from the draft: a definition's own fields, fields its items carry
 * ("on 2 of 7 items"), and custom ones "+ Add a field" makes. A field the
 * draft turns off keeps its row; a role or fact can only name one that's on.
 */
import type { Dispatch, SetStateAction } from "react";
import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Chip } from "@/components/ui/chip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { CopyDraft, DraftDisplay, DraftField } from "@/lib/conceptCopy";
import { DISPLAY_ROLES, factLabel, type DisplayRole } from "@/lib/displayHints";
import { httpUrl, type FieldRequirement } from "@/lib/dlistFields";
import { rebind, similarTemplates, templatePlaceholders, type UrlTemplate } from "@/lib/linkTemplates";
import { asTemplate, draftTemplateId, type DraftTemplate } from "@/lib/templateDrafts";
import { useAvailableTemplates, useLinkTemplates } from "@/hooks/useLinkTemplates";
import { URL_TEMPLATES_CONCEPT, dictionaryRelays } from "@/config/dictionary";

/** Radix Select can't hold an empty value: "no hint" needs a name of its own. */
const AUTO = "__auto";
const ROLE_LABEL: Record<DisplayRole, string> = {
  title: "Title",
  summary: "Summary",
  image: "Picture",
  link: "Link",
  media: "Media",
  location: "Location (geohash)",
};
/** Title and summary always read from some field; a picture, link, media or location only when one is named. */
const NO_ROLE_LABEL = (role: DisplayRole) => (role === "title" || role === "summary" ? "Automatic" : "None");
/**
 * The value types the form offers (dlistFields): `url` makes a value a link;
 * `address` (provisional, 2026-10-10) says it names another event by its
 * `kind:pubkey:d`, and a page shows what it names (AddressRef).
 */
export const FIELD_TYPES = ["text", "url", "address"] as const;
/** The DList NIP's levels a form can set (`allowed` reads as optional; `disallowed` is never declared here). */
const REQUIREMENTS: FieldRequirement[] = ["required", "recommended", "optional"];
const REQUIREMENT_LABEL: Record<FieldRequirement, string> = {
  required: "Required",
  recommended: "Recommended",
  optional: "Optional",
};

export function DefinitionForm({
  draft,
  setDraft,
  itemsTotal,
  templatesEnabled = true,
  testId = "own-version",
  idPrefix = "own",
}: {
  draft: CopyDraft;
  setDraft: Dispatch<SetStateAction<CopyDraft>>;
  /** How many items the list has, for "on 2 of 7 items". */
  itemsTotal: number;
  /** Whether to read the URL templates on offer (a closed dialog needn't). */
  templatesEnabled?: boolean;
  /** Prefix of every test id, so two forms on one page stay apart. */
  testId?: string;
  /** Prefix of every element id, for the same reason. */
  idPrefix?: string;
}) {
  const setField = (i: number, patch: Partial<DraftField>) =>
    setDraft((d) => ({ ...d, fields: d.fields.map((f, j) => (j === i ? { ...f, ...patch } : f)) }));
  const addField = () =>
    setDraft((d) => ({
      ...d,
      fields: [...d.fields, { name: "", enabled: true, requirement: "optional", origin: "custom" }],
    }));
  const removeField = (i: number) => setDraft((d) => ({ ...d, fields: d.fields.filter((_, j) => j !== i) }));
  const setDisplay = (patch: Partial<DraftDisplay>) => setDraft((d) => ({ ...d, display: { ...d.display, ...patch } }));
  // A role can only name a field this version declares; a disabled field drops back to Automatic.
  const enabledNames = draft.fields.filter((f) => f.enabled && f.name.trim()).map((f) => f.name.trim());
  const factOf = (field: string) => draft.display.facts.find((f) => f.field === field) ?? null;
  const setFacts = (next: (facts: DraftDisplay["facts"]) => DraftDisplay["facts"]) =>
    setDraft((d) => ({ ...d, display: { ...d.display, facts: next(d.display.facts) } }));
  const total = itemsTotal;

  // URL templates: the ones on offer (the URL Templates list), the ones this draft already pins,
  // and the ones drafted here, which no relay has yet (lib/templateDrafts).
  const available = useAvailableTemplates(templatesEnabled);
  const existing = available.data ?? [];
  const draftIds = new Set(draft.templates.map((t) => t.id));
  const pinned = useLinkTemplates(draft.links.filter((l) => !draftIds.has(l.templateId)));
  const templateById = new Map<string, UrlTemplate>([
    ...existing.map((t) => [t.id, t] as [string, UrlTemplate]),
    ...(pinned.data ?? new Map()),
    ...draft.templates.map((t) => [t.id, asTemplate(t)] as [string, UrlTemplate]),
  ]);
  // A field named for the placeholder is the likely one: {username} → github-username.
  const guess = (p: string) => enabledNames.find((n) => n === p || n.endsWith(`-${p}`)) ?? "";
  const addLink = (id: string) => {
    const tpl = templateById.get(id);
    const placeholders = tpl ? (templatePlaceholders(tpl.template) ?? []) : [];
    setDraft((d) => ({
      ...d,
      links: [
        ...d.links,
        { templateId: id, relay: dictionaryRelays()[0] ?? "", bindings: placeholders.map((p) => [p, guess(p)]) },
      ],
    }));
  };
  const bindLink = (i: number, placeholder: string, field: string) =>
    setDraft((d) => ({
      ...d,
      links: d.links.map((l, j) =>
        j === i ? { ...l, bindings: l.bindings.map(([p, f]) => [p, p === placeholder ? field : f]) } : l,
      ),
    }));
  // A template this version already links isn't offered twice.
  const offered = existing.filter((t) => !draft.links.some((l) => l.templateId === t.id));
  // Removing a drafted template's link drops the draft with it.
  const removeLink = (i: number) =>
    setDraft((d) => ({
      ...d,
      links: d.links.filter((_, j) => j !== i),
      templates: d.templates.filter((t) => t.id !== d.links[i]?.templateId),
    }));
  const newTemplate = () => {
    const id = draftTemplateId();
    setDraft((d) => ({
      ...d,
      templates: [...d.templates, { id, name: "", template: "https://" }],
      links: [...d.links, { templateId: id, relay: dictionaryRelays()[0] ?? "", bindings: [] }],
    }));
  };
  // A draft's placeholders follow its text: a binding stays while its placeholder does.
  const editTemplate = (id: string, patch: Partial<DraftTemplate>) =>
    setDraft((d) => {
      const before = d.templates.find((t) => t.id === id);
      if (!before) return d;
      const after = { ...before, ...patch };
      const placeholders = templatePlaceholders(after.template.trim());
      return {
        ...d,
        templates: d.templates.map((t) => (t.id === id ? after : t)),
        links: placeholders
          ? d.links.map((l) => {
              if (l.templateId !== id) return l;
              const bound = new Map(l.bindings);
              return { ...l, bindings: placeholders.map((p) => [p, bound.get(p) ?? guess(p)] as [string, string]) };
            })
          : d.links,
      };
    });
  // An existing template in a draft's place: bindings carried over by position when it builds the same links.
  const swapForExisting = (i: number, tpl: UrlTemplate) =>
    setDraft((d) => {
      const link = d.links[i];
      const drafted = d.templates.find((t) => t.id === link.templateId);
      const same = drafted && similarTemplates(drafted.template, [tpl]).same;
      const bindings = same
        ? rebind(drafted.template.trim(), tpl.template, link.bindings)
        : (templatePlaceholders(tpl.template) ?? []).map((p) => [p, guess(p)] as [string, string]);
      return {
        ...d,
        links: d.links.map((l, j) => (j === i ? { ...l, templateId: tpl.id, bindings } : l)),
        templates: d.templates.filter((t) => t.id !== link.templateId),
      };
    });

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-plural`}>List name (plural)</Label>
          <Input
            id={`${idPrefix}-plural`}
            value={draft.plural}
            onChange={(e) => setDraft((d) => ({ ...d, plural: e.target.value }))}
            data-testid={`${testId}-plural`}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-singular`}>Item name (singular)</Label>
          <Input
            id={`${idPrefix}-singular`}
            value={draft.singular}
            onChange={(e) => setDraft((d) => ({ ...d, singular: e.target.value }))}
            data-testid={`${testId}-singular`}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-description`}>Description</Label>
        <Textarea
          id={`${idPrefix}-description`}
          rows={2}
          value={draft.description}
          onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
          data-testid={`${testId}-description`}
        />
      </div>

      <div className="space-y-2">
        <Label>Item fields</Label>
        <ul className="divide-y divide-border rounded-xl border border-border" data-testid={`${testId}-fields`}>
          {draft.fields.map((f, i) => (
            <li
              key={i}
              className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2 ${f.enabled ? "" : "opacity-60"}`}
              data-testid={`${testId}-field-${i}`}
            >
              <Checkbox
                checked={f.enabled}
                onCheckedChange={(v) => setField(i, { enabled: v === true })}
                aria-label={`Include ${f.name || "this field"}`}
                data-testid={`${testId}-field-enabled`}
              />
              {f.origin === "custom" ? (
                <Input
                  value={f.name}
                  onChange={(e) => setField(i, { name: e.target.value })}
                  placeholder="field name"
                  className="h-8 w-44 font-mono text-sm"
                  aria-label="Field name"
                  data-testid={`${testId}-field-name`}
                />
              ) : (
                <code className="font-mono text-sm text-slate-900 dark:text-slate-100">{f.name}</code>
              )}
              {f.origin === "definition" && (
                <Chip tone="slate" size="sm">
                  community
                </Chip>
              )}
              {f.origin === "items" && (
                <Chip tone="slate" size="sm">
                  on {f.seenOn} of {total} items
                </Chip>
              )}
              <span className="ml-auto flex items-center gap-1.5">
                <Select value={f.type ?? "text"} onValueChange={(v) => setField(i, { type: v })} disabled={!f.enabled}>
                  <SelectTrigger
                    className="h-7 w-[5.75rem] font-mono text-xs"
                    aria-label={`${f.name || "Field"} type`}
                    data-testid={`${testId}-field-type`}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FIELD_TYPES.map((t) => (
                      <SelectItem key={t} value={t} className="font-mono text-xs">
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={f.requirement}
                  onValueChange={(v) => setField(i, { requirement: v as FieldRequirement })}
                  disabled={!f.enabled}
                >
                  <SelectTrigger
                    className="h-7 w-[8.75rem] text-xs"
                    aria-label={`${f.name || "Field"} requirement`}
                    data-testid={`${testId}-field-requirement`}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REQUIREMENTS.map((r) => (
                      <SelectItem key={r} value={r} className="text-xs">
                        {REQUIREMENT_LABEL[r]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {f.origin === "custom" && (
                  <button
                    type="button"
                    onClick={() => removeField(i)}
                    className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
                    aria-label="Remove field"
                    data-testid={`${testId}-field-remove`}
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
        <Button type="button" variant="outline" size="sm" onClick={addField} data-testid={`${testId}-add-field`}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Add a field
        </Button>
      </div>

      <div className="space-y-2" data-testid={`${testId}-links`}>
        <Label className="flex items-center gap-2">
          Links
          <Chip tone="slate" size="sm">
            provisional
          </Chip>
        </Label>
        {draft.links.length > 0 && (
          <ul className="divide-y divide-border rounded-xl border border-border">
            {draft.links.map((link, i) => {
              const tpl = templateById.get(link.templateId);
              const drafted = draft.templates.find((t) => t.id === link.templateId);
              return (
                <li key={`${link.templateId}-${i}`} className="space-y-2 px-3 py-2" data-testid={`${testId}-link-${i}`}>
                  {drafted ? (
                    <DraftTemplateEditor
                      template={drafted}
                      existing={existing}
                      onChange={(patch) => editTemplate(drafted.id, patch)}
                      onUseExisting={(t) => swapForExisting(i, t)}
                      onRemove={() => removeLink(i)}
                      testId={`${testId}-draft-template-${i}`}
                    />
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                        {tpl?.name ?? "URL template"}
                      </span>
                      <code className="min-w-0 truncate font-mono text-xs text-slate-500 dark:text-slate-400">
                        {tpl?.template ?? link.templateId.slice(0, 12) + "…"}
                      </code>
                      <button
                        type="button"
                        onClick={() => removeLink(i)}
                        className="ml-auto rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
                        aria-label="Remove link"
                        data-testid={`${testId}-link-remove`}
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                  {link.bindings.map(([placeholder, field]) => (
                    <div key={placeholder} className="flex items-center gap-2 text-xs">
                      <code className="font-mono text-slate-600 dark:text-slate-300">{`{${placeholder}}`}</code>
                      <span className="text-slate-400">←</span>
                      <Select
                        value={enabledNames.includes(field) ? field : AUTO}
                        onValueChange={(v) => bindLink(i, placeholder, v === AUTO ? "" : v)}
                      >
                        <SelectTrigger
                          className="h-8 w-48 font-mono text-xs"
                          data-testid={`${testId}-link-bind-${placeholder}`}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={AUTO}>Choose a field</SelectItem>
                          {enabledNames.map((n) => (
                            <SelectItem key={n} value={n} className="font-mono text-xs">
                              {n}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </li>
              );
            })}
          </ul>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {offered.length > 0 ? (
            <Select value="" onValueChange={addLink}>
              <SelectTrigger className="h-8 w-56 text-sm" data-testid={`${testId}-add-link`}>
                <SelectValue placeholder="+ Add a link…" />
              </SelectTrigger>
              <SelectContent>
                {offered.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name} <span className="font-mono text-xs text-slate-400">{t.template}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {available.isPending
                ? "Looking for URL templates…"
                : (available.data ?? []).length
                  ? "Every URL template is already linked."
                  : "No URL templates found."}
            </p>
          )}
          {URL_TEMPLATES_CONCEPT && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={newTemplate}
              data-testid={`${testId}-new-template`}
            >
              <Plus className="mr-1 h-3.5 w-3.5" /> New URL template
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-2" data-testid={`${testId}-display`}>
        <Label className="flex items-center gap-2">
          How items read
          <Chip tone="slate" size="sm">
            provisional
          </Chip>
        </Label>
        <div className="grid gap-3 sm:grid-cols-3">
          {DISPLAY_ROLES.map((role) => (
            <div key={role} className="space-y-1">
              <span className="text-xs text-slate-500 dark:text-slate-400">{ROLE_LABEL[role]}</span>
              <Select
                value={enabledNames.includes(draft.display[role] ?? "") ? draft.display[role]! : AUTO}
                onValueChange={(v) => setDisplay({ [role]: v === AUTO ? null : v })}
              >
                <SelectTrigger className="h-8 font-mono text-xs" data-testid={`${testId}-display-${role}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={AUTO}>{NO_ROLE_LABEL(role)}</SelectItem>
                  {enabledNames.map((n) => (
                    <SelectItem key={n} value={n} className="font-mono text-xs">
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
        <div className="space-y-1.5" data-testid={`${testId}-facts`}>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Facts — listed on an item&rsquo;s page as &ldquo;label: value&rdquo;, in field order
          </span>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {enabledNames.map((n) => (
              <label key={n} className="flex items-center gap-1.5">
                <Checkbox
                  checked={factOf(n) != null}
                  onCheckedChange={(v) =>
                    setFacts((facts) =>
                      v === true ? [...facts, { field: n, label: "" }] : facts.filter((f) => f.field !== n),
                    )
                  }
                  data-testid={`${testId}-fact-${n}`}
                />
                <code className="font-mono text-xs text-slate-700 dark:text-slate-300">{n}</code>
              </label>
            ))}
          </div>
          {enabledNames
            .filter((n) => factOf(n))
            .map((n) => (
              <div key={n} className="flex items-center gap-2">
                <code className="w-36 shrink-0 truncate font-mono text-xs text-slate-500 dark:text-slate-400">{n}</code>
                <Input
                  value={factOf(n)!.label}
                  onChange={(e) =>
                    setFacts((facts) => facts.map((f) => (f.field === n ? { ...f, label: e.target.value } : f)))
                  }
                  placeholder={factLabel({ field: n, label: null })}
                  className="h-8 text-sm"
                  aria-label={`Label for ${n}`}
                  data-testid={`${testId}-fact-label-${n}`}
                />
              </div>
            ))}
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${idPrefix}-list-image`} className="text-xs font-normal text-slate-500 dark:text-slate-400">
            List image (a URL every item wears, e.g. a logo)
          </Label>
          <div className="flex items-center gap-2">
            {httpUrl(draft.display.listImage) && (
              <img
                src={httpUrl(draft.display.listImage)!}
                alt=""
                className="h-8 w-8 shrink-0 rounded-md border border-border object-contain"
              />
            )}
            <Input
              id={`${idPrefix}-list-image`}
              value={draft.display.listImage}
              onChange={(e) => setDisplay({ listImage: e.target.value })}
              placeholder="https://…"
              className="h-8 text-sm"
              data-testid={`${testId}-list-image`}
            />
          </div>
        </div>
      </div>
    </>
  );
}

/**
 * A URL template drafted in the form: its name and address, checked as typed,
 * and what already exists — one building the same links, which it must use
 * instead (it won't be published), and others on the same site, offered.
 */
function DraftTemplateEditor({
  template,
  existing,
  onChange,
  onUseExisting,
  onRemove,
  testId,
}: {
  template: DraftTemplate;
  existing: readonly UrlTemplate[];
  onChange: (patch: Partial<DraftTemplate>) => void;
  onUseExisting: (t: UrlTemplate) => void;
  onRemove: () => void;
  testId: string;
}) {
  const text = template.template.trim();
  const valid = !!templatePlaceholders(text);
  const typed = !!text && text !== "https://";
  const { same, sameSite } = valid ? similarTemplates(text, existing) : { same: null, sameSite: [] };
  return (
    <div className="space-y-2" data-testid={testId}>
      <div className="flex items-center gap-2">
        <Chip tone="accent" size="sm">
          new — published with the list
        </Chip>
        <button
          type="button"
          onClick={onRemove}
          className="ml-auto rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
          aria-label="Remove link"
          data-testid={`${testId}-remove`}
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="space-y-2">
        <Input
          value={template.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="Name: Open Library book"
          className="h-8 text-sm"
          aria-label="Template name"
          data-testid={`${testId}-name`}
        />
        <Input
          value={template.template}
          onChange={(e) => onChange({ template: e.target.value })}
          placeholder="https://openlibrary.org/isbn/{isbn}"
          className="h-8 font-mono text-xs md:text-xs"
          aria-label="Template address"
          data-testid={`${testId}-url`}
        />
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Placeholders like <code className="font-mono">{"{isbn}"}</code> go after the site; each is filled from a field.
      </p>
      {typed && !valid && (
        <Chip tone="warning" size="sm" data-testid={`${testId}-invalid`}>
          Start with https:// and the site, then use {"{placeholders}"}
        </Chip>
      )}
      {same && (
        <div
          className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-slate-50 px-2.5 py-2 text-xs dark:bg-slate-900"
          data-testid={`${testId}-same`}
        >
          <span>
            Already exists as <strong>{same.name}</strong>{" "}
            <code className="break-all font-mono text-slate-500">{same.template}</code>
          </span>
          <Button type="button" size="sm" variant="outline" className="ml-auto h-7" onClick={() => onUseExisting(same)}>
            Use it
          </Button>
        </div>
      )}
      {!same && sameSite.length > 0 && (
        <div className="space-y-1 text-xs text-slate-500 dark:text-slate-400" data-testid={`${testId}-same-site`}>
          <p>Templates for this site already exist — one may already do it:</p>
          {sameSite.map((t) => (
            <div key={t.id} className="flex items-center gap-2 rounded-lg border border-border px-2.5 py-1.5">
              <span className="min-w-0">
                <span className="text-slate-700 dark:text-slate-300">{t.name}</span>{" "}
                <code className="break-all font-mono">{t.template}</code>
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="ml-auto h-7 shrink-0"
                onClick={() => onUseExisting(t)}
              >
                Use instead
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
