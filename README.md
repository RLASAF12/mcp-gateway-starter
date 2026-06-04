# MCP Gateway Starter

> A minimal, stateless MCP (Model Context Protocol) HTTP server you can deploy in minutes.

## Why it exists

The MCP stateless core RC shipped in May 2026, making HTTP-transport MCP a production default. This template gives you **Bearer token auth**, **per-IP rate limiting**, and **URL versioning** out of the box — deploy horizontally behind any load balancer without sticky sessions or hacks.

## Quick start

npm install
cp .env.example .env   # set BEARER_TOKEN to anything secret
npm run dev            # starts on :3000

Test it immediately:
curl -X POST http://localhost:3000/v1/mcp \
  -H "Authorization: Bearer your-secret-token-here" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

## Available tools

| Tool | What it does | Required params |
|------|-------------|-----------------|
| `ping` | Returns pong + server timestamp | none |
| `echo` | Echoes your message back | `message: string` |
| `weather_stub` | Returns stub weather data (swap in your real API) | `city: string` |

## Add your own tools

1. Add a descriptor to the `tools/list` result in `src/server.ts`
2. Add a case in the `tools/call` switch block
3. Run `npm run build && npm start`

## Deploy

**Fly.io (1 command after fly launch):**
fly secrets set BEARER_TOKEN=your-token && fly deploy

**Railway:** Connect GitHub repo → set `BEARER_TOKEN` env var → deploy

**Docker:**
docker build -t mcp-gateway .
docker run -e BEARER_TOKEN=your-token -p 3000:3000 mcp-gateway

## Architecture

**Stateless by design.** No sessions, no shared state. Run 10 replicas behind a load balancer — every request is self-contained. Rate limiting is per-instance by default; swap the in-memory Map for Redis if you need distributed rate limiting across replicas.

## Security checklist before going public

- [ ] Replace the stub tools with real implementations
- [ ] Set `BEARER_TOKEN` to a strong random value (not the example)
- [ ] Add HTTPS termination at your load balancer or proxy
- [ ] Review rate limits for your expected traffic

---

Built with [Gemini 2.5-flash](https://deepmind.google/technologies/gemini/) as part of Ben's nightly builder loop.