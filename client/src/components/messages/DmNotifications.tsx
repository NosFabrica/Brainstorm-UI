/**
 * Mounted once for the whole app: the unread count in the tab title, and a
 * chime and a browser notification for new messages while Brainstorm is open
 * (lib/dm/notify decides which). Push for a closed tab needs a server that
 * knows when a message arrives — the Brainstorm inbox relay, later.
 */
import { useEffect, useMemo, useRef } from "react";
import { useLocation } from "wouter";
import { useDmEngine, useDmPrefs, useShelves } from "@/hooks/useDirectMessages";
import { notifiable, notificationText, type NotifyContext } from "@/lib/dm/notify";
import type { RoomShelf } from "@/lib/dm/inbox";
import { roomKeyFromSlug, roomSlug } from "@/lib/dm/rooms";
import { setTitleCount } from "@/lib/titleBadge";
import { playChime } from "@/lib/chime";
import { eventStore } from "@/lib/eventStore";
import { profileContentOf } from "@/lib/profileContent";
import { shortNpub } from "./people";

function nameFromStore(pubkey: string): string {
  const p = profileContentOf(eventStore.getReplaceable(0, pubkey) as never);
  return (p?.display_name || p?.name || "").trim() || shortNpub(pubkey);
}

export function DmNotifications() {
  const engine = useDmEngine();
  const me = engine?.pubkey ?? "";
  const prefs = useDmPrefs(me || undefined);
  const shelves = useShelves(engine);
  const [location, navigate] = useLocation();

  useEffect(() => {
    setTitleCount(shelves.badge);
  }, [shelves.badge]);
  useEffect(() => () => setTitleCount(0), []);

  const shelfByRoom = useMemo(() => {
    const m = new Map<string, RoomShelf>();
    for (const r of shelves.chats) m.set(r.key, "chat");
    for (const r of shelves.requests) m.set(r.key, "request");
    for (const r of shelves.low) m.set(r.key, "low");
    for (const r of shelves.flagged) m.set(r.key, "flagged");
    return m;
  }, [shelves]);

  const viewingSlug = location.startsWith("/messages/") ? location.slice("/messages/".length) : null;
  const viewing = viewingSlug && me ? roomKeyFromSlug(viewingSlug, me) : null;

  // The store notifies on every change; read the latest of everything through a ref.
  const latest = useRef({ shelfByRoom, prefs, viewing, navigate });
  latest.current = { shelfByRoom, prefs, viewing, navigate };

  useEffect(() => {
    if (!engine) return;
    const since = Math.floor(Date.now() / 1000);
    const seen = new Set<string>();
    const check = () => {
      const { shelfByRoom, prefs, viewing, navigate } = latest.current;
      const ctx: NotifyContext = {
        me: engine.pubkey,
        since,
        shelfOf: (room) => shelfByRoom.get(room),
        mutedRooms: new Set(prefs.muted),
        viewing: document.visibilityState === "visible" ? viewing : null,
      };
      let chimed = false;
      for (const room of engine.store.rooms()) {
        if (room.lastAt < since - 300) break; // rooms come newest first
        for (const m of room.messages.slice(-5)) {
          if (seen.has(m.id)) continue;
          seen.add(m.id);
          if (!notifiable(m, ctx)) continue;
          if (prefs.notify.sound && !chimed) {
            playChime();
            chimed = true;
          }
          if (!prefs.notify.desktop || typeof Notification === "undefined" || Notification.permission !== "granted")
            continue;
          if (document.visibilityState === "visible" && viewing) continue;
          const others = room.participants.filter((pk) => pk !== engine.pubkey);
          const text = notificationText(m, {
            sender: nameFromStore(m.author),
            group: others.length > 1 ? room.subject || `${others.length + 1} people` : undefined,
            request: ctx.shelfOf(room.key) === "request",
            preview: prefs.notify.preview,
          });
          try {
            const n = new Notification(text.title, { body: text.body, tag: room.key, icon: "/favicon.png" });
            n.onclick = () => {
              window.focus();
              navigate(`/messages/${roomSlug(room.key, engine.pubkey)}`);
              n.close();
            };
          } catch {
            /* some mobile browsers only notify from a service worker */
          }
        }
      }
    };
    // What's already here at mount is history.
    for (const room of engine.store.rooms()) for (const m of room.messages) seen.add(m.id);
    // A new room's shelf comes from React (trust, follows): look once it has rendered.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const stop = engine.store.subscribe(() => {
      if (timer === undefined)
        timer = setTimeout(() => {
          timer = undefined;
          check();
        }, 300);
    });
    return () => {
      stop();
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [engine]);

  return null;
}
