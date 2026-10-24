import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { signingProblem } from "@/accounts/signing";
import { ASSISTANT_TAGS, type AssistantTagKey } from "@/config/assistants";
import { useToast } from "@/hooks/use-toast";
import { changeAssistantTag, disownAssistant, tagAsAssistant, type AssistantDefinitions } from "@/services/assistants";

/** The press under way: which profile, what it does, and to which tag. */
export interface AssistantPress {
  kind: "tag" | "change" | "disown";
  pubkey: string;
  key?: AssistantTagKey;
}

export interface AssistantActions {
  busy: AssistantPress | null;
  tag: (pubkey: string, name: string, key: AssistantTagKey) => void;
  change: (pubkey: string, name: string, from: AssistantTagKey, to: AssistantTagKey) => void;
  disown: (pubkey: string, name: string, keys: AssistantTagKey[]) => void;
}

export const tagName = (key: AssistantTagKey) => ASSISTANT_TAGS.find((t) => t.key === key)?.name ?? key;

/**
 * The Assistant actions (services/assistants) as the tab presses them: one at
 * a time — every action waits while one publishes — each said in a toast, and
 * a signer's cancel said not at all (the reader knows).
 *
 * The tab reads from the EventStore, where a publish lands at once. The tag
 * reads elsewhere — a profile's tags, the reader's own — are react-query's,
 * so those are refreshed.
 */
export function useAssistantActions(definitions: AssistantDefinitions): AssistantActions {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<AssistantPress | null>(null);

  const press = async (what: AssistantPress, act: () => Promise<void>) => {
    if (busy) return;
    setBusy(what);
    try {
      await act();
    } catch (error) {
      const fallback = error instanceof Error && error.message ? error.message : "No relay took it. Try again.";
      const problem = signingProblem(error, fallback);
      if (problem) toast({ title: "That didn’t go out", description: problem, variant: "destructive" });
    } finally {
      setBusy(null);
      void queryClient.invalidateQueries({ queryKey: ["profile-tags", what.pubkey] });
      void queryClient.invalidateQueries({ queryKey: ["my-assertions"] });
    }
  };

  return {
    busy,
    tag: (pubkey, name, key) =>
      void press({ kind: "tag", pubkey, key }, async () => {
        await tagAsAssistant(pubkey, key, definitions);
        toast({ title: `Tagged ${name} as ${tagName(key)}` });
      }),
    change: (pubkey, name, from, to) =>
      void press({ kind: "change", pubkey, key: to }, async () => {
        const { undisputed } = await changeAssistantTag(pubkey, from, to, definitions);
        if (!undisputed) {
          toast({ title: `${name} is now tagged ${tagName(to)}` });
          return;
        }
        toast({
          title: `Tagged ${name} as ${tagName(to)}`,
          description: `Saying it isn’t ${tagName(from)} didn’t go out, so it carries both tags for now.`,
          variant: "destructive",
        });
      }),
    disown: (pubkey, name, keys) =>
      void press({ kind: "disown", pubkey }, async () => {
        const { failed, error } = await disownAssistant(pubkey, keys, definitions);
        if (failed.length === keys.length) throw error;
        if (!failed.length) {
          toast({ title: `${name} is no longer one of your Assistants` });
          return;
        }
        toast({
          title: `${name} is no longer ${keys
            .filter((k) => !failed.includes(k))
            .map(tagName)
            .join(" or ")}`,
          description: `It’s still tagged ${failed.map(tagName).join(" and ")}: that one didn’t go out.`,
          variant: "destructive",
        });
      }),
  };
}
