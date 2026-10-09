/**
 * Mounted once for the whole app: the unread count in the tab title and on the
 * installed app's icon, and a chime and a notification for new messages while
 * Brainstorm is open (lib/dm/notify decides which). Notifications go through
 * the service worker, the only way onto a phone's tray (lib/serviceWorker).
 * Push for a closed app needs a server that knows when a message arrives — the
 * Brainstorm inbox relay, later.
 */
import { useEffect, useMemo, useRef } from "react";
import { useLocation } from "wouter";
import { useDmEngine, useDmPrefs, useShelves } from "@/hooks/useDirectMessages";
import { notifiable, notificationText, type NotifyContext } from "@/lib/dm/notify";
import { writersOf, type RoomShelf } from "@/lib/dm/inbox";
import { lastReadAt } from "@/lib/dm/prefs";
import { roomKeyFromSlug, roomSlug } from "@/lib/dm/rooms";
import { setTitleCount } from "@/lib/titleBadge";
import { setAppBadge } from "@/lib/appBadge";
import { onOpenUrl, showAppNotification } from "@/lib/serviceWorker";
import { playChime } from "@/lib/chime";
import { eventStore } from "@/lib/eventStore";
import { profileContentOf } from "@/lib/profileContent";
import { shortNpub } from "./people";

function nameFromStore(pubkey: string): string {
  const p = profileContentOf(eventStore.getReplaceable(0, pubkey) as never);
  return (p?.display_name || p?.name || "").trim() || shortNpub(pubkey);
}

/** Someone is looking at this tab right now. */
const attending = () => document.visibilityState === "visible" && document.hasFocus();

export function DmNotifications() {
  const engine = useDmEngine();
  const me = engine?.pubkey ?? "";
  const prefs = useDmPrefs(me || undefined);
  const shelves = useShelves(engine);
  const [location, navigate] = useLocation();

  useEffect(() => {
    setTitleCount(shelves.badge);
    setAppBadge(shelves.badge);
  }, [shelves.badge]);
  useEffect(
    () => () => {
      setTitleCount(0);
      setAppBadge(0);
    },
    [],
  );

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
  const latest = useRef({ shelfByRoom, prefs, viewing, navigate, scoreOf: shelves.scoreOf });
  latest.current = { shelfByRoom, prefs, viewing, navigate, scoreOf: shelves.scoreOf };
  // A notification tapped while the app was open (or opened by it) comes back as a path.
  useEffect(() => onOpenUrl((url) => latest.current.navigate(url)), []);
  const recheck = useRef<() => void>(() => {});

  useEffect(() => {
    if (!engine) return;
    const since = Math.floor(Date.now() / 1000);
    const seen = new Set<string>();
    let ready = false;
    const check = () => {
      if (!ready) return;
      const { shelfByRoom, prefs, viewing, scoreOf } = latest.current;
      const ctx: NotifyContext = {
        me: engine.pubkey,
        since,
        shelfOf: (room) => shelfByRoom.get(room),
        mutedRooms: new Set(prefs.muted),
        viewing: attending() ? viewing : null,
      };
      let chimed = false;
      for (const room of engine.store.rooms()) {
        if (room.lastAt < since - 300) break; // rooms come newest first
        const shelf = shelfByRoom.get(room.key);
        // Not shelved yet, or a request whose sender's trust is still loading:
        // decide later — a flagged or low-trust stranger must not chime first.
        const undecided =
          !shelf || (shelf === "request" && writersOf(room, engine.pubkey).some((pk) => scoreOf(pk) === undefined));
        for (const m of room.messages.slice(-5)) {
          if (seen.has(m.id)) continue;
          if (undecided && m.author !== engine.pubkey) continue;
          seen.add(m.id);
          if (m.createdAt <= lastReadAt(prefs, room.key) || !notifiable(m, ctx)) continue;
          if (prefs.notify.sound && !chimed) {
            playChime();
            chimed = true;
          }
          // In the app and looking at it: the chime is enough.
          if (attending()) continue;
          if (!prefs.notify.desktop || typeof Notification === "undefined" || Notification.permission !== "granted")
            continue;
          const others = room.participants.filter((pk) => pk !== engine.pubkey);
          const text = notificationText(m, {
            sender: nameFromStore(m.author),
            group: others.length > 1 ? room.subject || `${others.length + 1} people` : undefined,
            request: shelf === "request",
            preview: prefs.notify.preview,
          });
          const url = `/messages/${roomSlug(room.key, engine.pubkey)}`;
          void showAppNotification(text.title, { body: text.body, tag: room.key, url })
            .catch(() => false)
            .then((shown) => {
              if (shown) return;
              try {
                // No worker (development, or a browser without one): desktops still take this.
                const n = new Notification(text.title, { body: text.body, tag: room.key, icon: "/icons/icon-192.png" });
                n.onclick = () => {
                  window.focus();
                  latest.current.navigate(url);
                  n.close();
                };
              } catch {
                /* a phone with no worker: there is no way onto its tray */
              }
            });
        }
      }
    };
    // A new room's shelf comes from React (trust, follows): look once it has rendered.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const soon = () => {
      if (timer === undefined)
        timer = setTimeout(() => {
          timer = undefined;
          check();
        }, 300);
    };
    recheck.current = soon;
    let alive = true;
    // What this device already had is history, including what the cache brings back.
    void engine.hydrated().then(() => {
      if (!alive) return;
      for (const room of engine.store.rooms()) for (const m of room.messages) seen.add(m.id);
      ready = true;
    });
    const stop = engine.store.subscribe(soon);
    return () => {
      alive = false;
      recheck.current = () => {};
      stop();
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [engine]);

  // Trust settled or a room moved shelves: messages held back can be decided now.
  useEffect(() => recheck.current(), [shelfByRoom]);

  return null;
}
