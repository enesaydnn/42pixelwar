import Fastify from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import { z } from "zod";
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  TRANSPARENT_COLOR,
  isColorAllowed,
  isValidCanvasPoint,
  type ClientMessage,
  type Pixel,
  type ServerMessage,
  type TeamId,
  type TeamScore
} from "@42pixelwar/shared";
import { registerAuthRoutes, getSessionFromRequest } from "./auth.js";
import { CanvasStore } from "./canvas-store.js";
import { readConfig } from "./config.js";
import { CooldownStore } from "./rate-limit.js";
import { RoundStore } from "./round-store.js";

const config = readConfig();
const app = Fastify({ logger: true });
const canvasStore = new CanvasStore();
const cooldownStore = new CooldownStore();
const roundStore = new RoundStore();
interface GameSocket {
  readyState: number;
  send: (message: string) => void;
  close: () => void;
  on(event: "message", handler: (data: Buffer | string) => void): void;
  on(event: "close", handler: () => void): void;
}

const clients = new Set<GameSocket>();

await app.register(cookie);
await app.register(cors, {
  origin: config.webOrigin,
  credentials: true
});
await app.register(websocket);
await registerAuthRoutes(app, config);

const pixelSetSchema = z.object({
  type: z.literal("pixel:set"),
  x: z.number().int(),
  y: z.number().int(),
  color: z.union([z.string().regex(/^#[0-9a-fA-F]{6}$/), z.literal(TRANSPARENT_COLOR)])
});

app.get("/health", async () => ({
  ok: true,
  canvas: {
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT
  }
}));

app.get("/canvas/snapshot", async () => ({
  width: CANVAS_WIDTH,
  height: CANVAS_HEIGHT,
  pixels: canvasStore.snapshot(),
  stats: currentStats(),
  round: roundStore.current()
}));

app.get("/ws", { websocket: true }, (socket, request) => {
  const gameSocket = socket as unknown as GameSocket;
  const session = getSessionFromRequest(request, config);

  if (!session) {
    send(gameSocket, { type: "error", code: "AUTH_REQUIRED", message: "42 session is required." });
    gameSocket.close();
    return;
  }

  clients.add(gameSocket);
  send(gameSocket, { type: "session", session });
  send(gameSocket, {
    type: "snapshot",
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    pixels: canvasStore.snapshot(),
    round: roundStore.current()
  });
  send(gameSocket, { type: "stats", teams: currentStats(), round: roundStore.current() });

  gameSocket.on("message", (data) => {
    const message = parseClientMessage(data.toString());
    if (!message) {
      send(gameSocket, { type: "error", code: "BAD_MESSAGE", message: "Unsupported client message." });
      return;
    }

    if (!isValidCanvasPoint(message.x, message.y)) {
      send(gameSocket, { type: "error", code: "OUT_OF_BOUNDS", message: "Pixel is outside the 500x500 canvas." });
      return;
    }

    if (!isColorAllowed(session.teamId, message.color)) {
      send(gameSocket, { type: "error", code: "COLOR_DENIED", message: "Color is not in your team palette." });
      return;
    }

    const cooldown = cooldownStore.check(session.userId);
    if (!cooldown.allowed) {
      send(gameSocket, {
        type: "error",
        code: "COOLDOWN",
        message: `Wait ${Math.ceil(cooldown.retryAfterMs / 1000)}s before placing another pixel.`
      });
      return;
    }

    if (message.color === TRANSPARENT_COLOR) {
      canvasStore.clearPixel(message.x, message.y);
      broadcast({ type: "pixel:clear", x: message.x, y: message.y });
      broadcastStats();
      return;
    }

    const pixel: Pixel = canvasStore.setPixel({
      x: message.x,
      y: message.y,
      color: message.color.toLowerCase(),
      teamId: session.teamId,
      placedBy: session.userId,
      placedAt: new Date().toISOString()
    });

    broadcast({ type: "pixel:set", pixel });
    const stats = currentStats();
    broadcast({ type: "stats", teams: stats, round: roundStore.current() });
    if (roundStore.isCompleted(stats)) {
      advanceRound(stats, "completed");
    }
  });

  gameSocket.on("close", () => {
    clients.delete(gameSocket);
  });
});

await app.listen({ port: config.port, host: "0.0.0.0" });

setInterval(() => {
  if (roundStore.isExpired()) {
    advanceRound(currentStats(), "expired");
  }
}, 5000).unref();

function parseClientMessage(data: unknown): ClientMessage | null {
  if (typeof data !== "string") {
    return null;
  }

  try {
    return pixelSetSchema.parse(JSON.parse(data));
  } catch {
    return null;
  }
}

function send(socket: GameSocket, message: ServerMessage): void {
  if (socket.readyState === 1) {
    socket.send(JSON.stringify(message));
  }
}

function broadcast(message: ServerMessage): void {
  for (const client of clients) {
    send(client, message);
  }
}

function currentStats(): Record<TeamId, TeamScore> {
  return canvasStore.stats(roundStore.current().target);
}

function broadcastStats(): void {
  broadcast({ type: "stats", teams: currentStats(), round: roundStore.current() });
}

function advanceRound(stats: Record<TeamId, TeamScore>, reason: "completed" | "expired"): void {
  const nextRound = roundStore.finish(stats, reason);
  canvasStore.clear();
  broadcast({ type: "round", round: nextRound });
  broadcast({
    type: "snapshot",
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    pixels: [],
    round: nextRound
  });
  broadcastStats();
  app.log.info({ round: nextRound.roundNumber, target: nextRound.target.id, reason }, "round advanced");
}
