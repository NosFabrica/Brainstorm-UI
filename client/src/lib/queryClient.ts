import { onRecover, type Recovery } from "@/lib/serverStatus";
import { dropPersistedQueries, startQueryPersistence } from "@/lib/queryPersist";
import { QueryClient, QueryFunction, type Query } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(method: string, url: string, data?: unknown | undefined): Promise<Response> {
  const res = await fetch(url, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: { on401: UnauthorizedBehavior }) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

/**
 * Clearing the cache is how the app forgets an Account — sign-out, a switch,
 * another tab's switch — so it is also where the copy kept on the device goes
 * (lib/queryPersist). One override rather than a call at each of those sites,
 * so a new one can't forget it.
 */
class AppQueryClient extends QueryClient {
  clear(): void {
    super.clear();
    dropPersistedQueries();
  }
}

export const queryClient = new AppQueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      // Kept half an hour after the last screen reading it goes: the default
      // five minutes meant six minutes of searching sent the dashboard back to
      // skeletons and a refetch of answers that had not moved.
      gcTime: 30 * 60_000,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});

/**
 * The reads an API outage may have spoiled: those that failed, and those
 * answered after the trouble began (a read that swallows its error into an
 * empty answer counts as a success).
 */
export function spoiledDuring(query: Query, since: number): boolean {
  if (query.state.status === "error") return true;
  return query.state.dataUpdatedAt >= since || query.state.errorUpdatedAt >= since;
}

// The API came back after an outage: refetch what the pages asked for while it
// was down, so they refill without a reload (lib/serverStatus). Only the API's
// return, and only those reads: the search relay reconnecting (most mobile
// resumes) touches no HTTP read, and an answer from before the outage is as
// good as it was.
onRecover((recovery: Recovery) => {
  if (recovery.scope !== "api") return;
  void queryClient.invalidateQueries({ predicate: (query) => spoiledDuring(query, recovery.since) });
});

// The signed-in reader's own slow reads, restored from the device at boot and
// kept as they land (lib/queryPersist). The accounts module is loaded lazily
// so this file — imported by every test that touches the cache — doesn't
// bootstrap accounts for them; it's in the entry already, so this resolves at
// once in the app.
if (import.meta.env.MODE !== "test" && typeof indexedDB !== "undefined") {
  void import("@/accounts")
    .then(({ accountManager }) => startQueryPersistence(queryClient, accountManager))
    .catch(() => undefined);
}
