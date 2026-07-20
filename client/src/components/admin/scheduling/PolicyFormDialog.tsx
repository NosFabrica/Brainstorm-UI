import { useState } from "react";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type {
  CreateSchedulingBody,
  SchedulingItem,
  UpdateSchedulingBody,
} from "@/services/api";

const UNIT_OPTIONS: Array<{ label: string; seconds: number }> = [
  { label: "Seconds", seconds: 1 },
  { label: "Minutes", seconds: 60 },
  { label: "Hours", seconds: 3600 },
  { label: "Days", seconds: 86400 },
];

/** Largest whole unit that divides `seconds` evenly (lossless round-trip). */
function decompose(seconds: number): { value: number; unit: number } {
  for (const { seconds: unit } of [...UNIT_OPTIONS].reverse()) {
    if (seconds % unit === 0) return { value: seconds / unit, unit };
  }
  return { value: seconds, unit: 1 };
}

const schema = z.object({
  name: z.string().min(1, "Name is required"),
  schedule_interval_seconds: z.number().int().positive("Interval must be at least 1 second"),
  priority: z
    .number()
    .int("Priority must be between 0 and 10")
    .min(0, "Priority must be between 0 and 10")
    .max(10, "Priority must be between 0 and 10"),
  enabled: z.boolean(),
  is_default: z.boolean(),
  manual_quota_limit: z.number().int().min(0, "Quota must be zero or more"),
  manual_quota_window_seconds: z.number().int().positive("Window must be at least 1 second"),
});

type Body = z.infer<typeof schema>;

export interface PolicyFormDialogProps {
  open: boolean;
  mode: "create" | "edit";
  initial?: SchedulingItem;
  submitting?: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (body: CreateSchedulingBody | UpdateSchedulingBody) => void | Promise<void>;
}

export function PolicyFormDialog({
  open,
  mode,
  initial,
  submitting,
  onOpenChange,
  onSubmit,
}: PolicyFormDialogProps) {
  const seed = initial ?? {
    name: "",
    schedule_interval_seconds: 604800,
    priority: 0,
    enabled: true,
    is_default: false,
    manual_quota_limit: 20,
    manual_quota_window_seconds: 604800,
  };
  const interval = decompose(seed.schedule_interval_seconds);
  const window = decompose(seed.manual_quota_window_seconds);

  const [name, setName] = useState(seed.name);
  const [priority, setPriority] = useState(String(seed.priority));
  const [intervalValue, setIntervalValue] = useState(String(interval.value));
  const [intervalUnit, setIntervalUnit] = useState(String(interval.unit));
  const [quotaLimit, setQuotaLimit] = useState(String(seed.manual_quota_limit));
  const [windowValue, setWindowValue] = useState(String(window.value));
  const [windowUnit, setWindowUnit] = useState(String(window.unit));
  const [enabled, setEnabled] = useState(seed.enabled);
  const [isDefault, setIsDefault] = useState(seed.is_default);
  const [errors, setErrors] = useState<Partial<Record<keyof Body, string>>>({});

  function buildBody(): Body {
    return {
      name: name.trim(),
      schedule_interval_seconds: Math.round(Number(intervalValue) * Number(intervalUnit)),
      priority: Number(priority),
      enabled,
      is_default: isDefault,
      manual_quota_limit: Number(quotaLimit),
      manual_quota_window_seconds: Math.round(Number(windowValue) * Number(windowUnit)),
    };
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const body = buildBody();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      const next: Partial<Record<keyof Body, string>> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof Body;
        if (!next[key]) next[key] = issue.message;
      }
      setErrors(next);
      return;
    }
    setErrors({});
    if (mode === "edit" && initial) {
      const diff: UpdateSchedulingBody = {};
      (Object.keys(body) as Array<keyof Body>).forEach((k) => {
        if (body[k] !== (initial as unknown as Body)[k]) {
          (diff as Record<string, unknown>)[k] = body[k];
        }
      });
      onSubmit(diff);
    } else {
      onSubmit(body);
    }
  }

  const showDefaultWarning = isDefault && !seed.is_default;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "New scheduling policy" : "Edit scheduling policy"}
          </DialogTitle>
          <DialogDescription>
            Set the recalculation cadence and manual-recalc quota for this tier.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="policy-name">Name</Label>
            <Input id="policy-name" value={name} onChange={(e) => setName(e.target.value)} />
            {errors.name && <p className="text-xs text-red-500">{errors.name}</p>}
          </div>

          <div>
            <Label htmlFor="policy-priority">Priority</Label>
            <Input
              id="policy-priority"
              type="number"
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
            />
            {errors.priority && <p className="text-xs text-red-500">{errors.priority}</p>}
          </div>

          <div>
            <Label htmlFor="policy-interval">Recalculation interval</Label>
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_9rem] gap-2">
              <Input
                id="policy-interval"
                type="number"
                value={intervalValue}
                onChange={(e) => setIntervalValue(e.target.value)}
              />
              <select
                id="policy-interval-unit"
                aria-label="Interval unit"
                className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#7c86ff]/30"
                value={intervalUnit}
                onChange={(e) => setIntervalUnit(e.target.value)}
              >
                {UNIT_OPTIONS.map((u) => (
                  <option key={u.seconds} value={u.seconds}>{u.label}</option>
                ))}
              </select>
            </div>
            {errors.schedule_interval_seconds && (
              <p className="mt-1 text-xs text-red-500">{errors.schedule_interval_seconds}</p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="policy-quota-limit">Manual quota limit</Label>
              <Input
                id="policy-quota-limit"
                type="number"
                value={quotaLimit}
                onChange={(e) => setQuotaLimit(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="policy-quota-window">Quota window</Label>
              <div className="grid grid-cols-[1fr_8rem] gap-2">
                <Input
                  id="policy-quota-window"
                  type="number"
                  value={windowValue}
                  onChange={(e) => setWindowValue(e.target.value)}
                />
                <select
                  id="policy-quota-window-unit"
                  aria-label="Quota window unit"
                  className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#7c86ff]/30"
                  value={windowUnit}
                  onChange={(e) => setWindowUnit(e.target.value)}
                >
                  {UNIT_OPTIONS.map((u) => (
                    <option key={u.seconds} value={u.seconds}>{u.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              id="policy-enabled"
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />
            <Label htmlFor="policy-enabled">Enabled</Label>
          </div>

          <div className="flex items-center gap-2">
            <input
              id="policy-default"
              type="checkbox"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
            />
            <Label htmlFor="policy-default">Default policy</Label>
          </div>
          {showDefaultWarning && (
            <p className="text-xs text-amber-500">
              This unsets the current default policy — exactly one default is allowed.
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {mode === "create" ? "Create policy" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
