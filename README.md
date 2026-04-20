# Thornwrithe v1

Thornwrithe v1 is a single-port Next.js app shell with a custom Node HTTP/WebSocket server. The browser uses Next for the UI surface, while gameplay traffic upgrades to a WebSocket on the same origin after attach.

## Runtime Model

`pnpm dev` runs `server.ts` directly through `tsx` for local development.

`pnpm build` does two things:
- builds the Next.js app into `.next/` and emits the traced standalone bundle at `.next/standalone/`
- compiles `server.ts` to `dist/server.js`

`pnpm start` launches `dist/server.js` in production mode. That entrypoint boots Next, attaches the HTTP handler, and exposes the WebSocket server on the same port.

The current bootstrap slice is intentionally minimal:
- one HTTP port
- one custom Node server
- one Next App Router shell
- one WebSocket transport surface

## Environment Contract

Copy `.env.example` to `.env` and set the Ratio1 values before running against a live environment.

Required settings:
- `EE_CHAINSTORE_API_URL`: CStore API endpoint
- `EE_R1FS_API_URL`: R1FS API endpoint
- `R1EN_CSTORE_AUTH_HKEY`: auth namespace key
- `R1EN_CSTORE_AUTH_SECRET`: long-lived auth secret
- `R1EN_CSTORE_AUTH_BOOTSTRAP_ADMIN_PWD`: bootstrap admin password for initial setup
- `SESSION_SECRET`: session cookie signing secret
- `ATTACH_TOKEN_SECRET`: short-lived WebSocket attach token secret
- `THORNWRITHE_GAME_ID`: game identifier used by the node
- `THORNWRITHE_NODE_ID`: node identifier for presence and lease ownership
- `THORNWRITHE_HEARTBEAT_INTERVAL_MS`: heartbeat cadence for socket/session keepalive
- `THORNWRITHE_LEASE_GRACE_MS`: grace period before a stale lease can be reclaimed

## Transport Model

Thornwrithe uses a two-step attach flow:

1. The browser reaches the Next UI shell over HTTP.
2. The client obtains an attach token and upgrades to WebSocket on the same origin.
3. The server keeps the gameplay session on the socket until disconnect or takeover.

This v1 bootstrap does not add auth, persistence, or gameplay state. It only establishes the shell and the production server path.

## Verification

Run these checks from the Thornwrithe worktree:

```bash
pnpm test
pnpm lint
pnpm build
pnpm start
```

For a complete bootstrap smoke check, run:

```bash
pnpm test -- tests/unit/server-bootstrap.test.ts
pnpm lint
pnpm build
pnpm build
timeout 5s pnpm start
```

The repeated `pnpm build` proves the standalone trace output is reproducible in this worktree layout. `pnpm start` should then start `dist/server.js` successfully after a build. Use `timeout` when smoke-testing locally so the process exits after confirming the server boots.
