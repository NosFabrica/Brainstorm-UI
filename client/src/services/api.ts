const BRAINSTORM_API =
  import.meta.env.VITE_API_URL || "https://brainstormserver.nosfabrica.com";

let isReauthenticating = false;
let reauthPromise: Promise<boolean> | null = null;
let isRedirectingToLogin = false;

export function isAuthRedirecting(): boolean {
  return isRedirectingToLogin;
}

function handleUnauthorized() {
  isRedirectingToLogin = true;
  localStorage.removeItem("brainstorm_session_token");
  localStorage.removeItem("nostr_user");
  window.location.href = "/";
}

async function waitForNostrExtension(maxWait = 3000): Promise<boolean> {
  if (window.nostr) return true;
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    await new Promise((r) => setTimeout(r, 100));
    if (window.nostr) return true;
  }
  return false;
}

async function silentReauth(): Promise<boolean> {
  if (isReauthenticating && reauthPromise) return reauthPromise;

  isReauthenticating = true;
  reauthPromise = (async () => {
    try {
      const storedUser = localStorage.getItem("nostr_user");
      if (!storedUser) return false;

      const user = JSON.parse(storedUser);
      if (!user?.pubkey) return false;

      const extensionReady = await waitForNostrExtension();
      if (!extensionReady) return false;

      const challengeResponse = await fetch(
        `${BRAINSTORM_API}/authChallenge/${user.pubkey}`,
      );
      if (!challengeResponse.ok) return false;
      const challengeData = await challengeResponse.json();
      const challenge = challengeData?.data?.challenge;
      if (!challenge) return false;

      const event = {
        kind: 22242,
        tags: [
          ["t", "brainstorm_login"],
          ["challenge", challenge],
        ],
        content: "",
        created_at: Math.floor(Date.now() / 1000),
        pubkey: user.pubkey,
      };

      const signedEvent = await window.nostr!.signEvent(event);

      const verifyResponse = await fetch(
        `${BRAINSTORM_API}/authChallenge/${user.pubkey}/verify`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ signed_event: signedEvent }),
        },
      );
      if (!verifyResponse.ok) return false;
      const verifyData = await verifyResponse.json();
      const token = verifyData?.data?.token;
      if (!token) return false;

      localStorage.setItem("brainstorm_session_token", token);
      return true;
    } catch {
      return false;
    } finally {
      isReauthenticating = false;
      reauthPromise = null;
    }
  })();

  return reauthPromise;
}

async function authenticatedFetch(
  url: string,
  options: RequestInit = {},
): Promise<Response> {
  let token = localStorage.getItem("brainstorm_session_token");
  if (!token) {
    const reauthOk = await silentReauth();
    if (!reauthOk) {
      handleUnauthorized();
      throw new Error("No session token found");
    }
    token = localStorage.getItem("brainstorm_session_token");
  }
  const response = await fetch(url, {
    ...options,
    headers: { ...options.headers, access_token: token! },
  });
  if (response.status === 401) {
    const data = await response.json().catch(() => null);
    const detail = data?.detail || data?.message || "";
    const reauthOk = await silentReauth();
    if (reauthOk) {
      const newToken = localStorage.getItem("brainstorm_session_token");
      const retryResponse = await fetch(url, {
        ...options,
        headers: { ...options.headers, access_token: newToken! },
      });
      if (retryResponse.status === 401 || retryResponse.status === 403) {
        handleUnauthorized();
        throw new Error("Session expired. Please log in again.");
      }
      return retryResponse;
    }
    handleUnauthorized();
    throw new Error(detail || "Session expired. Please log in again.");
  }
  if (response.status === 403) {
    const data = await response.json().catch(() => null);
    const detail = data?.detail || data?.message || "";
    throw new Error(detail || `Request forbidden (${response.status})`);
  }
  return response;
}

export const apiClient = {
  async getAuthChallenge(pubkey: string): Promise<string> {
    const response = await fetch(`${BRAINSTORM_API}/authChallenge/${pubkey}`);
    if (!response.ok) {
      throw new Error(`Failed to get auth challenge (${response.status})`);
    }
    const data = await response.json();
    if (!data?.data?.challenge) {
      throw new Error("Invalid challenge response from server");
    }
    return data.data.challenge;
  },

  async verifyAuthChallenge(pubkey: string, signedEvent: any) {
    const response = await fetch(
      `${BRAINSTORM_API}/authChallenge/${pubkey}/verify`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signed_event: signedEvent }),
      },
    );
    if (!response.ok) {
      throw new Error(`Auth verification failed (${response.status})`);
    }
    const data = await response.json();
    if (!data?.data?.token) {
      throw new Error("No token received from server");
    }
    return data;
  },

  async getSelf() {
    const response = await authenticatedFetch(`${BRAINSTORM_API}/user/self`, {
      signal: AbortSignal.timeout(60000),
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch user data (${response.status})`);
    }
    return await response.json();
  },

  async getUserByPubkey(pubkey: string) {
    const response = await authenticatedFetch(
      `${BRAINSTORM_API}/user/${pubkey}`,
      {
        signal: AbortSignal.timeout(60000),
      },
    );
    if (!response.ok) {
      throw new Error(`Failed to fetch user data (${response.status})`);
    }
    return await response.json();
  },

  async triggerGrapeRank() {
    const response = await authenticatedFetch(
      `${BRAINSTORM_API}/user/graperank`,
      {
        method: "POST",
      },
    );
    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      const detail = errorData?.detail || errorData?.message || "";
      const status = response.status;
      const lowerDetail = detail.toLowerCase();
      let friendlyMessage: string;
      if (status === 502 || status === 503 || status === 504) {
        friendlyMessage =
          "The Brainstorm server is temporarily unavailable. Please wait a few minutes and try again.";
      } else if (
        status === 429 ||
        lowerDetail.includes("rate") ||
        lowerDetail.includes("too many") ||
        lowerDetail.includes("wait") ||
        lowerDetail.includes("cooldown")
      ) {
        friendlyMessage =
          "Please wait a few minutes before recalculating. The server needs time between requests.";
      } else {
        friendlyMessage =
          "Something went wrong. Please wait a moment and try again.";
      }
      throw new Error(friendlyMessage);
    }
    return await response.json();
  },

  async getGrapeRankResult() {
    const response = await authenticatedFetch(
      `${BRAINSTORM_API}/user/graperankResult`,
    );
    if (!response.ok) {
      throw new Error(`Failed to fetch GrapeRank data (${response.status})`);
    }
    return await response.json();
  },
};
