import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import WebSocket from "ws";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  app.get("/api/profile/:pubkey", async (req, res) => {
    const { pubkey } = req.params;
    if (!pubkey || !/^[0-9a-f]{64}$/i.test(pubkey)) {
      return res.status(400).json({ error: "Invalid pubkey" });
    }

    const relays = [
      "wss://relay.damus.io",
      "wss://relay.nostr.band",
      "wss://nos.lol",
      "wss://relay.primal.net",
      "wss://purplepag.es",
      "wss://relay.nostr.info",
      "wss://nostr.wine",
      "wss://relay.snort.social",
    ];

    function fetchFromRelay(relayUrl: string): Promise<any | null> {
      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          try { ws.close(); } catch {}
          resolve(null);
        }, 8000);

        let ws: WebSocket;
        try {
          ws = new WebSocket(relayUrl);
        } catch {
          clearTimeout(timeout);
          resolve(null);
          return;
        }

        let resolved = false;

        ws.on("open", () => {
          const subId = "p_" + Math.random().toString(36).slice(2, 8);
          ws.send(JSON.stringify(["REQ", subId, { kinds: [0], authors: [pubkey], limit: 1 }]));
        });

        ws.on("message", (raw: Buffer) => {
          try {
            const data = JSON.parse(raw.toString());
            if (data[0] === "EVENT" && data[2]) {
              resolved = true;
              clearTimeout(timeout);
              try { ws.close(); } catch {}
              resolve(data[2]);
            } else if (data[0] === "EOSE") {
              if (!resolved) {
                clearTimeout(timeout);
                try { ws.close(); } catch {}
                resolve(null);
              }
            }
          } catch {}
        });

        ws.on("error", () => {
          if (!resolved) {
            clearTimeout(timeout);
            resolve(null);
          }
        });

        ws.on("close", () => {
          if (!resolved) {
            clearTimeout(timeout);
            resolve(null);
          }
        });
      });
    }

    async function fetchFromHttpApi(): Promise<any | null> {
      try {
        const resp = await fetch(`https://api.nostr.band/v0/profiles/${pubkey}`, {
          signal: AbortSignal.timeout(8000),
        });
        if (resp.ok) {
          const data = await resp.json();
          if (data?.profiles?.[0]?.event) {
            return data.profiles[0].event;
          }
        }
      } catch {}

      try {
        const resp = await fetch(`https://purplepag.es/api/profiles/${pubkey}`, {
          signal: AbortSignal.timeout(8000),
        });
        if (resp.ok) {
          const data = await resp.json();
          if (data?.event) {
            return data.event;
          }
        }
      } catch {}

      return null;
    }

    try {
      const relayRace = Promise.any(
        relays.map((url) =>
          fetchFromRelay(url).then((ev) => {
            if (ev) return ev;
            throw new Error("no profile");
          })
        )
      ).catch(() => null);

      const httpFetch = fetchFromHttpApi();

      const result = await Promise.any([
        relayRace.then((ev) => {
          if (ev) return ev;
          throw new Error("no result");
        }),
        httpFetch.then((ev) => {
          if (ev) return ev;
          throw new Error("no result");
        }),
      ]).catch(() => null);

      return res.json({ event: result });
    } catch (err) {
      return res.json({ event: null });
    }
  });

  app.get("/api/nip05", async (req, res) => {
    const { name, domain } = req.query;
    if (!name || !domain || typeof name !== "string" || typeof domain !== "string") {
      return res.status(400).json({ error: "Missing name or domain" });
    }
    if (!/^[a-zA-Z0-9._-]+$/.test(name) || !/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(domain)) {
      return res.status(400).json({ error: "Invalid name or domain format" });
    }
    try {
      const url = `https://${domain}/.well-known/nostr.json?name=${encodeURIComponent(name)}`;
      const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!resp.ok) {
        return res.status(404).json({ error: "NIP-05 lookup failed" });
      }
      const data = await resp.json();
      const pubkey = data?.names?.[name] || data?.names?.[name.toLowerCase()];
      if (!pubkey || !/^[0-9a-f]{64}$/i.test(pubkey)) {
        return res.status(404).json({ error: "Handle not found" });
      }
      return res.json({ pubkey });
    } catch {
      return res.status(502).json({ error: "Could not resolve NIP-05 handle" });
    }
  });

  const BRAINSTORM_API = 'https://brainstormserver.nosfabrica.com';

  app.get("/api/auth/challenge/:pubkey", async (req, res) => {
    const { pubkey } = req.params;
    try {
      const resp = await fetch(`${BRAINSTORM_API}/authChallenge/${pubkey}`);
      const data = await resp.json();
      return res.status(resp.status).json(data);
    } catch (err) {
      return res.status(502).json({ error: "Failed to reach auth server" });
    }
  });

  app.post("/api/auth/verify/:pubkey", async (req, res) => {
    const { pubkey } = req.params;
    try {
      const resp = await fetch(`${BRAINSTORM_API}/authChallenge/${pubkey}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body)
      });
      const data = await resp.json();
      return res.status(resp.status).json(data);
    } catch (err) {
      return res.status(502).json({ error: "Failed to reach auth server" });
    }
  });

  app.get("/api/auth/self", async (req, res) => {
    const token = req.headers['x-brainstorm-token'] as string;
    if (!token) {
      return res.status(401).json({ error: "No token provided" });
    }
    try {
      const resp = await fetch(`${BRAINSTORM_API}/user/self`, {
        headers: { 'access_token': token },
        signal: AbortSignal.timeout(60000),
      });
      const data = await resp.json();
      return res.status(resp.status).json(data);
    } catch (err: any) {
      if (err?.name === "TimeoutError" || err?.name === "AbortError") {
        return res.status(504).json({ error: "Request timed out — large accounts may take longer. Please try again." });
      }
      return res.status(502).json({ error: "Failed to reach auth server" });
    }
  });

  app.get("/api/user/:pubkey", async (req, res) => {
    const { pubkey } = req.params;
    if (!pubkey || !/^[0-9a-f]{64}$/i.test(pubkey)) {
      return res.status(400).json({ error: "Invalid pubkey" });
    }
    const token = req.headers['x-brainstorm-token'] as string;
    if (!token) {
      return res.status(401).json({ error: "No token provided" });
    }
    try {
      const resp = await fetch(`${BRAINSTORM_API}/user/${pubkey}`, {
        headers: { 'access_token': token },
        signal: AbortSignal.timeout(60000),
      });
      const data = await resp.json();
      return res.status(resp.status).json(data);
    } catch (err: any) {
      if (err?.name === "TimeoutError" || err?.name === "AbortError") {
        return res.status(504).json({ error: "Request timed out — large accounts may take longer. Please try again." });
      }
      return res.status(502).json({ error: "Failed to reach API server" });
    }
  });

  app.post("/api/auth/graperank", async (req, res) => {
    const token = req.headers['x-brainstorm-token'] as string;
    if (!token) {
      return res.status(401).json({ error: "No token provided" });
    }
    try {
      const resp = await fetch(`${BRAINSTORM_API}/user/graperank`, {
        method: 'POST',
        headers: { 'access_token': token }
      });
      const data = await resp.json();
      return res.status(resp.status).json(data);
    } catch (err) {
      return res.status(502).json({ error: "Failed to reach API server" });
    }
  });

  app.post("/api/publish", async (req, res) => {
    const { event } = req.body;
    if (!event || !event.id || !event.sig || !event.pubkey || !event.kind || !Array.isArray(event.tags)) {
      return res.status(400).json({ error: "Invalid signed event: missing required fields" });
    }

    if (typeof event.kind !== "number" || typeof event.pubkey !== "string" || typeof event.sig !== "string" || typeof event.id !== "string") {
      return res.status(400).json({ error: "Invalid signed event: malformed fields" });
    }

    if (!/^[0-9a-f]{64}$/i.test(event.id) || !/^[0-9a-f]{128}$/i.test(event.sig) || !/^[0-9a-f]{64}$/i.test(event.pubkey)) {
      return res.status(400).json({ error: "Invalid signed event: invalid hex values" });
    }

    const publishRelays = [
      "wss://relay.damus.io",
      "wss://relay.nostr.band",
      "wss://nos.lol",
      "wss://relay.primal.net",
      "wss://purplepag.es",
    ];

    const relayPromises = publishRelays.map(
      (relayUrl) =>
        new Promise<{ relay: string }>((resolve, reject) => {
          const timeout = setTimeout(() => {
            try { ws.close(); } catch {}
            reject(new Error("timeout"));
          }, 10000);

          const ws = new WebSocket(relayUrl);

          ws.on("open", () => {
            ws.send(JSON.stringify(["EVENT", event]));
          });

          ws.on("message", (raw: Buffer) => {
            try {
              const data = JSON.parse(raw.toString());
              if (Array.isArray(data) && data[0] === "OK") {
                clearTimeout(timeout);
                try { ws.close(); } catch {}
                resolve({ relay: relayUrl });
              }
            } catch {}
          });

          ws.on("error", () => {
            clearTimeout(timeout);
            try { ws.close(); } catch {}
            reject(new Error("error"));
          });
        })
    );

    try {
      const result = await Promise.any(relayPromises);
      return res.json({ success: true, relay: result.relay });
    } catch {
      return res.status(502).json({ error: "Failed to publish to any relay" });
    }
  });

  app.get("/api/auth/graperankResult", async (req, res) => {
    const token = req.headers['x-brainstorm-token'] as string;
    if (!token) {
      return res.status(401).json({ error: "No token provided" });
    }
    try {
      const resp = await fetch(`${BRAINSTORM_API}/user/graperankResult`, {
        headers: { 'access_token': token }
      });
      const data = await resp.json();
      return res.status(resp.status).json(data);
    } catch (err) {
      return res.status(502).json({ error: "Failed to reach auth server" });
    }
  });

  return httpServer;
}
