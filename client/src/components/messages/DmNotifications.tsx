/**
 * Mounted once for the whole app: the unread count in the tab title and on the
 * installed app's icon, and a chime and a notification for new messages while
 * Brainstorm is open (lib/dm/notify decides which). Notifications go through
 * the service worker, the only way onto a phone's tray (lib/serviceWorker).
 * Push for a closed app needs a server that knows when a message arrives — the
 * Brainstorm inbox relay, later.
 */
import { useEffect, useMemo, useRef } from "react";
import { useLocation, useSearch } from "wouter";
import { useDmEngine, useDmPrefs, useShelves } from "@/hooks/useDirectMessages";
import {
  notifiable,
  notificationAccount,
  notificationText,
  notificationUrl,
  type NotifyContext,
} from "@/lib/dm/notify";
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

/** Shown without a worker (`new Notification`), so the worker's list doesn't have them. */
const shownHere = new Set<Notification>();

type NotificationList = { getNotifications(): Promise<{ data?: unknown; close(): void }[]> };

/**
 * Close the message notifications of every account but `keep` — all of them on
 * sign-out. Left in the tray past a switch, a tap opened the chat as whoever was
 * signed in by then.
 */
export async function closeMessageNotifications(keep: string | undefined, registration?: NotificationList | null) {
  const stale = (url: unknown) =>
    typeof url === "string" && url.startsWith("/messages/") && (!keep || notificationAccount(url) !== keep);
  for (const n of [...shownHere]) {
    if (!stale((n.data as { url?: unknown } | null)?.url)) continue;
    n.close();
    shownHere.delete(n);
  }
  const reg =
    registration ??
    (typeof navigator !== "undefined" && navigator.serviceWorker
      ? await navigator.serviceWorker.getRegistration().catch(() => undefined)
      : undefined);
  const shown = await reg?.getNotifications().catch(() => []);
  for (const n of shown ?? []) if (stale((n.data as { url?: unknown } | null)?.url)) n.close();
}

/** Someone is looking at this tab right now. */
const attending = () => document.visibilityState === "visible" && document.hasFocus();

export function DmNotifications() {
  const engine = useDmEngine();
  const me = engine?.pubkey ?? "";
  const prefs = useDmPrefs(me || undefined);
  const shelves = useShelves(engine);
  const [location, navigate] = useLocation();
  const search = useSearch();

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
  // A notification tapped while the app was open (or opened by it) comes back as a path —
  // ignored when it was shown to another account than the one signed in now.
  const meRef = useRef(me);
  meRef.current = me;
  useEffect(
    () =>
      onOpenUrl((url) => {
        const shownTo = notificationAccount(url);
        if (shownTo && shownTo !== meRef.current) return;
        latest.current.navigate(url);
      }),
    [],
  );
  // Opened cold by a tap (the worker opened this window on the path): the same rule.
  const shownTo = location.startsWith("/messages/") ? new URLSearchParams(search).get("as") : null;
  useEffect(() => {
    if (shownTo && me && shownTo !== me) navigate("/messages", { replace: true });
  }, [shownTo, me, navigate]);
  // A switch or a sign-out: the tray keeps only the account signed in now. Not at boot,
  // before the engine has loaded: what's in the tray then is still this account's.
  const before = useRef(me);
  useEffect(() => {
    const was = before.current;
    before.current = me;
    if (was && was !== me) void closeMessageNotifications(me || undefined).catch(() => {});
  }, [me]);
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
          const url = notificationUrl(roomSlug(room.key, engine.pubkey), engine.pubkey);
          void showAppNotification(text.title, { body: text.body, tag: room.key, url })
            .catch(() => false)
            .then((shown) => {
              if (shown) return;
              try {
                // No worker (development, or a browser without one): desktops still take this.
                const n = new Notification(text.title, {
                  body: text.body,
                  tag: room.key,
                  icon: "/icons/icon-192.png",
                  data: { url },
                });
                shownHere.add(n);
                n.onclose = () => shownHere.delete(n);
                n.onclick = () => {
                  window.focus();
                  if (meRef.current === engine.pubkey) latest.current.navigate(url);
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
