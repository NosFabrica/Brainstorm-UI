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

  return httpServer;
}
