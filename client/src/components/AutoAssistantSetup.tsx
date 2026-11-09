import { useEffect, useRef } from "react";
import { useActiveAccountDisplay } from "@/hooks/useActiveAccountDisplay";
import { useAssistantDutyMenu } from "@/hooks/useAssistantDutyMenu";
import { useAssistantProfile } from "@/hooks/useAssistantProfile";
import { useAssistantTreasureMap } from "@/hooks/useAssistantTreasureMap";
import { useHasSession } from "@/hooks/useHasSession";
import { autoSetupTasks } from "@/lib/assistantSetupAuto";

/**
 * Account Setup's Assistant tasks, done for the user wherever they are: the
 * Assistant's profile, so it's live, then its Duty Menu and its own Treasure
 * Map. The Brainstorm Assistant signs all three on the server, so nothing here
 * asks the user to sign — the same POSTs Settings and /setup send when pressed.
 *
 * The profile is for every account, however it signed in: the server makes
 * the Assistant's key at sign-in, and publishing its profile is what brings it
 * to life. Never over a profile that exists, and never following it — that
 * would change the user's own follow list.
 *
 * Which are due is `autoSetupTasks`: missing or out of date, once the relays
 * have answered, and never a Treasure Map its owner turned off. Each is asked
 * once for what it should say now — the offer, or the self-entries — and again
 * only when that changes (an activation mid-visit, a new release). A failure
 * isn't retried until the next app load; meanwhile /setup shows the step, so
 * the manual page is the fallback. Account Setup sees these publishes through
 * the hooks' shared `publishing` / `lastPublish`, so it doesn't count a step
 * that is being done.
 *
 * Renders nothing; mount once at the app root.
 */
export function AutoAssistantSetup() {
  const user = useActiveAccountDisplay();
  // Both routes need a Brainstorm session.
  const pk = useHasSession() ? user?.pubkey : undefined;
  const menu = useAssistantDutyMenu(pk);
  const map = useAssistantTreasureMap(pk);
  const profile = useAssistantProfile(pk);
  const asked = useRef(new Set<string>());

  const due = pk ? autoSetupTasks(menu, map, profile) : [];
  const profileAsk = due.includes("assistant-profile") ? `${pk}|assistant-profile|${profile.taPubkey}` : null;
  const menuAsk = due.includes("duty-menu") ? `${pk}|duty-menu|${JSON.stringify(menu.offer)}` : null;
  const mapAsk = due.includes("treasure-map") ? `${pk}|treasure-map|${JSON.stringify(map.shouldSay)}` : null;

  useEffect(() => {
    if (!profileAsk || asked.current.has(profileAsk)) return;
    asked.current.add(profileAsk);
    void profile.publish().catch(() => {
      /* /setup shows the step; asked again on the next load */
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `profileAsk` names everything the publish depends on
  }, [profileAsk]);

  useEffect(() => {
    if (!menuAsk || asked.current.has(menuAsk)) return;
    asked.current.add(menuAsk);
    void menu.publish().catch(() => {
      /* /setup shows the step; asked again on the next load */
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `menuAsk` names everything the publish depends on
  }, [menuAsk]);

  useEffect(() => {
    if (!mapAsk || asked.current.has(mapAsk)) return;
    asked.current.add(mapAsk);
    void map.set(true).catch(() => {
      /* /setup shows the step; asked again on the next load */
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `mapAsk` names everything the press depends on
  }, [mapAsk]);

  return null;
}
