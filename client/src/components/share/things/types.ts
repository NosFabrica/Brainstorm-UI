import type { ThingDetail } from "@/lib/thing";

/** The per-kind detail one page draws. */
export type Detail<T extends ThingDetail["type"]> = Extract<ThingDetail, { type: T }>;
