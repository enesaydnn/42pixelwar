# 42 Pixel War Architecture

## Decision

Use a dedicated game backend for all authority-sensitive multiplayer behavior. The database can be Supabase Postgres, Neon, Railway Postgres, or a self-hosted Postgres because the schema stays plain SQL.

Supabase is not required for the game engine. It is useful only as a managed Postgres/dashboard provider.

## Runtime Shape

```text
Browser React Canvas
  -> Game API / WebSocket server
  -> Postgres for durable state
  -> Redis for cooldown, socket/session rate limits, presence cache
  -> 42 Intra API for OAuth, campus, active location checks
```

## Why This Shape

- Pixel writes are abuse-sensitive and must never be trusted from the browser.
- The 1 pixel/second rule belongs on the backend.
- The team palette rule belongs on the backend.
- 42 `unavailable` users are blocked by active location checks, not by client UI state.
- WebSocket broadcast should send small deltas instead of full canvas state.
- Postgres stores the season, current pixels, and audit log.
- Redis absorbs high-frequency cooldown/presence checks.

## MVP Rules

- Canvas size: `500x500`.
- Teams: `42 Istanbul`, `42 Kocaeli`.
- Login: 42 OAuth only in production.
- Access: only users with active 42 location can play.
- `unavailable`: blocked.
- Color: team palette only.
- Cooldown: one accepted pixel per user per second.
- Reward: manual review note at end of season, no automatic payout in MVP.

## 42 API Gate

Production auth should do:

1. OAuth code exchange.
2. `GET /v2/me`.
3. Resolve campus and team.
4. Check active location from `/v2/users/:id/locations?filter[active]=true` or equivalent.
5. Reject if active location is missing.
6. Cache the online decision for a short TTL, then re-check during gameplay.

The app should treat `unavailable` as "no active location", not as a literal status string.

## Realtime Strategy

- On connect: send session + canvas snapshot.
- During play: broadcast only `pixel:set` deltas.
- Recompute team stats after accepted writes.
- Later optimization: batch pixel deltas every 50-100 ms under load.

## Current Scaffold

- `apps/web`: Vite React canvas client.
- `apps/server`: Fastify API and WebSocket game server.
- `packages/shared`: shared constants, message contracts, team palettes.
- `infra/postgres/schema.sql`: durable Postgres schema.
- `docker-compose.yml`: local Postgres and Redis.

The server currently includes a dev auth bypass so the canvas can be tested before real 42 OAuth credentials are added.
