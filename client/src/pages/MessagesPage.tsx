/**
 * Private messages (NIP-17): the conversation list, one chat, and who it's
 * with. `/messages`, `/messages/requests`, `/messages/new`, and
 * `/messages/<npub>[+<npub>…]` for a chat — a room is the set of people in it,
 * so its URL is just them.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useParams, useSearch } from "wouter";
import { MessageSquare } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { useActiveAccountDisplay } from "@/hooks/useActiveAccountDisplay";
import { useEditingText } from "@/hooks/useEditingText";
import { useToast } from "@/hooks/use-toast";
import { logout } from "@/accounts/login-flow";
import { useDmEngine, useDmPrefs, useDmState, useShelves } from "@/hooks/useDirectMessages";
import { useMyFollows } from "@/hooks/useMyFollows";
import { useSocialActions } from "@/hooks/useSocialActions";
import { useLiveProfiles } from "@/hooks/useLiveProfile";
import { relayAuthAllowed, relayAuthChanged$, setRelayAuthAllowed } from "@/lib/relayAuthPref";
import { setRelayAuthInteractive } from "@/services/relayAuth";
import { roomKeyFromSlug } from "@/lib/dm/rooms";
import { acceptRoom, archiveRoom, hideRoom } from "@/lib/dm/prefs";
import type { DmMessage } from "@/lib/dm/store";
import type { SendResult } from "@/services/dm/engine";
import { ConversationList, type InboxTab } from "@/components/messages/ConversationList";
import { ChatView } from "@/components/messages/ChatView";
import { ChatInfo } from "@/components/messages/ChatInfo";
import { NewMessage } from "@/components/messages/NewMessage";
import { MessageDetailsDialog } from "@/components/messages/MessageDetailsDialog";
import { InboxNotices, InboxSetup, OpeningStatus } from "@/components/messages/InboxStatus";
import { nameOf } from "@/components/messages/people";
import { cn } from "@/lib/utils";

function useRelayAuthAllowed(pubkey: string): boolean {
  const [allowed, setAllowed] = useState(() => (pubkey ? relayAuthAllowed(pubkey) : false));
  useEffect(() => {
    setAllowed(pubkey ? relayAuthAllowed(pubkey) : false);
    const sub = relayAuthChanged$.subscribe(() => setAllowed(pubkey ? relayAuthAllowed(pubkey) : false));
    return () => sub.unsubscribe();
  }, [pubkey]);
  return allowed;
}

export default function MessagesPage() {
  const user = useActiveAccountDisplay();
  const me = user?.pubkey ?? "";
  const params = useParams<{ slug?: string }>();
  const search = useSearch();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const engine = useDmEngine();
  const state = useDmState(engine);
  const prefs = useDmPrefs(me || undefined);
  const social = useSocialActions(me || undefined);
  const shelves = useShelves(engine);
  const { follows } = useMyFollows();
  const authAllowed = useRelayAuthAllowed(me);
  const [details, setDetails] = useState<DmMessage | null>(null);
  const [infoOpen, setInfoOpen] = useState(true);

  // Opening Messages is the reader asking to read: an extension or a remote
  // signer starts opening what arrived (services/dm/engine).
  useEffect(() => {
    engine?.allowDecrypt();
  }, [engine]);
  // …and inbox relays waiting on a login may ask for one, even if that means unlocking.
  useEffect(() => {
    setRelayAuthInteractive(true);
    return () => setRelayAuthInteractive(false);
  }, []);

  const slug = params.slug;
  const composing = slug === "new";
  const roomKey = slug && !composing && slug !== "requests" && me ? roomKeyFromSlug(slug, me) : null;
  const subject = new URLSearchParams(search).get("subject") ?? undefined;

  const allRooms = useMemo(
    () => [...shelves.chats, ...shelves.archived, ...shelves.requests, ...shelves.low, ...shelves.flagged],
    [shelves],
  );
  const room = roomKey ? allRooms.find((r) => r.key === roomKey) : undefined;
  const shelf = !roomKey
    ? "chat"
    : shelves.requests.some((r) => r.key === roomKey)
      ? "request"
      : shelves.low.some((r) => r.key === roomKey)
        ? "low"
        : shelves.flagged.some((r) => r.key === roomKey)
          ? "flagged"
          : "chat";
  // An open request keeps the Requests list beside it.
  const tab: InboxTab = slug === "requests" || (roomKey && shelf !== "chat" && !room?.hasMine) ? "requests" : "chats";

  const people = useMemo(() => {
    const set = new Set<string>();
    for (const r of allRooms.slice(0, 200)) for (const pk of r.participants) set.add(pk);
    if (roomKey) for (const pk of roomKey.split(",")) set.add(pk);
    return [...set];
  }, [allRooms, roomKey]);
  const profiles = useLiveProfiles(people);

  const allowAuth = useCallback(() => {
    if (!me) return;
    setRelayAuthAllowed(me, true);
    toast({ title: "Signing in to your inbox relays", description: "Your signer may ask you to approve each one." });
  }, [me, toast]);

  const sendError = useCallback(
    (result: SendResult) => {
      if (result.error === "Cancelled") return;
      toast({
        title: "Message not sent",
        description: result.missing?.length
          ? `${result.missing.map((pk) => nameOf(pk, profiles)).join(", ")} can't receive private messages yet — they have no inbox relays.`
          : result.error,
        variant: "destructive",
      });
    },
    [profiles, toast],
  );

  const archive = () => {
    if (!roomKey) return;
    archiveRoom(me, roomKey, room?.lastAt ?? Math.floor(Date.now() / 1000));
    toast({ title: "Chat archived", description: "It comes back when someone writes." });
    navigate("/messages");
  };

  const block = async (pubkey: string) => {
    const outcome = await social.mute(pubkey);
    if (!outcome.success && !("cancelled" in outcome && outcome.cancelled)) {
      toast({ title: "Couldn't block", description: outcome.error, variant: "destructive" });
      return;
    }
    if (roomKey) hideRoom(me, roomKey, room?.lastAt ?? Math.floor(Date.now() / 1000));
    navigate("/messages/requests");
  };

  const showChat = !!roomKey || composing;
  const setup = state.status === "no-inbox";
  const editing = useEditingText();

  return (
    <div
      className={cn(
        "flex flex-col bg-background text-foreground",
        // The phone tab bar steps aside while a field has focus but keeps its share of the
        // bottom chrome (MobileTabBar). This page is one screen tall with the composer at
        // its foot, so take that share back while typing — else it's an empty band under
        // the composer. The negative margin cancels the body padding still reserved for it.
        editing
          ? "mb-[calc(-1*var(--bs-chrome-tabbar,0px))] h-[calc(100dvh-var(--bs-bottom-chrome,0px)+var(--bs-chrome-tabbar,0px))]"
          : "h-[calc(100dvh-var(--bs-bottom-chrome,0px))]",
      )}
    >
      {/* On a phone Messages is the whole screen: the tab bar below is the way
          around, and a chat has its own back arrow. */}
      {user && (
        <div className="hidden md:block">
          <AppHeader user={user} onLogout={() => logout()} layout="app" />
        </div>
      )}
      <main
        className={cn(
          "grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] md:grid-cols-[340px_minmax(0,1fr)]",
          roomKey && infoOpen && "xl:grid-cols-[340px_minmax(0,1fr)_300px]",
        )}
        data-testid="page-messages"
      >
        <div className={cn("min-h-0 min-w-0 flex-col md:flex", showChat ? "hidden" : "flex")}>
          {setup && (
            <div className="flex min-h-0 flex-1 overflow-y-auto md:hidden">
              <InboxSetup />
            </div>
          )}
          {/* On a phone the setup card is the whole screen until it's done: with no inbox
              relays nothing can arrive and nothing can be sent, and card plus list don't
              fit one screen — the list's tabs ended up under the tab bar. */}
          <div className={setup ? "hidden md:contents" : "contents"}>
            <ConversationList
              engine={engine}
              state={state}
              shelves={shelves}
              prefs={prefs}
              profiles={profiles}
              me={me}
              selectedKey={roomKey}
              tab={tab}
              onSignIn={allowAuth}
              notices={
                <>
                  <InboxNotices engine={engine} state={state} authAllowed={authAllowed} onAllowAuth={allowAuth} />
                  <OpeningStatus state={state} />
                </>
              }
            />
          </div>
        </div>

        {composing ? (
          <NewMessage me={me} onBack={() => navigate("/messages")} />
        ) : roomKey ? (
          <ChatView
            key={roomKey}
            engine={engine}
            state={state}
            roomKey={roomKey}
            room={room}
            me={me}
            profiles={profiles}
            scoreOf={shelves.scoreOf}
            prefs={prefs}
            shelf={shelf}
            initialSubject={subject}
            onBack={() => navigate(shelf === "chat" ? "/messages" : "/messages/requests")}
            onAccept={() => acceptRoom(me, roomKey)}
            onDelete={() => {
              hideRoom(me, roomKey, room?.lastAt ?? 0);
              navigate("/messages/requests");
            }}
            onBlock={() => void block(roomKey.split(",").find((pk) => pk !== me) ?? "")}
            onDetails={setDetails}
            onToggleInfo={() => setInfoOpen((v) => !v)}
            onArchive={archive}
            onSignIn={allowAuth}
            authAllowed={authAllowed}
            sendError={sendError}
          />
        ) : setup ? (
          <div className="hidden min-h-0 md:flex">
            <InboxSetup />
          </div>
        ) : (
          <div className="hidden min-h-0 flex-col items-center justify-center gap-3 text-slate-500 dark:text-slate-400 md:flex">
            <MessageSquare className="h-8 w-8" />
            <p className="text-sm">Pick a chat, or start a new one.</p>
          </div>
        )}

        {roomKey && infoOpen && (
          <div className="hidden min-h-0 min-w-0 xl:flex xl:flex-col">
            <ChatInfo
              roomKey={roomKey}
              subject={room?.subject ?? subject}
              me={me}
              profiles={profiles}
              scoreOf={shelves.scoreOf}
              follows={follows}
              onArchive={archive}
              onBlock={(pk) => void block(pk)}
            />
          </div>
        )}
      </main>
      <MessageDetailsDialog message={details} me={me} profiles={profiles} onClose={() => setDetails(null)} />
    </div>
  );
}
