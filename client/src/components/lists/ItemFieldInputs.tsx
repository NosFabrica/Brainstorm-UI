/**
 * Inputs for an item's fields, as a definition declares them: each labelled by
 * its name, its requirement and its type, with the header's words for it, and
 * typed by its `field-type` — a URL field is a URL input, an address field
 * says what it takes. Shared by the example item in a list's preview
 * (ListEditor) and the form that adds a real one (components/lists).
 */
import { Chip } from "@/components/ui/chip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { FieldDecl } from "@/lib/dlistFields";

/** One value per field name. */
export type FieldValues = Record<string, string>;

const PLACEHOLDER: Record<string, string> = {
  url: "https://…",
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
            type={f.type === "url" ? "url" : "text"}
            value={values[f.name] ?? ""}
            onChange={(e) => onChange(f.name, e.target.value)}
            placeholder={PLACEHOLDER[f.type] ?? ""}
            className="h-8 text-sm"
            data-testid={`${testId}-${f.name}`}
          />
        </div>
      ))}
    </div>
  );
}
