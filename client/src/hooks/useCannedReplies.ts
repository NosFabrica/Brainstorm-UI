import { useState } from "react";
import { listCanned, removeCanned, saveCanned, updateCanned, type CannedReply } from "@/lib/cannedReplies";

/** The device's canned replies, re-read after every change. */
export function useCannedReplies() {
  const [canned, setCanned] = useState<CannedReply[]>(listCanned);
  const refresh = () => setCanned(listCanned());
  return {
    canned,
    save: (body: string) => {
      saveCanned("", body);
      refresh();
    },
    update: (id: string, body: string) => {
      updateCanned(id, body);
      refresh();
    },
    remove: (id: string) => {
      removeCanned(id);
      refresh();
    },
  };
}
