# 42 Pixel War

Real-time campus pixel war for 42 Istanbul and 42 Kocaeli.

## Architecture

The game uses a dedicated backend as the authority for multiplayer rules:

- React canvas client
- Fastify WebSocket game server
- Postgres-compatible database
- Redis for cooldown/presence cache
- 42 Intra OAuth and active location checks

See [docs/architecture.md](./docs/architecture.md).

## Local Development

```bash
cp .env.example .env
npm install
docker compose up -d
npm run dev
```

Open:

```text
http://localhost:5173
```

The scaffold starts with `DEV_AUTH_BYPASS=true`, so local testing can use the dev team links before real 42 OAuth credentials are configured.

## Production Auth Rule

In production, a player can place pixels only if:

- 42 OAuth succeeds.
- Campus resolves to Istanbul or Kocaeli.
- Active 42 location exists.
- `unavailable` users are rejected.
- Chosen color belongs to the player's team palette.
- The backend cooldown allows the write.
