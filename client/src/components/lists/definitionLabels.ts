/**
 * What each definition of a list is called where a reader chooses between
 * them: adding an item (ItemComposer) and checking the items (ListItems).
 */
import type { DefinitionSource } from "@/lib/conceptResolution";

export const SOURCE_LABEL: Record<DefinitionSource, string> = {
  community: "The list's own",
  house: "Brainstorm's copy",
  assistant: "Your Assistant's copy",
  personal: "Your version",
};
