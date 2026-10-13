/**
 * Inputs for an item's fields, as a definition declares them: each labelled by
 * its name, its requirement and its type, with the header's words for it, and
 * typed by its `field-type` — a url, tel or email field is that kind of
 * input, and an address field takes a `kind:pubkey:d` or an `naddr`, which
 * it spells out as the coordinate (what an item stores), and says so when a
 * value is neither.
 * Shared by the example item in a list's preview (ListEditor) and the form
 * that adds a real one (ItemComposer).
 */
import { Chip } from "@/components/ui/chip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addressOf, type FieldDecl } from "@/lib/dlistFields";

/** One value per field name. */
export type FieldValues = Record<string, string>;

/** An address field stores the coordinate: a pasted naddr is spelled out. */
const asTyped = (f: FieldDecl, raw: string) =>
  f.type === "address" && /^(nostr:)?naddr1/.test(raw.trim()) ? (addressOf(raw) ?? raw) : raw;

/** Field types that are HTML input types too: a phone gets a dial pad, an email the @ key. */
const INPUT_TYPES = new Set(["url", "tel", "email"]);

const PLACEHOLDER: Record<string, string> = {
  url: "https://…",
  tel: "+1 555 123 4567",
  email: "name@example.com",
  address: "kind:pubkey:d, or an naddr",
};

export function ItemFieldInputs({
  fields,
  values,
  onChange,
  testId,
}: {
  fields: FieldDecl[];
  values: FieldValues;
  onChange: (field: string, value: string) => void;
  testId: string;
}) {
  if (!fields.length)
    return <p className="text-sm text-slate-500 dark:text-slate-400">This list declares no fields yet.</p>;
  return (
    <div className="space-y-3" data-testid={testId}>
      {fields.map((f) => (
        <div key={f.name} className="space-y-1">
          <Label
            htmlFor={`${testId}-${f.name}`}
            className="flex flex-wrap items-center gap-1.5 text-xs font-normal text-slate-600 dark:text-slate-300"
          >
            <code className="font-mono text-slate-900 dark:text-slate-100">{f.name}</code>
            {f.requirement !== "optional" && (
              <Chip tone={f.requirement === "required" ? "brand" : "slate"} size="sm">
                {f.requirement}
              </Chip>
            )}
            {f.type !== "text" && (
              <Chip tone="slate" size="sm">
                {f.type}
              </Chip>
            )}
            {f.description && <span className="text-slate-500 dark:text-slate-400">{f.description}</span>}
          </Label>
          <Input
            id={`${testId}-${f.name}`}
            type={INPUT_TYPES.has(f.type) ? f.type : "text"}
            value={values[f.name] ?? ""}
            onChange={(e) => onChange(f.name, asTyped(f, e.target.value))}
            placeholder={PLACEHOLDER[f.type] ?? ""}
            className="h-8 text-sm"
            data-testid={`${testId}-${f.name}`}
          />
          {f.type === "address" && values[f.name]?.trim() && !addressOf(values[f.name]) && (
            <Chip tone="warning" size="sm" data-testid={`${testId}-${f.name}-not-address`}>
              Not an address: a list or item's kind:pubkey:d, or its naddr
            </Chip>
          )}
        </div>
      ))}
    </div>
  );
}
