const API_BASE = 'https://brainstormserver.nosfabrica.com';

export const apiClient = {
  async getAuthChallenge(pubkey: string): Promise<string> {
    const response = await fetch(`${API_BASE}/authChallenge/${pubkey}`);
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
    const response = await fetch(`${API_BASE}/authChallenge/${pubkey}/verify`, {
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
    const token = sessionStorage.getItem('brainstorm_session_token');
    if (!token) {
      throw new Error("No session token found");
    }
    const response = await fetch(`${API_BASE}/user/self`, {
      headers: { 'access_token': token }
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch user data (${response.status})`);
    }
    return await response.json();
  }
};
