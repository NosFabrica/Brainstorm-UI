import { useEffect, useState } from "react";
import type { NostrEvent } from "nostr-tools";
import { useToast } from "@/hooks/use-toast";
import type { MapCategory } from "@/lib/treasureMapCards";
import {
  pickAll,
  pickCategory,
  setBackups,
  setOverride,
  setOverrideAll,
  undoAll,
  undoCategory,
  type EditPlan,
  type PendingEdit,
} from "@/lib/treasureMapEdit";
import { saveTreasureMap, type SaveOutcome } from "@/services/treasureMap";

export interface TreasureMapEdit {
  editing: boolean;
  pending: PendingEdit;
  busy: boolean;
  /** The last save's outcome, until the next save or a change of mode. */
  outcome: SaveOutcome | null;
  toggle: () => void;
  pick: (category: MapCategory, pubkey: string, current: string | null) => void;
  undo: (category: MapCategory) => void;
  pickEveryone: (pubkey: string, current: string | null) => void;
  undoEveryone: () => void;
  setOverride: (category: MapCategory, on: boolean) => void;
  setOverrideAll: (on: boolean, duties: EditPlan["duties"]) => void;
  setBackups: (on: boolean) => void;
  save: (base: NostrEvent | null, plan: EditPlan) => Promise<void>;
}

/**
 * Edit mode's state for Settings › Treasure Map: the pending edit (its steps
 * are lib/treasureMapEdit's), and Save (services/treasureMap). A save that
 * reached any relay ends Edit mode; a newer Map, a refusal or a save that
 * reached none keeps it, with the changes. Turning Edit off, or another
 * reader, drops them.
 */
export function useTreasureMapEdit(viewer: string | null | undefined): TreasureMapEdit {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState<PendingEdit>({});
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<SaveOutcome | null>(null);

  useEffect(() => {
    setEditing(false);
    setPending({});
    setOutcome(null);
  }, [viewer]);

  const change = (step: (p: PendingEdit) => PendingEdit) => setPending((p) => step(p));

  return {
    editing,
    pending,
    busy,
    outcome,
    toggle: () => {
      setEditing((on) => !on);
      setPending({});
      setOutcome(null);
    },
    pick: (category, pubkey, current) => change((p) => pickCategory(p, category, pubkey, current)),
    undo: (category) => change((p) => undoCategory(p, category)),
    pickEveryone: (pubkey, current) => change((p) => pickAll(p, pubkey, current)),
    undoEveryone: () => change(undoAll),
    setOverride: (category, on) => change((p) => setOverride(p, category, on)),
    setOverrideAll: (on, duties) => change((p) => setOverrideAll(p, on, duties)),
    setBackups: (on) => change((p) => setBackups(p, on)),
    save: async (base, plan) => {
      if (!viewer || busy || !plan.changed) return;
      setBusy(true);
      setOutcome(null);
      const answer = await saveTreasureMap({ viewer, base, draft: plan.draft }).catch((error): SaveOutcome => ({
        outcome: "failed",
        error: String(error?.message ?? error),
        total: 0,
      }));
      setBusy(false);
      setOutcome(answer);
      if (answer.outcome === "saved" || answer.outcome === "partial") {
        setEditing(false);
        setPending({});
      }
      if (answer.outcome === "saved") toast({ title: "Treasure Map updated" });
    },
  };
}
