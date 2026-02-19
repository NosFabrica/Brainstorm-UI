function handleUnauthorized() {
  localStorage.removeItem("brainstorm_session_token");
  localStorage.removeItem("nostr_user");
  window.location.href = "/";
}

async function authenticatedFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = localStorage.getItem('brainstorm_session_token');
  if (!token) {
    handleUnauthorized();
    throw new Error("No session token found");
  }
  const response = await fetch(url, {
    ...options,
    headers: { ...options.headers, 'x-brainstorm-token': token }
  });
  if (response.status === 401 || response.status === 403) {
    const data = await response.json().catch(() => null);
    const detail = data?.detail || data?.message || "";
    const isExpired = response.status === 401 ||
      detail.toLowerCase().includes("expired") ||
      detail.toLowerCase().includes("invalid token") ||
      detail.toLowerCase().includes("unauthorized");
    if (isExpired && response.status === 401) {
      handleUnauthorized();
      throw new Error("Session expired. Please log in again.");
    }
    if (response.status === 403) {
      throw new Error(detail || `Request forbidden (${response.status})`);
    }
  }
  return response;
}

export const apiClient = {
  async getAuthChallenge(pubkey: string): Promise<string> {
    const response = await fetch(`/api/auth/challenge/${pubkey}`);
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
    const response = await fetch(`/api/auth/verify/${pubkey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ signed_event: signedEvent })
    });
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
    const response = await authenticatedFetch(`/api/auth/self`);
    if (!response.ok) {
      throw new Error(`Failed to fetch user data (${response.status})`);
    }
    return await response.json();
  },

  async getUserByPubkey(pubkey: string) {
    const response = await authenticatedFetch(`/api/user/${pubkey}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch user data (${response.status})`);
    }
    return await response.json();
  },

  async triggerGrapeRank() {
    const response = await authenticatedFetch(`/api/auth/graperank`, {
      method: 'POST',
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      const detail = errorData?.detail || errorData?.message || "";
      const status = response.status;
      const lowerDetail = detail.toLowerCase();
      let friendlyMessage: string;
      if (status === 502 || status === 503 || status === 504) {
        friendlyMessage = "The Brainstorm server is temporarily unavailable. Please wait a few minutes and try again.";
      } else if (status === 429 || lowerDetail.includes("rate") || lowerDetail.includes("too many") || lowerDetail.includes("wait") || lowerDetail.includes("cooldown")) {
        friendlyMessage = "Please wait a few minutes before recalculating. The server needs time between requests.";
      } else {
        friendlyMessage = "Something went wrong. Please wait a moment and try again.";
      }
      throw new Error(friendlyMessage);
    }
    return await response.json();
  },

  async getGrapeRankResult() {
    const response = await authenticatedFetch(`/api/auth/graperankResult`);
    if (!response.ok) {
      throw new Error(`Failed to fetch GrapeRank data (${response.status})`);
    }
    return await response.json();
  }
};
