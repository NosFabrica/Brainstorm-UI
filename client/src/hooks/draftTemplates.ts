import { createContext, useContext } from "react";
import type { UrlTemplate } from "@/lib/linkTemplates";

/**
 * URL templates drafted but not yet published, by their stand-in ids
 * (lib/templateDrafts). A preview provides them, so its renderers draw a
 * draft's links as they will be; useLinkTemplates answers for them without
 * asking a relay.
 */
export const DraftTemplatesContext = createContext<ReadonlyMap<string, UrlTemplate>>(new Map());

export const useDraftTemplates = () => useContext(DraftTemplatesContext);
