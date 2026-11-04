import type { SelfMapStatus } from "@/lib/assistantTreasureMap";
import type { MenuStatus } from "@/lib/dutyMenu";

/** The two Account Setup tasks the Brainstorm Assistant signs, so the app can do them unasked. */
export type AutoSetupTask = "duty-menu" | "treasure-map";

/** What `useAssistantDutyMenu` knows, as far as the rule needs it. */
export interface MenuView {
  supported: boolean | undefined;
  status: MenuStatus | null;
  settled: boolean;
}

/** What `useAssistantTreasureMap` knows, as far as the rule needs it. */
export interface MapView {
  supported: boolean | undefined;
  status: SelfMapStatus | null;
  settled: boolean;
  /** The owner's choice on the server: list the live duties (on) or none (off). */
  on: boolean;
  /** A version has been published — truthy when one was found. */
  published: unknown;
}

const due = (status: MenuStatus | SelfMapStatus | null) => status === "missing" || status === "out-of-date";

/**
 * Which tasks are due for the app to publish by itself
 * (components/AutoAssistantSetup): each one the server supports, whose state
 * the relays have answered, and that isn't up to date.
 *
 * The Treasure Map is turned on only when no version was ever published, and
 * updated only while on. Off with a version published is the owner's choice
 * (they removed its duties) and stays theirs.
 */
export function autoSetupTasks(menu: MenuView, map: MapView): AutoSetupTask[] {
  const tasks: AutoSetupTask[] = [];
  if (menu.supported === true && menu.settled && due(menu.status)) tasks.push("duty-menu");
  if (map.supported === true && map.settled && due(map.status) && (map.on || !map.published)) {
    tasks.push("treasure-map");
  }
  return tasks;
}
